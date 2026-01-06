/* eslint-disable no-restricted-syntax */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-inner-declarations */
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import BadRequest from 'zillit-libs/errors/BadRequest';
import { getMessage } from 'zillit-libs/locales';
import SesService from 'zillit-libs/services-v2/ses';
import { constants } from 'zillit-libs/config';
import NotificationService from 'zillit-libs/services-v2/notification';
import NotificationRepository from 'zillit-libs/repositories-v2/notification';
import EventDetailRepository from 'zillit-libs/repositories-v2/event-details';
import axios from 'axios';
import ProjectUserRepository from '../../repositories/v2/project-user';
import DepartmentRepository from '../../repositories/v2/department';
import EventRepository from '../../repositories/v2/event';
import PreProductionRepository from '../../repositories/v2/pre-production';
import ProductionRepository from '../../repositories/v2/production';
import ChatRoomRepository from '../../repositories/v2/chat-room';
import HomeUnitRepository from '../../repositories/v2/home-unit';
import socketClient from '../../config/socketClient';
import { getUrls } from './config';

const commonConfig = {
  method: 'post',
  maxBodyLength: Infinity,
};

const { sections, tools } = NotificationService.NotificationConstants;

const _getCalendarUnit = ({ project }) => HomeUnitRepository.fetchHomeUnit({ filters: { project_id: project._id, identifier: 'home_unit_calendar' } });
const _formatEmail = (email) => (Array.isArray(email) ? email.map((e) => e.mail) : []);

// Function to format a single date-time range
function formatDateTimeRange(start, end, timeZone) {
  return `${momentTimezone(start).tz(timeZone).format('MMM, Do YYYY')}, ${momentTimezone(start).tz(timeZone).format('hh:mm A')} - ${momentTimezone(end).tz(timeZone).format('hh:mm A')} (${momentTimezone(start).tz(timeZone).format('z')})`;
}

// Function to format recurring date-time ranges
function formatDateTimeRanges(start, end, repeatEnd, timeZone) {
  return `${momentTimezone(start).tz(timeZone).format('hh:mm A')} to ${momentTimezone(end).tz(timeZone).format('hh:mm A')} from ${momentTimezone(start).tz(timeZone).format('ddd, Do MMM')} to ${momentTimezone(repeatEnd).tz(timeZone).format('ddd, Do MMM')} (${momentTimezone(start).tz(timeZone).format('z')})`;
}

function formatDateTimeRangeSeparate(start, end, timeZone) {
  return {
    date: `${momentTimezone(start).tz(timeZone).format('MMM Do YYYY')}`, // e.g., "Friday Jan 02, 2025"
    time: ` ${momentTimezone(start).tz(timeZone).format('hh:mm A')} - ${momentTimezone(end).tz(timeZone).format('hh:mm A')} (${momentTimezone(start).tz(timeZone).format('z')})`, // e.g., "1:45 PM - 2:45 PM (PDT)"
  };
}

function formatDateTimeWeekly(start, end, repeatEnd, timeZone) {
  return `${momentTimezone(start).tz(timeZone).format('dddd')} at ${momentTimezone(start).tz(timeZone).format('LT')}  to ${momentTimezone(end).tz(timeZone).format('LT')}  till ${momentTimezone(repeatEnd).tz(timeZone).format('Do MMMM YYYY')} (${momentTimezone(start).tz(timeZone).format('z')})`;
}

function formatDateTimeMonthly(start, end, repeatEnd, timeZone) {
  return `${momentTimezone(start).tz(timeZone).format('LT')} to ${momentTimezone(end).tz(timeZone).format('LT')} on day ${momentTimezone(start).tz(timeZone).format('Do')} from ${momentTimezone(start).tz(timeZone).format('ddd, Do MMM, YYYY')} to ${momentTimezone(repeatEnd).tz(timeZone).format('ddd, Do MMM, YYYY')} (${momentTimezone(start).tz(timeZone).format('z')})`;
}

function formatDateTimeYearly(start, end, repeatEnd, timeZone) {
  return `${momentTimezone(start).tz(timeZone).format('LT')} to ${momentTimezone(end).tz(timeZone).format('LT')} on ${momentTimezone(start).tz(timeZone).format('Do MMMM')} till ${momentTimezone(repeatEnd).tz(timeZone).format('Do MMMM YYYY')} (${momentTimezone(start).tz(timeZone).format('z')})`;
}

function formatDateTimeWeeklyCustom(start, end, repeatEnd, days, timeZone) {
  //  Get the days of the week based on selectedDays
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formattedDays = days.map((day) => weekdays[day]).join(', ');

  return `${momentTimezone(start).tz(timeZone).format('LT')} to ${momentTimezone(end).tz(timeZone).format('LT')} on ${formattedDays} from ${momentTimezone(start).tz(timeZone).format('Do MMMM YYYY')} till ${momentTimezone(repeatEnd).tz(timeZone).format('Do MMMM YYYY')} (${momentTimezone(start).tz(timeZone).format('z')})`;
}
const _checkActiveStatus = ({ start_datetime: onlyStartDate, end_datetime: onlyEndDate }) => {
  const currentDate = Date.now();
  return onlyStartDate <= currentDate && onlyEndDate >= currentDate;
};

const _invitedUsers = async (project, invitedUsers) => {
  const userIds = invitedUsers.map((invitedUser) => invitedUser.user_id);
  const users = await ProjectUserRepository.fetchProjectUsers({
    filters: {
      project_id: project._id, _id: { $in: userIds }, status: constants.userStatus.accepted,
    },
  });
  return users.map((user) => ({
    status: 'pending',
    keepNamePrivate: user.keep_name_private,
    user_id: user._id,
  }));
};

// _currentRecurringPattern function is use for creates eventDetails
async function _currentRecurringPattern(projectId, eventId, reqData, user, userIds, moduledata, groupId = null) {
  const {
    start_datetime: onlyStartDate,
    end_datetime: onlyEndDate,
    notify,
    full_day: fullDay,
    title,
    timezone,
    description,
    location,
    isProduction,
    location_description: locationDescription,
    invited_users: invitedUsers,
    selectedDays,
    color,
    email,
    createUser_exclude: createUserExclude,
    call_type: callType,
    repeat_status: repeatStatus,
  } = reqData;
  let { repeat_end_date: repeatEndDate } = reqData;
  if (parseInt(repeatStatus, 10) === 6) {
    repeatEndDate = 3286915140000;
  }
  const micSecBeforeNotification = notify * 1000;
  let nextReminder = 0;
  let cncCallGroupID = groupId; // Use existing groupId if available

  if (!cncCallGroupID && reqData.call_type !== '') {
    const config = {
      ...commonConfig,
      headers: { moduledata },
      data: {
        room_name: title,
        owned_by: user._id,
        members: [...userIds, user._id.toString()],
        is_random_call_group: true,
        is_calendar_call_group: true,
      },
    };

    config.url = `${getUrls('CNC_BASE_URL')}/v2/chat-room`;

    try {
      const cncResponse = await axios.request(config);

      cncCallGroupID = cncResponse.data.data.chat_room._id;
    } catch (error) {
      console.error('Error creating chat room:', error);
    }
  }

  const eventDetailData = {
    project_id: projectId,
    event_id: eventId,
    start_datetime: onlyStartDate,
    end_datetime: onlyEndDate,
    repeat_end_date: repeatEndDate,
    next_reminder: nextReminder,
    notify,
    repeat_status: repeatStatus,
    call_type: callType,
    title,
    timezone,
    description,
    location,
    color,
    email,
    isProduction,
    location_description: locationDescription,
    full_day: fullDay,
    createUser_exclude: createUserExclude,
    group_id: cncCallGroupID,
    invited_users: invitedUsers,
  };

  if (parseInt(repeatStatus, 10) === 0) {
    if (eventDetailData.notify !== 0) {
      eventDetailData.next_reminder = eventDetailData.start_datetime - micSecBeforeNotification;
    } else {
      eventDetailData.next_reminder = 0;
    }

    const filter = { 'messages._id': reqData.reference_id };

    const eventDetailDatas = await EventDetailRepository.createEventDetail(eventDetailData);

    const data = {
      'messages.$.start_datetime': reqData.start_datetime,
      'messages.$.end_datetime': reqData.end_datetime,
      'messages.$.call_type': reqData.call_type,
      'messages.$.notify': reqData.notify,
      'messages.$.timezone': reqData.timezone,
      'messages.$.location': reqData.location,
      'messages.$.location_description': reqData.location_description,
      'messages.$.repeat_end_date': reqData.repeat_end_date,
      'messages.$.event_id': eventDetailDatas.event_id,
    };

    const boxData = {
      start_datetime: reqData.start_datetime,
      end_datetime: reqData.end_datetime,
      call_type: reqData.call_type,
      notify: reqData.notify,
      timezone: reqData.timezone,
      location: reqData.location,
      location_description: reqData.location_description,
      repeat_end_date: reqData.repeat_end_date,
      event_id: eventDetailDatas.event_id,
    };

    if (reqData.isProduction === true) {
      await ProductionRepository.updateProduction({ filters: filter, data });
    } else {
      await PreProductionRepository.updatePreProduction({ filters: filter, data });
      await PreProductionRepository.updatePreProductionEvent({ filters: { _id: reqData.reference_id }, data: boxData });
    }
  } else {
    if (eventDetailData.notify !== 0) {
      eventDetailData.next_reminder = eventDetailData.start_datetime - micSecBeforeNotification;
    }

    nextReminder = eventDetailData.next_reminder;

    // await EventDetailRepository.createEventDetail(eventDetailData);

    const createEventDetails = [];
    if (parseInt(repeatStatus, 10) === 5 && selectedDays.length > 0) {
      selectedDays.forEach((currentDay) => {
        const timezoneKey = eventDetailData.timezone || 'UTC'; // Default to UTC if no timezone key is provided

        const startDateTime = momentTimezone(onlyStartDate).tz(timezoneKey);
        const endDateTime = momentTimezone(onlyEndDate).tz(timezoneKey);

        let daysToAdd = currentDay - startDateTime.day();
        if (daysToAdd < 0) daysToAdd += 7;

        const startDateTimeLocal = startDateTime.clone().add(daysToAdd, 'days').utcOffset(timezoneKey);
        const endDateTimeLocal = endDateTime.clone().add(daysToAdd, 'days').utcOffset(timezoneKey);

        while (startDateTimeLocal.valueOf() <= repeatEndDate) {
          const newEventDetailData = { ...eventDetailData };

          newEventDetailData.start_datetime = startDateTimeLocal.valueOf();
          newEventDetailData.end_datetime = endDateTimeLocal.valueOf();

          if (eventDetailData.notify === 0) {
            newEventDetailData.next_reminder = 0;
          } else {
            newEventDetailData.next_reminder = startDateTimeLocal.valueOf() - micSecBeforeNotification;
          }

          newEventDetailData.invited_users = invitedUsers;

          createEventDetails.push(newEventDetailData);

          startDateTimeLocal.add(7, 'days');
          endDateTimeLocal.add(7, 'days');
        }
      });
    } else {
      let incrementCounter = 0;
      let ts = 0;
      let tse = 0;
      const intervalMap = {
        1: 'd',
        2: 'w',
        3: 'M',
        4: 'Y',
        6: 'Y',
      };
      await EventDetailRepository.createEventDetail(eventDetailData);
      while (new Date(nextReminder) <= repeatEndDate) {
        incrementCounter += 1;
        const interval = intervalMap[repeatStatus] || 'd';
        ts = moment(onlyStartDate).add(incrementCounter, interval).valueOf();
        tse = moment(onlyEndDate).add(incrementCounter, interval).valueOf();
        nextReminder = new Date(ts);
        if (nextReminder < repeatEndDate) {
          const newEventDetailData = { ...eventDetailData };
          newEventDetailData.repeat_status = repeatStatus;

          const startDateTimeUTC = new Date(onlyStartDate);
          const endDateTimeUTC = new Date(onlyEndDate);

          switch (parseInt(repeatStatus, 10)) {
          case 1: // Daily
            startDateTimeUTC.setDate(startDateTimeUTC.getDate() + incrementCounter);
            endDateTimeUTC.setDate(endDateTimeUTC.getDate() + incrementCounter);
            break;
          case 2: // Weekly
            startDateTimeUTC.setDate(startDateTimeUTC.getDate() + incrementCounter * 7);
            endDateTimeUTC.setDate(endDateTimeUTC.getDate() + incrementCounter * 7);
            break;
          case 3: // Monthly
            if (startDateTimeUTC.getDate() !== 31) {
              startDateTimeUTC.setMonth(startDateTimeUTC.getMonth() + incrementCounter);
              endDateTimeUTC.setMonth(endDateTimeUTC.getMonth() + incrementCounter);
            } else if (startDateTimeUTC.getDate() === 31) {
              const nextMonth = new Date(ts);
              nextMonth.setDate(31); // Set to 31st of the month
              if (nextMonth.getDate() === 31) {
                startDateTimeUTC.setMonth(startDateTimeUTC.getMonth() + incrementCounter);
                endDateTimeUTC.setMonth(endDateTimeUTC.getMonth() + incrementCounter);
              } else {
              // If next month doesn't have 31 days, skip event creation
                // eslint-disable-next-line no-continue
                continue;
              }
            }
            break;
          case 4: // Yearly
            startDateTimeUTC.setFullYear(startDateTimeUTC.getFullYear() + incrementCounter);
            endDateTimeUTC.setFullYear(endDateTimeUTC.getFullYear() + incrementCounter);
            break;
          case 6: // Never
            startDateTimeUTC.setFullYear(startDateTimeUTC.getFullYear() + incrementCounter);
            endDateTimeUTC.setFullYear(endDateTimeUTC.getFullYear() + incrementCounter);
            break;
          default:
            break;
          }

          startDateTimeUTC.setHours(
            new Date(ts).getHours(),
            new Date(ts).getMinutes(),
            new Date(ts).getSeconds(),
          );
          endDateTimeUTC.setHours(
            new Date(tse).getHours(),
            new Date(tse).getMinutes(),
            new Date(tse).getSeconds(),
          );

          newEventDetailData.start_datetime = startDateTimeUTC.getTime();
          newEventDetailData.end_datetime = endDateTimeUTC.getTime();

          if (eventDetailData.notify === 0) {
            newEventDetailData.next_reminder = 0;
          } else {
            newEventDetailData.next_reminder = newEventDetailData.start_datetime - micSecBeforeNotification;
          }
          newEventDetailData.invited_users = invitedUsers;

          createEventDetails.push(newEventDetailData);
        }
      }
    }
    await EventDetailRepository.createEventDetail(createEventDetails);
  }
  return { eventDetailData };
}

async function _createEventList(allEvents) {
  const result = await Promise.all(
    allEvents.map(async (event) => {
      const evt = { ...event._doc }; // Avoid modifying original event

      const eventDetails = await EventDetailRepository.fetchEventDetails({
        filters: { event_id: evt._id },
      });

      const activeEvents = eventDetails
        .filter((evts) => evts.end_datetime > Date.now())
        .map((ev) => ({
          ...ev._doc,
          email: Array.isArray(ev.email) ? ev.email.map((e) => e.mail) : [],
        }));

      const expiredEvents = eventDetails
        .filter((evts) => evts.end_datetime <= Date.now())
        .map((ev) => ({
          ...ev._doc,
          email: Array.isArray(ev.email) ? ev.email.map((e) => e.mail) : [],
        }));

      return {
        ...evt,
        eventDetail: activeEvents,
        expired_events: expiredEvents,
      };
    }),
  );

  return result;
}

const _validateUsers = (approvedUsers, invitedUsers) => {
  if (approvedUsers.length !== invitedUsers.length) {
    throw new BadRequest('calendar_user_inactive');
  }
};

const _createUserEvent = async (result, project, device, user, moduledata) => {
  const userIds = result.invited_users.map((iu) => iu.user_id.toString());
  const approvedUsers = await ProjectUserRepository.fetchProjectUsers({
    filters: {
      _id: { $in: userIds },
      project_id: project._id,
      status: constants.userStatus.accepted,
    },
  });

  _validateUsers(approvedUsers, result.invited_users);

  const departmentName = await DepartmentRepository.fetchDepartment(
    { filters: { _id: user.department_id } },
  );

  const updatedResult = {
    ...result,
    project_id: project._id,
    created_by: user._id,
    created_by_dept: departmentName.department_name,
    still_active: _checkActiveStatus(result),
  };

  const invitedUsersMapped = await _invitedUsers(project, result.invited_users);

  updatedResult.invited_users = invitedUsersMapped;

  // if (result.reference_id) {
  //   const oldPreProductionEvents = await EventRepository.fetchEvents(
  //     { filters: { project_id: project._id, reference_id: result.reference_id } },
  //   );
  //   await Promise.all(
  //     oldPreProductionEvents.map(async (oldEvent) => {
  //       await EventRepository.deleteEvent(
  //         { filters: { _id: oldEvent._id, project_id: oldEvent.project_id } },
  //       );
  //       await EventDetailRepository.deleteEventDetails(
  //         { filters: { event_id: oldEvent._id, project_id: oldEvent.project_id } },
  //       );
  //     }),
  //   );
  // }

  // Notify all users about calendar invite
  const calendarUnit = await _getCalendarUnit({ project }).select('_id');
  const saveResult = await EventRepository.createEvents(updatedResult);

  let combinedData = {};
  let referenceData = {};
  let recurringPatternData;
  if (saveResult) {
    const {
      _id, repeat_end_date: repeatEndDate, selectedDays, created, updated, deleted,
    } = saveResult;

    recurringPatternData = await _currentRecurringPattern(project._id, _id, updatedResult, user, userIds, moduledata);
    combinedData = {
      eventId: recurringPatternData.eventDetailData.event_id,
      startDateTime: recurringPatternData.eventDetailData.start_datetime,
      endDateTime: recurringPatternData.eventDetailData.end_datetime,
      repeatStatus: recurringPatternData.eventDetailData.repeat_status,
      title: recurringPatternData.eventDetailData.title,
      timezone: recurringPatternData.eventDetailData.timezone,
      description: recurringPatternData.eventDetailData.description,
      location: recurringPatternData.eventDetailData.location,
      call_type: recurringPatternData.eventDetailData.call_type,
      locationDescription: recurringPatternData.eventDetailData.location_description,
      repeatEndDate,
      selectedDays,
      createUserExclude: recurringPatternData.eventDetailData.createUser_exclude,
    };

    referenceData = {
      _id,
      start_datetime: recurringPatternData.eventDetailData?.start_datetime,
      end_datetime: recurringPatternData.eventDetailData?.end_datetime,
      created,
      updated,
      deleted,
      event_id: recurringPatternData.eventDetailData?.event_id,
      title: recurringPatternData.eventDetailData?.title,
      description: recurringPatternData.eventDetailData?.description,
      timezone: recurringPatternData.eventDetailData?.timezone,
      repeat_status: recurringPatternData.eventDetailData?.repeat_status,
      full_day: recurringPatternData.eventDetailData?.full_day,
    };

    if (!project.deleted) {
      const payload = {
        project,
        device,
        sender: user._id,
        receiver: userIds,
        section: sections.HOME,
        tool: tools.CALENDAR,
        unit: calendarUnit._id,
        action: 'calendar_invite_users',
        reference_id: _id,
        reference_data: {
          expired: repeatEndDate,
          calendar_data: referenceData,
          messageElements: [
            { search: '{{user_name}}', replacer: user.full_name },
            { search: '{{event_title}}', replacer: updatedResult.title },
          ],
        },
      };
      NotificationService.notifyAll(payload, {}, socketClient);

      // Send global notification
      const globalPayload = {
        project,
        device,
        sender: user._id,
        receiver: userIds,
        section: sections.GLOBAL,
        tool: tools.DEFAULT,
        unit: calendarUnit._id,
        action: 'calendar_invite_users',
        is_global: true,
        reference_id: _id,
        reference_data: {
          expired: repeatEndDate,
          calendar_data: referenceData,
          messageElements: [
            { search: '{{user_name}}', replacer: user.full_name },
            { search: '{{event_title}}', replacer: updatedResult.title },
          ],
        },
      };
      NotificationService.notifyAll(globalPayload, { silent: true }, socketClient);
    }
  }

  const observerUser = [...userIds, user._id.toString()];

  const userEvent = await _createEventList([saveResult], project, user);
  socketClient('__admin_events__', {
    event: 'create:event',
    room: observerUser,
    data: {
      project_id: project._id,
      user_id: user._id,
      device_id: device._id,
      unit_id: calendarUnit._id,
      type: Number(!result.invited_users?.length),
    },
  });

  let chatRoomData;
  const groupIds = [
    ...new Set(
      userEvent.flatMap((item) => item.eventDetail
        .filter((event) => event.group_id) // Ensure group_id exists
        .map((event) => event.group_id)),
    ),
  ];

  if (groupIds.length > 0) {
    chatRoomData = await ChatRoomRepository.fetchChatRoom({ filters: { _id: groupIds[0] } });
  }

  const emails = Array.isArray(result.email)
    ? result.email.map((item) => item.mail)
    : [];

  const userId = recurringPatternData.eventDetailData.invited_users.map((invitedUser) => invitedUser.user_id);
  userId.push(user._id);

  const users = await ProjectUserRepository.fetchProjectUsers({
    filters: {
      project_id: project._id, _id: { $in: userId },
    },
  });
  const fullNames = users.map((person) => person.full_name);
  fullNames.push(...emails);

  // Format combined data
  const formattedDateTime = formatDateTimeRange(combinedData.startDateTime, combinedData.endDateTime, combinedData.timezone);

  const formattedDateTimes = formatDateTimeRanges(
    combinedData.startDateTime,
    combinedData.endDateTime,
    combinedData.repeatEndDate,
    combinedData.timezone,
  );

  // Example Usage
  const { date, time } = formatDateTimeRangeSeparate(
    combinedData.startDateTime,
    combinedData.endDateTime,
    combinedData.timezone,
  );

  const excluded = getMessage(project.project_language, 'calendar_excluded');
  const fullNamesFormatted = fullNames.join('<br>');
  // Determine the subject
  if (emails.length > 0) {
    let subject;
    let message;
    if (combinedData.repeatStatus === 0) {
      subject = getMessage(
        project.project_language,
        `Zillit Invitation: ${combinedData.title} @ ${formattedDateTime} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', combinedData.title)
        .replace('{{formatted_date_time}}', formattedDateTime)
        .replace('{{event_description}}', combinedData.description)
        .replace('{{user_full_name}}', user.full_name + (combinedData.createUserExclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if (chatRoomData && ['audio', 'video', 'meet_in_person_call'].includes(combinedData.call_type)) {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (combinedData.repeatStatus === 1) {
      subject = getMessage(
        project.project_language,
        `Zillit Invitation: ${combinedData.title} @ Daily from ${formattedDateTimes} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', combinedData.title)
        .replace('{{formatted_date_time}}', formattedDateTimes)
        .replace('{{event_description}}', combinedData.description)
        .replace('{{user_full_name}}', user.full_name + (combinedData.createUserExclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && combinedData.call_type === 'audio') || combinedData.call_type === 'video' || combinedData.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (combinedData.repeatStatus === 2) {
      subject = getMessage(
        project.project_language,
        `Zillit Invitation: ${combinedData.title} @ Weekly on ${formatDateTimeWeekly(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', combinedData.title)
        .replace('{{formatted_date_time}}', formatDateTimeWeekly(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.timezone))
        .replace('{{event_description}}', combinedData.description)
        .replace('{{user_full_name}}', user.full_name + (combinedData.createUserExclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && combinedData.call_type === 'audio') || combinedData.call_type === 'video' || combinedData.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (combinedData.repeatStatus === 3) {
      subject = getMessage(
        project.project_language,
        `Zillit Invitation: ${combinedData.title} @ Monthly from ${formatDateTimeMonthly(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', combinedData.title)
        .replace('{{formatted_date_time}}', formatDateTimeMonthly(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.timezone))
        .replace('{{event_description}}', combinedData.description)
        .replace('{{user_full_name}}', user.full_name + (combinedData.createUserExclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && combinedData.call_type === 'audio') || combinedData.call_type === 'video' || combinedData.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (combinedData.repeatStatus === 4) {
      subject = getMessage(
        project.project_language,
        `Zillit Invitation: ${combinedData.title} @ Annually from ${formatDateTimeYearly(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', combinedData.title)
        .replace('{{formatted_date_time}}', formatDateTimeYearly(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.timezone))
        .replace('{{event_description}}', combinedData.description)
        .replace('{{user_full_name}}', user.full_name + (combinedData.createUserExclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && combinedData.call_type === 'audio') || combinedData.call_type === 'video' || combinedData.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (combinedData.repeatStatus === 5) {
      subject = getMessage(
        project.project_language,
        `Zillit Invitation: ${combinedData.title} @ Weekly from ${formatDateTimeWeeklyCustom(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.selectedDays, combinedData.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', combinedData.title)
        .replace(
          '{{formatted_date_time}}',
          formatDateTimeWeeklyCustom(combinedData.startDateTime, combinedData.endDateTime, combinedData.repeatEndDate, combinedData.selectedDays, combinedData.timezone),
        )
        .replace('{{event_description}}', combinedData.description)
        .replace('{{user_full_name}}', user.full_name + (combinedData.createUserExclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && combinedData.call_type === 'audio') || combinedData.call_type === 'video' || combinedData.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    }

    // Remove button if no guest link
    if (
      !chatRoomData?.guest_invite_link
  || !['audio', 'video', 'meet_in_person_call'].includes(combinedData.call_type)
    ) {
      message = message.replace(
        /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
        '',
      );
    }

    // Send the email
    for (const emailObj of result.email) {
      // Ensure guest link is valid before replacing
      const inviteLink = chatRoomData?.guest_invite_link
        ? `${chatRoomData.guest_invite_link}?id=${emailObj._id}`
        : '';

      const personalizedMessage = message.replace('{{zillit_meet_link}}', inviteLink);

      const ses = new SesService({
        to: [emailObj.mail], // corrected from emailObj.email
        subject,
        html: personalizedMessage,
        replyTo: user.mail_box_detail.email_address,
      });

      ses.sendEmail();
    }
  }
  return userEvent;
};

const createEvent = async ({
  project, device, user, reqBody, moduledata,
}) => {
  const result = { ...reqBody };
  return _createUserEvent(result, project, device, user, moduledata);
};

const getEvent = async ({
  project, user, eventId,
}) => {
  const event = await EventRepository.getEventById({ filters: eventId });
  if (!event) {
    throw new BadRequest('no_event_found');
  }

  return _createEventList([event], project, user);
};

const listEvents = async ({
  project, epochStartDate, epochEndDate, user,
}) => {
  const addOneDay = 86399 * 1000;

  // Validate input
  if ((epochStartDate && !epochEndDate) || (!epochStartDate && epochEndDate)) {
    throw new BadRequest('Both startDate and endDate are required');
  }

  const invitedUserFilter = { invited_users: { $elemMatch: { user_id: user._id } } };
  const eventCreatedBy = await EventRepository.fetchEvents({ filters: { created_by: user._id } }).select('_id');
  const eventIdCreatedBy = eventCreatedBy.map((e) => e._id);

  const fetchEventDetailsOptions = epochStartDate && epochEndDate
    ? {
      filters: {
        project_id: project._id,
        start_datetime: {
          $lte: parseInt(epochEndDate, 10) + addOneDay,
          $gte: epochStartDate,
        },
      },
    }
    : {
      filters: {
        project_id: project._id,
      },
    };

  const orCondition = [];

  if (invitedUserFilter) {
    orCondition.push(invitedUserFilter);
  }

  if (eventIdCreatedBy.length) {
    orCondition.push({
      event_id: {
        $in: eventIdCreatedBy,
      },
    });
  }

  if (orCondition.length > 0) {
    fetchEventDetailsOptions.filters.$or = orCondition;
  }
  // Fetch event details
  const allEvents = await EventDetailRepository.fetchEventDetails(fetchEventDetailsOptions);

  // Extract event_ids from event details
  const eventIds = allEvents.map((event) => event.event_id);

  // Fetch all events with matching event_ids
  const events = await EventRepository.fetchEvents({ filters: { _id: { $in: eventIds } } });

  // Create a map to associate event details with events based on _id and event_id
  const mapEventById = events.reduce((map, event) => ({ ...map, [event._id]: event }), {});

  // Organize event details with associated events
  const organizedEventDetails = allEvents.reduce((accumulator, eventDetail) => {
    const eventId = eventDetail.event_id;

    accumulator[eventId] = accumulator[eventId] || { event: mapEventById[eventId], activeEvents: [], expiredEvents: [] };

    // Categorize eventDetails as active or expired
    const eventDetails = eventDetail.end_datetime > Date.now() ? 'activeEvents' : 'expiredEvents';
    accumulator[eventId][eventDetails].push(eventDetail);

    return accumulator;
  }, {});

  // Transform organized data into the desired format
  const result = Object.values(organizedEventDetails).map(({ event, activeEvents, expiredEvents }) => ({
    ...event?._doc,
    eventDetail: activeEvents.map((ed) => ({
      ...ed._doc,
      email: Array.isArray(ed.email)
        ? ed.email.map((e) => e.mail) // ✅ transform [{ _id, mail }] to [mail]
        : [], // fallback in case email is not an array
    })),
    expired_events: expiredEvents.map((ed) => ({
      ...ed._doc,
      email: Array.isArray(ed.email)
        ? ed.email.map((e) => e.mail)
        : [],
    })),
  }));

  return result;
};

const boxListEvents = async ({
  project, epochStartDate, epochEndDate, user,
}) => {
  const addOneDay = 86399 * 1000;

  // Validate input
  if ((epochStartDate && !epochEndDate) || (!epochStartDate && epochEndDate)) {
    throw new BadRequest('Both startDate and endDate are required');
  }
  let fetchEventDetailsOptions;

  if (user.admin_access === true) {
    fetchEventDetailsOptions = epochStartDate && epochEndDate
      ? {
        filters: {
          project_id: project._id,
          // invited_users: { $exists: true, $not: { $size: 0 } },
          deleted: { $eq: 0 },
          isProduction: { $ne: false },
          start_datetime: {
            $lte: parseInt(epochEndDate, 10) + addOneDay,
            $gte: epochStartDate,
          },
        },
      }
      : {
        filters: {
          project_id: project._id,
          isProduction: { $ne: false },
          // invited_users: { $exists: true, $not: { $size: 0 } },
          deleted: { $eq: 0 },
        },
      };
  } else {
    const invitedUserFilter = { invited_users: { $elemMatch: { user_id: user._id } } };
    const eventCreatedBy = await EventRepository.fetchEvents({ filters: { created_by: user._id } }).select('_id');
    const eventIdCreatedBy = eventCreatedBy.map((e) => e._id);

    fetchEventDetailsOptions = epochStartDate && epochEndDate
      ? {
        filters: {
          project_id: project._id,
          isProduction: { $ne: false },
          deleted: { $eq: 0 },
          start_datetime: {
            $lte: parseInt(epochEndDate, 10) + addOneDay,
            $gte: epochStartDate,
          },
        },
      }
      : {
        filters: {
          project_id: project._id,
          deleted: { $eq: 0 },
          isProduction: { $ne: false },
        },
      };

    const orCondition = [];

    if (invitedUserFilter) {
      orCondition.push(invitedUserFilter);
    }

    if (eventIdCreatedBy.length) {
      orCondition.push({
        event_id: {
          $in: eventIdCreatedBy,
        },
      });
    }

    if (orCondition.length > 0) {
      fetchEventDetailsOptions.filters.$or = orCondition;
    }
  }

  // Fetch event details
  const allEvents = await EventDetailRepository.fetchEventDetails(fetchEventDetailsOptions);

  // Extract event_ids from event details
  const eventIds = allEvents.map((event) => event.event_id);

  // Fetch all events with matching event_ids
  const events = await EventRepository.fetchEvents({ filters: { _id: { $in: eventIds } } });

  // Create a map to associate event details with events based on _id and event_id
  const mapEventById = events.reduce((map, event) => ({ ...map, [event._id]: event }), {});

  // Organize event details with associated events
  const organizedEventDetails = allEvents.reduce((accumulator, eventDetail) => {
    const eventId = eventDetail.event_id;

    accumulator[eventId] = accumulator[eventId] || { event: mapEventById[eventId], activeEvents: [], expiredEvents: [] };

    // Categorize eventDetails as active or expired
    const eventDetails = eventDetail.end_datetime > Date.now() ? 'activeEvents' : 'expiredEvents';
    accumulator[eventId][eventDetails].push({ ...eventDetail?._doc, email: _formatEmail(eventDetail?._doc.email) });

    return accumulator;
  }, {});

  // Transform organized data into the desired format
  const result = Object.values(organizedEventDetails).map(({ event, activeEvents, expiredEvents }) => ({
    ...event?._doc,
    eventDetail: activeEvents,
    expired_events: expiredEvents,
  }));

  return result;
};

const editEvent = async ({
  project,
  device,
  user,
  eventId,
  reqBody,
  moduledata,
}) => {
  const result = { ...reqBody };
  const { eventDetailId, dayStartDate } = reqBody;
  const timestamp = Date.now();

  const event = await EventRepository.getEventById({ filters: eventId });
  if (!event) {
    throw new BadRequest('no_event_found');
  }

  const userIds = result.invited_users.map((iu) => iu.user_id.toString());

  let eventDetail = [];
  const micSecBeforeNotification = result.notify * 1000;
  let fetchEventDetailsOptions;
  if (!eventDetailId && !dayStartDate) {
    fetchEventDetailsOptions = { filters: { event_id: eventId } };
  } else if (eventDetailId && !dayStartDate) {
    fetchEventDetailsOptions = { filters: { _id: eventDetailId } };
  } else {
    fetchEventDetailsOptions = { filters: { event_id: eventId, start_datetime: { $gte: dayStartDate } } };
  }

  eventDetail = await EventDetailRepository.fetchEventDetails(fetchEventDetailsOptions);
  const calendarUnit = await _getCalendarUnit({ project }).select('_id');

  let needsRecurringPatternUpdate = false;
  if (
    parseInt(result.start_datetime, 10) !== parseInt(eventDetail[0].start_datetime, 10)
    || parseInt(result.repeat_status, 10) !== parseInt(eventDetail[0].repeat_status, 10)
    || parseInt(result.repeat_end_date, 10) !== parseInt(event.repeat_end_date, 10)
    || result.timezone !== eventDetail[0].timezone
    || result.call_type !== eventDetail[0].call_type
    || JSON.stringify(result.selectedDays.sort()) !== JSON.stringify(event.selectedDays.sort())
    || parseInt(result.end_datetime, 10) !== parseInt(eventDetail[0].end_datetime, 10)
  ) {
    needsRecurringPatternUpdate = true;
  }

  const notifications = await NotificationRepository.getNotifications({
    filters: {
      project_id: project._id,
      reference_id: event._id,
      message_read: false,
    },
  });

  // Delete previous notification for all invitees
  await NotificationRepository.updateNotification({
    filters: {
      project_id: project._id,
      reference_id: event._id,
    },
    data: { message_read: true },

  });

  const notificationUuids = notifications.map((notification) => notification.notification_uuid);

  // Extract only the user_id values from eventDetail's invited_users (existing users)
  const currentInvitedUsers = eventDetail?.[0]?.invited_users.map((iu) => iu.user_id.toString()) || [];

  // silent notification - only send to existing users who had their notifications marked as read
  if (currentInvitedUsers.length > 0) {
    await NotificationService.notifyAll({
      project,
      device,
      sender: user._id,
      receiver: currentInvitedUsers, // Only existing users, not new ones
      section: sections.HOME,
      tool: tools.CALENDAR,
      unit: calendarUnit._id,
      action: 'calendar_update',
      reference_id: event._id,
      reference_data: {
        read_notification_ids: notificationUuids,
      },
    }, { save: false, silent: true }, socketClient);
  }

  // Update event and event details
  event.type = result.type;
  event.selectedDays = result.selectedDays;
  event.repeat_end_date = result.repeat_end_date;
  event.updated_by = user._id;

  await event.save();
  const existingUserIds = eventDetail?.[0]?.invited_users.map((id) => id.toString()) || [];
  const alreadyAddedUsers = [];
  let hasNewUsers = false;
  const addedUsersForUpdateEventData = [];
  const addedUsersForSingleUpdateEventData = [];
  let addedUsersForUpdateEventDataForAllEvent = [];

  // Extract only the user_id values from eventDetail's invited_users
  const existingInvitedUsers = eventDetail?.[0]?.invited_users.map((iu) => iu.user_id.toString()) || [];

  // Extract user IDs from result.invited_users (request body)
  const newInvitedUsers = result.invited_users.map((iu) => iu.user_id.toString());

  // Find the users in existingInvitedUsers (DB) that are not in newInvitedUsers (request body)
  const missingFromRequest = existingInvitedUsers.filter((userId) => !newInvitedUsers.includes(userId));

  const updateEventData = {
    title: result.title,
    description: result.description,
    location: result.location,
    location_description: result.location_description,
    full_day: result.full_day,
    createUser_exclude: result.createUser_exclude,
    next_reminder: result.start_datetime - micSecBeforeNotification,
    start_datetime: result.start_datetime,
    end_datetime: result.end_datetime,
    notify: result.notify,
    repeat_end_date: result.repeat_end_date,
    selectedDays: result.selectedDays,
    timezone: result.timezone,
    reference_id: result.reference_id,
    color: result.color,
    email: result.email,
    isProduction: result.isProduction,
    call_type: result.call_type,
    repeat_status: result.repeat_status,
    invited_users: (result.invited_users || []).map((userInvited) => {
      if (eventDetail?.[0]?.invited_users.includes(userInvited.user_id)) {
        alreadyAddedUsers.push(userInvited.user_id);
      } else {
        addedUsersForUpdateEventData.push(userInvited.user_id);
      }
      return {
        user_id: userInvited.user_id,
        keep_name_private: userInvited.keep_name_private,
        status: userInvited.status || 'pending',
      };
    }),
  };

  const _updateEventData = { ...updateEventData, email: _formatEmail(updateEventData.email), _id: event._id };

  const singleUpdateEventData = {
    title: result.title,
    description: result.description,
    location: result.location,
    location_description: result.location_description,
    full_day: result.full_day,
    createUser_exclude: result.createUser_exclude,
    next_reminder: result.start_datetime - micSecBeforeNotification,
    start_datetime: result.start_datetime,
    end_datetime: result.end_datetime,
    notify: result.notify,
    selectedDays: result.selectedDays,
    timezone: result.timezone,
    color: result.color,
    email: result.email,
    call_type: result.call_type,
    repeat_status: result.repeat_status,
    invited_users: (result.invited_users || []).map((userInvited) => {
      if (eventDetail?.[0]?.invited_users.includes(userInvited.user_id)) {
        alreadyAddedUsers.push(userInvited.user_id);
      } else {
        addedUsersForSingleUpdateEventData.push(userInvited.user_id);
      }
      return {
        user_id: userInvited.user_id,
        keep_name_private: userInvited.keep_name_private,
        status: userInvited.status || 'pending',
      };
    }),
  };

  const _singleUpdateEventData = { ...singleUpdateEventData, email: _formatEmail(singleUpdateEventData.email), _id: event._id };

  const updateEventDataForAllEvent = {
    title: result.title,
    description: result.description,
    location: result.location,
    location_description: result.location_description,
    full_day: result.full_day,
    createUser_exclude: result.createUser_exclude,
    next_reminder: result.start_datetime - micSecBeforeNotification,
    notify: result.notify,
    color: result.color,
    email: result.email,
    selectedDays: result.selectedDays,
    timezone: result.timezone,
    call_type: result.call_type,
    invited_users: (result.invited_users || []).map((userInvited) => {
      const userIdStr = userInvited.user_id.toString();
      // Check if the user ID is in the existingUserIds array
      if (!existingUserIds.some((existingUserId) => existingUserId.includes(userIdStr))) {
        addedUsersForUpdateEventDataForAllEvent = [userInvited.user_id];
        hasNewUsers = true; // Mark that we've found a new user
      }

      return {
        user_id: userInvited.user_id,
        keep_name_private: userInvited.keep_name_private,
        status: userInvited.status || 'pending',
      };
    }),
  };

  const _updateEventDataForAllEvent = { ...updateEventDataForAllEvent, email: _formatEmail(updateEventDataForAllEvent.email), _id: event._id };

  if (!hasNewUsers) {
    addedUsersForUpdateEventDataForAllEvent = result.invited_users.map((users) => users.user_id.toString());
  }

  const startDateTime = eventDetail[0].start_datetime;
  const epochTime = startDateTime; // Example epoch time

  const dateObject = new Date(epochTime);

  const year = dateObject.getFullYear();
  const month = dateObject.getMonth() + 1; // Months are zero-based, so we add 1
  const day = dateObject.getDate();

  const formattedDate = `${year}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`;

  const epochDate = new Date(formattedDate);

  const groupId = eventDetail[0].group_id;
  // Get the epoch time in milliseconds
  const epochTimes = epochDate.getTime();
  if (needsRecurringPatternUpdate) {
    if (eventDetailId) {
      // Delete only the specified event detail by ID
      await EventDetailRepository.deleteEventDetails({ filters: { _id: eventDetailId } });
      await _currentRecurringPattern(project._id, eventId, singleUpdateEventData, user, userIds, moduledata, groupId);
    } else {
      // Delete all event details if neither eventDetailId nor dayStartDate is provided
      const deleteCondition = dayStartDate
        ? { event_id: eventId, start_datetime: { $gte: dayStartDate } }
        : { event_id: eventId, start_datetime: { $gte: epochTimes } };

      await EventDetailRepository.deleteEventDetails({ filters: deleteCondition });
      await _currentRecurringPattern(project._id, eventId, updateEventData, user, userIds, moduledata, groupId);
    }
  } else {
    await Promise.all(eventDetail.map((eventD) => {
      const groupIdss = eventD.group_id; // preserve
      Object.assign(eventD, updateEventDataForAllEvent);
      // eslint-disable-next-line no-param-reassign
      eventD.group_id = groupIdss;
      return eventD.save();
    }));
  }

  let selectedAddedUsers;

  if (needsRecurringPatternUpdate) {
    if (eventDetailId) {
      selectedAddedUsers = addedUsersForUpdateEventData;
    } else {
      selectedAddedUsers = addedUsersForSingleUpdateEventData;
    }
  } else {
    selectedAddedUsers = addedUsersForUpdateEventDataForAllEvent;
  }

  await EventRepository.updateEvent({ filters: { _id: event._id }, data: { updated: timestamp } });

  const updatedEvent = await EventRepository.getEventById({ filters: eventId });

  if (missingFromRequest.length > 0) {
    missingFromRequest.forEach((userId) => {
      socketClient('__admin_events__', {
        event: 'edit:event',
        room: userId, // Sending individually for each user
        data: {
          project_id: project._id,
          user_id: userId, // Sending a single user ID
          device_id: device._id,
          unit_id: calendarUnit._id,
          type: result.invited_users?.length ? 0 : 1, // Simplified logic for type
          event_id: event._id,
        },
      });
    });
  }

  if (!project.deleted) {
    const payload = {
      project,
      device,
      sender: user._id,
      receiver: selectedAddedUsers,
      section: sections.HOME,
      tool: tools.CALENDAR,
      unit: calendarUnit._id,
      action: 'calendar_update',
      reference_id: event._id,
      reference_data: {
        expired: event.repeat_end_date,
        calendar_data: _updateEventData || _singleUpdateEventData || _updateEventDataForAllEvent,
        messageElements: [
          { search: '{{user_name}}', replacer: user.full_name },
          { search: '{{event_title}}', replacer: result?.title },
        ],
      },
    };
    NotificationService.notifyAll(payload, {}, socketClient);

    // Global notification for calendar_update
    const globalPayload = {
      project,
      device,
      sender: user._id,
      receiver: selectedAddedUsers,
      section: sections.GLOBAL,
      tool: tools.DEFAULT,
      unit: calendarUnit._id,
      action: 'calendar_update',
      reference_id: event._id,
      reference_data: {
        expired: event.repeat_end_date,
        calendar_data: _updateEventData || _singleUpdateEventData || _updateEventDataForAllEvent,
        messageElements: [
          { search: '{{user_name}}', replacer: user.full_name },
          { search: '{{event_title}}', replacer: result?.title },
        ],
        is_global: true,
      },
    };
    NotificationService.notifyAll(globalPayload, { silent: true }, socketClient);
  }
  const userEvent = await _createEventList([event], project, user);

  const observerUser = [...userIds, user._id.toString(), event.created_by.toString()];

  socketClient('__admin_events__', {
    event: 'edit:event',
    room: observerUser,
    data: {
      project_id: project._id,
      user_id: user._id,
      device_id: device._id,
      unit_id: calendarUnit._id,
      type: Number(!result.invited_users?.length),
      event_id: event._id,
    },
  });

  let chatRoomData;
  const groupIds = [
    ...new Set(
      userEvent.flatMap((item) => item.eventDetail
        .filter((events) => events.group_id) // Ensure group_id exists
        .map((events) => events.group_id)),
    ),
  ];
  if (groupIds.length > 0) {
    chatRoomData = await ChatRoomRepository.fetchChatRoom({ filters: { _id: groupIds[0] } });
  }

  const emails = Array.isArray(result.email)
    ? result.email.map((item) => item.mail)
    : [];
  const userId = result.invited_users.map((invitedUser) => invitedUser.user_id);
  userId.push(user._id);

  if (result.call_type !== '') {
    const members = [
      ...userIds,
      user._id.toString(),
      ...(updatedEvent.updated > 0 ? [updatedEvent.created_by.toString()] : []),
    ];

    const config = {
      ...commonConfig,
      headers: { moduledata },
      data: {
        chat_room_id: eventDetail[0].group_id,
        room_name: result.title,
        owned_by: user._id,
        members,
        is_random_call_group: true,
        is_calendar_call_group: true,
      },
    };

    config.url = `${getUrls('CNC_BASE_URL')}/v2/chat-room`;

    try {
      await axios.request(config);
    } catch (error) {
      console.error('Error creating chat room:', error);
    }
  }

  const users = await ProjectUserRepository.fetchProjectUsers({
    filters: {
      project_id: project._id, _id: { $in: userId },
    },
  });
  const fullNames = users.map((person) => person.full_name);
  fullNames.push(...emails);

  // // Format combined data
  const formattedDateTime = formatDateTimeRange(result.start_datetime, result.end_datetime, result.timezone);

  const formattedDateTimes = formatDateTimeRanges(
    result.start_datetime,
    result.end_datetime,
    result.repeat_end_date,
    result.timezone,
  );

  // // Example Usage
  const { date, time } = formatDateTimeRangeSeparate(
    result.start_datetime,
    result.end_datetime,
    result.timezone,
  );

  const excluded = getMessage(project.project_language, 'calendar_excluded');
  const fullNamesFormatted = fullNames.join('<br>');
  // // Determine the subject
  if (emails.length > 0) {
    let subject;
    let message;
    if (result.repeat_status === 0) {
      subject = getMessage(
        project.project_language,
        `Updated Zillit Invitation: ${result.title} @ ${formattedDateTime} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', result.title)
        .replace('{{formatted_date_time}}', formattedDateTime)
        .replace('{{event_description}}', result.description)
        .replace('{{user_full_name}}', user.full_name + (result.createUser_exclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if (chatRoomData && ['audio', 'video', 'meet_in_person_call'].includes(result.call_type)) {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (result.repeat_status === 1) {
      subject = getMessage(
        project.project_language,
        `Updated Zillit Invitation: ${result.title} @ Daily from ${formattedDateTimes} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', result.title)
        .replace('{{formatted_date_time}}', formattedDateTimes)
        .replace('{{event_description}}', result.description)
        .replace('{{user_full_name}}', user.full_name + (result.createUser_exclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && result.call_type === 'audio') || result.call_type === 'video' || result.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (result.repeat_status === 2) {
      subject = getMessage(
        project.project_language,
        `Updated Zillit Invitation: ${result.title} @ Weekly on ${formatDateTimeWeekly(result.start_datetime, result.end_datetime, result.repeat_end_date, result.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', result.title)
        .replace('{{formatted_date_time}}', formatDateTimeWeekly(result.start_datetime, result.end_datetime, result.repeat_end_date, result.timezone))
        .replace('{{event_description}}', result.description)
        .replace('{{user_full_name}}', user.full_name + (result.createUser_exclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && result.call_type === 'audio') || result.call_type === 'video' || result.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (result.repeat_status === 3) {
      subject = getMessage(
        project.project_language,
        `Updated Zillit Invitation: ${result.title} @ Monthly from ${formatDateTimeMonthly(result.start_datetime, result.end_datetime, result.repeat_end_date, result.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', result.title)
        .replace('{{formatted_date_time}}', formatDateTimeMonthly(result.start_datetime, result.end_datetime, result.repeat_end_date, result.timezone))
        .replace('{{event_description}}', result.description)
        .replace('{{user_full_name}}', user.full_name + (result.createUser_exclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && result.call_type === 'audio') || result.call_type === 'video' || result.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (result.repeat_status === 4) {
      subject = getMessage(
        project.project_language,
        `Updated Zillit Invitation: ${result.title} @ Annually from ${formatDateTimeYearly(result.start_datetime, result.end_datetime, result.repeat_end_date, result.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', result.title)
        .replace('{{formatted_date_time}}', formatDateTimeYearly(result.start_datetime, result.end_datetime, result.repeat_end_date, result.timezone))
        .replace('{{event_description}}', result.description)
        .replace('{{user_full_name}}', user.full_name + (result.createUser_exclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && result.call_type === 'audio') || result.call_type === 'video' || result.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    } else if (result.repeat_status === 5) {
      subject = getMessage(
        project.project_language,
        `Updated Zillit Invitation: ${result.title} @ Weekly from ${formatDateTimeWeeklyCustom(result.start_datetime, result.end_datetime, result.repeat_end_date, result.selectedDays, result.timezone)} (${user.full_name})`,
      );
      message = getMessage(project.project_language, 'calendar_mail');
      message = String(message)
        .replace('{{event_title}}', result.title)
        .replace(
          '{{formatted_date_time}}',
          formatDateTimeWeeklyCustom(result.start_datetime, result.end_datetime, result.repeat_end_date, result.selectedDays, result.timezone),
        )
        .replace('{{event_description}}', result.description)
        .replace('{{user_full_name}}', user.full_name + (result.createUser_exclude ? ` (${excluded})` : ''))
        .replace('{{date}}', date)
        .replace('{{time}}', time)
        .replace('{{fullNames}}', fullNamesFormatted);
      // Remove the Zillit Meet button if guest_invite_link is null or undefined
      // if ((chatRoomData && result.call_type === 'audio') || result.call_type === 'video' || result.call_type === 'meet_in_person_call') {
      //   // message = message.replace('{{zillit_meet_link}}', chatRoomData.guest_invite_link);
      // } else {
      //   message = message.replace(
      //     /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
      //     '',
      //   );
      // }
    }

    // Remove button if no guest link
    if (
      !chatRoomData?.guest_invite_link
  || !['audio', 'video', 'meet_in_person_call'].includes(result.call_type)
    ) {
      message = message.replace(
        /<div style="text-align: center; margin-top: 10px;">.*?<\/div>/s,
        '',
      );
    }
    // Send the email

    for (const emailObj of result.email) {
      // Ensure guest link is valid before replacing
      const inviteLink = chatRoomData?.guest_invite_link
        ? `${chatRoomData.guest_invite_link}?id=${emailObj._id}`
        : '';

      const personalizedMessage = message.replace('{{zillit_meet_link}}', inviteLink);

      const ses = new SesService({
        to: [emailObj.mail], // corrected from emailObj.email
        subject,
        html: personalizedMessage,
        replyTo: user.mail_box_detail.email_address,
      });

      ses.sendEmail();
    }
  }
  return userEvent;
};

const deleteEvents = async ({
  project, device, user, eventId, eventDetailId, dayStartDate,
}) => {
  const basicFilter = { event_id: eventId };
  const eventData = await EventRepository.getEventById({ filters: eventId });
  const eventDetail = await EventDetailRepository.fetchEventDetails({ filters: basicFilter });
  const eventIds = eventDetail.map((event) => event.invited_users);
  const userIds = eventIds[0].map((iu) => iu.user_id.toString());
  const calendarUnit = await _getCalendarUnit({ project }).select('_id');
  const repeatDate = eventData.repeat_end_date;
  const repeatEndDate = new Date(repeatDate);
  // Extract hours, minutes, and seconds
  const hours = repeatEndDate.getUTCHours();
  const minutes = repeatEndDate.getUTCMinutes();
  const seconds = repeatEndDate.getUTCSeconds();

  // Delete previous notification for all invitees
  await NotificationRepository.updateNotification({
    filters: {
      project_id: project._id,
      reference_id: eventId,
    },
    data: { message_read: true },

  });

  const notifications = await NotificationRepository.getNotifications({
    filters: {
      project_id: project._id,
      reference_id: eventId,
    },
  });

  const notificationUuids = notifications.map((notification) => notification.notification_uuid);

  // silent notification
  await NotificationService.notifyAll({
    project,
    device,
    sender: user._id,
    receiver: userIds,
    section: sections.HOME,
    tool: tools.CALENDAR,
    unit: calendarUnit._id,
    action: 'calendar_update',
    reference_id: eventId,
    reference_data: {
      read_notification_ids: notificationUuids,
    },
  }, { save: false, silent: true }, socketClient);

  const payload = {
    project,
    device,
    sender: user._id,
    receiver: userIds,
    section: sections.GLOBAL,
    tool: tools.DEFAULT,
    unit: calendarUnit._id,
    is_global: true,
    reference_id: eventId,
    reference_data: {
      expired: eventData.repeat_end_date,
      messageElements: [
        { search: '{{user_name}}', replacer: user.full_name },
        { search: '{{event_name}}', replacer: eventDetail[0].title },
      ],
    },
  };
  const timestamp = Date.now();
  // data: { deleted: timestamp, updated: timestamp }
  if (!eventDetailId && !dayStartDate) {
    // Scenario 1: Delete all events related to the given eventId
    const fetchEventDetails = await EventDetailRepository.fetchEventDetails(
      { filters: { ...basicFilter } },
    );
    const fetchEvent = await EventRepository.fetchEvent(
      { filters: { _id: eventId } },
    );
    await EventDetailRepository.updateEventDetails({ filters: basicFilter, data: { deleted: timestamp, updated: timestamp, deleted_by: user._id } });
    await EventRepository.updateEvent({ filters: { _id: eventId }, data: { deleted: timestamp, updated: timestamp, deleted_by: user._id } });

    const userId = fetchEventDetails[0].invited_users.map((invitedUser) => invitedUser.user_id);
    userId.push(user._id);
    const users = await ProjectUserRepository.fetchProjectUsers({
      filters: {
        project_id: project._id, _id: { $in: userId },
      },
    });
    const fullNames = users.map((person) => person.full_name);
    fullNames.push(...fetchEventDetails[0].email.map((e) => e.mail));
    const formattedDateTime = formatDateTimeRange(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEventDetails[0].timezone);
    const formattedDateTimes = formatDateTimeRanges(
      fetchEventDetails[0].start_datetime,
      fetchEventDetails[0].end_datetime,
      repeatEndDate,
      fetchEventDetails[0].timezone,
    );

    const { date, time } = formatDateTimeRangeSeparate(
      fetchEventDetails[0].start_datetime,
      fetchEventDetails[0].end_datetime,
      fetchEventDetails[0].timezone,
    );

    const fullNamesFormatted = fullNames.join('<br>');
    if (fetchEventDetails[0].email.length > 0) {
      let subject;
      let message;
      if (fetchEventDetails[0].repeat_status === 0) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetails[0].title} @ ${formattedDateTime} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetails[0].title)
          .replace('{{formatted_date_time}}', formattedDateTime)
          .replace('{{event_description}}', fetchEventDetails[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetails[0].repeat_status === 1) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetails[0].title} @ Daily from ${formattedDateTimes} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetails[0].title)
          .replace('{{formatted_date_time}}', formattedDateTimes)
          .replace('{{event_description}}', fetchEventDetails[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetails[0].repeat_status === 2) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetails[0].title} @ Weekly on ${formatDateTimeWeekly(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetails[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetails[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeWeekly(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetails[0].timezone))
          .replace('{{event_description}}', fetchEventDetails[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetails[0].repeat_status === 3) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetails[0].title} @ Monthly from ${formatDateTimeMonthly(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetails[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetails[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeMonthly(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetails[0].timezone))
          .replace('{{event_description}}', fetchEventDetails[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetails[0].repeat_status === 4) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetails[0].title} @ Annually from ${formatDateTimeYearly(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetails[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetails[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeYearly(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetails[0].timezone))
          .replace('{{event_description}}', fetchEventDetails[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetails[0].repeat_status === 5) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetails[0].title} @ Weekly from ${formatDateTimeWeeklyCustom(fetchEventDetails[0].start_datetime, fetchEventDetails[0].end_datetime, fetchEvent.repeat_end_date, fetchEvent.selectedDays, fetchEventDetails[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetails[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeWeeklyCustom(
            fetchEventDetails[0].start_datetime,
            fetchEventDetails[0].end_datetime,
            fetchEvent.repeat_end_date,
            fetchEvent.selectedDays,
            fetchEventDetails[0].timezone,
          ))
          .replace('{{event_description}}', fetchEventDetails[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      }

      // Send the email
      const ses = new SesService({
        to: fetchEventDetails[0].email,
        subject,
        html: message,
        replyTo: user.mail_box_detail.email_address,
      });
      ses.sendEmail();
    }
    payload.action = 'calendar_has_deleted';
  } else if (eventDetailId && !dayStartDate) {
    // Scenario 2: Delete a specific event using eventDetailId
    await EventDetailRepository.updateEventDetail({ filters: { _id: eventDetailId }, data: { deleted: timestamp, updated: timestamp, deleted_by: user._id } });
    const fetchEventDetails = await EventDetailRepository.fetchEventDetails(
      { filters: { ...basicFilter } },
    );

    // Get the last object in the array
    const lastEvent = fetchEventDetails[fetchEventDetails.length - 1];
    const epochTime = lastEvent.start_datetime;

    // Convert epoch time to a Date object
    const date = new Date(epochTime);

    // Set the time to 00:00:00
    date.setUTCHours(0, 0, 0, 0);

    // Add 23 hours, 59 minutes, and 59 seconds
    date.setUTCHours(date.getUTCHours() + hours, date.getUTCMinutes() + minutes, date.getUTCSeconds() + seconds);

    const finalEpochTime = date.getTime();

    const eventfilters = { _id: eventId };
    const event = await EventRepository.fetchEvent(
      { filters: eventfilters },
    );

    const data = {
      ...event._doc,
      repeat_end_date: finalEpochTime,
    };
    await EventRepository.updateEvent({ filters: eventfilters, data });

    const fetchEventDetail = await EventDetailRepository.fetchEventDetails(
      { filters: { _id: eventDetailId } },
    );

    const userId = fetchEventDetail[0].invited_users.map((invitedUser) => invitedUser.user_id);
    userId.push(user._id);
    const users = await ProjectUserRepository.fetchProjectUsers({
      filters: {
        project_id: project._id, _id: { $in: userId },
      },
    });
    const fullNames = users.map((person) => person.full_name);
    fullNames.push(...fetchEventDetail[0].email.map((e) => e.mail));
    const formattedDateTime = formatDateTimeRange(fetchEventDetail[0].start_datetime, fetchEventDetail[0].end_datetime, fetchEventDetails[0].timezone);

    const { date: dates, time: times } = formatDateTimeRangeSeparate(
      fetchEventDetail[0].start_datetime,
      fetchEventDetail[0].end_datetime,
      fetchEventDetails[0].timezone,
    );

    const fullNamesFormatted = fullNames.join('<br>');
    if (fetchEventDetail[0].email.length > 0) {
      let subject;
      let message;
      if ([0, 1, 2, 3, 4, 5].includes(fetchEventDetail[0].repeat_status)) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetail[0].title} @ ${formattedDateTime} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetail[0].title)
          .replace('{{formatted_date_time}}', formattedDateTime)
          .replace('{{event_description}}', fetchEventDetail[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', dates)
          .replace('{{time}}', times)
          .replace('{{fullNames}}', fullNamesFormatted);
      }

      // Send the email
      const ses = new SesService({
        to: fetchEventDetail[0].email,
        subject,
        html: message,
        replyTo: user.mail_box_detail.email_address,
      });
      ses.sendEmail();
    }

    payload.action = 'calendar_has_deleted_event_for_this_date';
  } else if (!eventDetailId && dayStartDate) {
    // Scenario 3: Delete events of the same date or greater using dayStartDate
    await EventDetailRepository.updateEventDetails(
      { filters: { ...basicFilter, start_datetime: { $gte: dayStartDate } }, data: { deleted: timestamp, updated: timestamp, deleted_by: user._id } },
    );
    const fetchEventDetails = await EventDetailRepository.fetchEventDetails(
      { filters: { ...basicFilter } },
    );

    const fetchEventDetailsData = await EventDetailRepository.fetchEventDetails(
      { filters: { ...basicFilter, start_datetime: { $gte: dayStartDate } } },
    );
    const fetchEvent = await EventRepository.fetchEvent(
      { filters: { _id: eventId } },
    );
    let finalEpochTime;
    if (fetchEventDetails.length > 0) {
    // Get the last object in the array
      const lastEvent = fetchEventDetails[fetchEventDetails.length - 1];
      const epochTime = lastEvent.start_datetime;

      // Convert epoch time to a Date object
      const date = new Date(epochTime);

      // Set the time to 00:00:00
      date.setUTCHours(0, 0, 0, 0);

      // Add 23 hours, 59 minutes, and 59 seconds
      date.setUTCHours(date.getUTCHours() + hours, date.getUTCMinutes() + minutes, date.getUTCSeconds() + seconds);

      finalEpochTime = date.getTime();
    }
    const eventfilters = { _id: eventId };
    const event = await EventRepository.fetchEvent(
      { filters: eventfilters },
    );

    const data = {
      ...event._doc,
      repeat_end_date: finalEpochTime,
    };
    await EventRepository.updateEvent({ filters: eventfilters, data });

    const userId = fetchEventDetailsData[0].invited_users.map((invitedUser) => invitedUser.user_id);
    userId.push(user._id);
    const users = await ProjectUserRepository.fetchProjectUsers({
      filters: {
        project_id: project._id, _id: { $in: userId },
      },
    });
    const fullNames = users.map((person) => person.full_name);
    fullNames.push(...fetchEventDetailsData[0].email.map((e) => e.mail));

    const formattedDateTime = formatDateTimeRange(fetchEventDetailsData[0].start_datetime, fetchEventDetailsData[0].end_datetime, fetchEventDetailsData[0].timezone);
    const formattedDateTimes = formatDateTimeRanges(
      fetchEventDetailsData[0].start_datetime,
      fetchEventDetailsData[0].end_datetime,
      repeatEndDate,
      fetchEventDetailsData[0].timezone,
    );

    const { date, time } = formatDateTimeRangeSeparate(
      fetchEventDetailsData[0].start_datetime,
      fetchEventDetailsData[0].end_datetime,
      fetchEventDetailsData[0].timezone,
    );

    const fullNamesFormatted = fullNames.join('<br>');
    if (fetchEventDetailsData[0].email.length > 0) {
      let subject;
      let message;
      if (fetchEventDetailsData[0].repeat_status === 0) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetailsData[0].title} @ ${formattedDateTime} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetailsData[0].title)
          .replace('{{formatted_date_time}}', formattedDateTime)
          .replace('{{event_description}}', fetchEventDetailsData[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetailsData[0].repeat_status === 1) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetailsData[0].title} @ Daily from ${formattedDateTimes} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetailsData[0].title)
          .replace('{{formatted_date_time}}', formattedDateTimes)
          .replace('{{event_description}}', fetchEventDetailsData[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetailsData[0].repeat_status === 2) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetailsData[0].title} @ Weekly on ${formatDateTimeWeekly(fetchEventDetailsData[0].start_datetime, fetchEventDetailsData[0].end_datetime, fetchEvent.repeat_end_date)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetailsData[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeWeekly(fetchEventDetailsData[0].start_datetime, fetchEventDetailsData[0].end_datetime, fetchEvent.repeat_end_date))
          .replace('{{event_description}}', fetchEventDetailsData[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetailsData[0].repeat_status === 3) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetailsData[0].title} @ Monthly from ${formatDateTimeMonthly(fetchEventDetailsData[0].start_datetime, fetchEventDetailsData[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetailsData[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetailsData[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeMonthly(
            fetchEventDetailsData[0].start_datetime,
            fetchEventDetailsData[0].end_datetime,
            fetchEvent.repeat_end_date,
            fetchEventDetailsData[0].timezone,
          ))
          .replace('{{event_description}}', fetchEventDetailsData[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetailsData[0].repeat_status === 4) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetailsData[0].title} @ Annually from ${formatDateTimeYearly(fetchEventDetailsData[0].start_datetime, fetchEventDetailsData[0].end_datetime, fetchEvent.repeat_end_date, fetchEventDetailsData[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetailsData[0].title)
          .replace('{{formatted_date_time}}', formatDateTimeYearly(
            fetchEventDetailsData[0].start_datetime,
            fetchEventDetailsData[0].end_datetime,
            fetchEvent.repeat_end_date,
            fetchEventDetailsData[0].timezone,
          ))
          .replace('{{event_description}}', fetchEventDetailsData[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      } else if (fetchEventDetailsData[0].repeat_status === 5) {
        subject = getMessage(
          project.project_language,
          `Canceled Zillit Invitation: ${fetchEventDetailsData[0].title} @ Weekly from ${formatDateTimeWeeklyCustom(fetchEventDetailsData[0].start_datetime, fetchEventDetailsData[0].end_datetime, fetchEvent.repeat_end_date, fetchEvent.selectedDays, fetchEventDetailsData[0].timezone)} (${user.full_name})`,
        );
        message = getMessage(project.project_language, 'calendar_mail');
        message = String(message)
          .replace('{{event_title}}', fetchEventDetailsData[0].title)
          .replace(
            '{{formatted_date_time}}',
            formatDateTimeWeeklyCustom(
              fetchEventDetailsData[0].start_datetime,
              fetchEventDetailsData[0].end_datetime,
              fetchEvent.repeat_end_date,
              fetchEvent.selectedDays,
              fetchEventDetailsData[0].timezone,
            ),
          )
          .replace('{{event_description}}', fetchEventDetailsData[0].description)
          .replace('{{user_full_name}}', user.full_name)
          .replace('{{date}}', date)
          .replace('{{time}}', time)
          .replace('{{fullNames}}', fullNamesFormatted);
      }

      // Send the email
      const ses = new SesService({
        to: fetchEventDetailsData[0].email,
        subject,
        html: message,
        replyTo: user.mail_box_detail.email_address,
      });
      ses.sendEmail();
    }

    payload.action = 'calendar_has_deleted_event_after_this_date';
    const remainingEvents = await EventDetailRepository.fetchEventDetails(
      { filters: basicFilter },
    );
    if (remainingEvents.length === 0) {
      await EventRepository.updateEvent(
        { filters: { _id: eventId }, data: { deleted: timestamp, updated: timestamp, deleted_by: user._id } },
      );
    }
  }

  const observerUser = [...userIds, user._id.toString()];

  socketClient('__admin_events__', {
    event: 'delete:event',
    room: observerUser,
    data: {
      project_id: project._id,
      user_id: user._id,
      unit_id: calendarUnit._id,
      device_id: device._id,
      event_id: eventId,
    },
  });
  if (!project.deleted) {
    NotificationService.notifyAll(payload, {}, socketClient);
  }
};

const invitationDetailList = async ({
  project,
  user,
  query,
}) => {
  const { status, eventId } = query;
  const limit = parseInt(query?.limit, 10) || 50;
  const skip = (Math.max(0, (parseInt(query?.page, 10) - 1))) * limit;
  const currentUserId = user._id;
  const filterMapCommon = {
    project_id: project._id,
    invited_users: { $elemMatch: { user_id: currentUserId, status } },
  };

  const filterMap = {
    accepted: { ...filterMapCommon },
    rejected: { ...filterMapCommon },
    pending: {
      ...filterMapCommon, end_datetime: { $gt: Date.now() },
    },
    expired: { project_id: project._id, 'invited_users.user_id': currentUserId, end_datetime: { $lt: Date.now() } },
    default: { project_id: project._id, 'invited_users.user_id': currentUserId, end_datetime: { $gt: Date.now() } },
  };

  const filter = filterMap[status] || filterMap.default;
  if (eventId) {
    filter.event_id = eventId;
  }
  const totalCount = await EventDetailRepository.getEventDetailCount({ filters: filter });

  const allEvents = await EventDetailRepository.fetchEventDetails({ filters: filter })
    .sort({ still_active: -1, start_datetime: 1 })
    .skip(skip)
    .limit(limit);

  const eventIds = allEvents.map((allEvent) => allEvent.event_id);
  const events = await EventRepository.fetchEvents({ filters: { _id: { $in: eventIds } } });
  const eventsObject = {};
  events.forEach((event) => {
    eventsObject[event._id] = event;
  });

  const result = allEvents.map((allEvent) => {
    const event = eventsObject[allEvent.event_id];
    return {
      ...allEvent.toObject(),
      email: [...allEvent.email.map((e) => e.mail)],
      created_by: event.created_by,
    };
  });

  const totalRecords = totalCount;
  const returnResult = result;

  return [{ event_count: totalRecords, events: returnResult }];
};

const invitationList = async ({ project, user, query }) => {
  const { status } = query;
  const filters = {
    status,
    project_id: project._id,
    user_id: user._id,
    limit: query.limit,
    page: query.page,
  };

  let count = await EventDetailRepository.getUserEvents({
    filters: {
      ...filters,
      count: true,
    },
  });

  count = count.length ? count.pop().count : 0;

  const allEvents = await EventDetailRepository.getUserEvents({ filters });

  let allEventDetails;
  const now = Date.now();

  if (status === 'expired') {
    allEventDetails = allEvents.filter((evts) => evts.end_datetime <= now);
  } else {
    allEventDetails = allEvents.filter((evts) => evts.end_datetime > now);
  }

  const eventIds = allEventDetails.map((allEvent) => allEvent.event_id);
  const events = await EventRepository.fetchEvents({ filters: { _id: { $in: eventIds } } });

  const eventsObject = {};
  events.forEach((event) => {
    eventsObject[event._id] = event;
  });

  const result = allEventDetails.map((eventDetail) => {
    const baseEvent = eventsObject[eventDetail.event_id]?.toObject() || {};

    // Convert email array of objects into array of strings
    const cleanEventDetail = {
      ...eventDetail,
      email: Array.isArray(eventDetail.email)
        ? eventDetail.email.map((e) => e.mail)
        : [],
    };

    return {
      ...baseEvent,
      eventDetail: cleanEventDetail,
    };
  });

  return [{ event_count: count, events: result }];
};

const acceptEvent = async ({
  project, device, user, eventId, reqBody,
}) => {
  const event = await EventRepository.getEventById({ filters: eventId });
  if (!event) {
    throw new BadRequest('no_event_found');
  }
  const { eventDetailId, dayStartDate } = reqBody;

  const userIdToAccept = user._id;
  let fetchEventDetailsOptions;

  if (!eventDetailId && !dayStartDate) {
    fetchEventDetailsOptions = { filters: { invited_users: { $elemMatch: { user_id: userIdToAccept } }, event_id: eventId } };
  } else if (eventDetailId && !dayStartDate) {
    fetchEventDetailsOptions = { filters: { invited_users: { $elemMatch: { user_id: userIdToAccept } }, _id: eventDetailId } };
  } else if (!eventDetailId && dayStartDate) {
    fetchEventDetailsOptions = { filters: { invited_users: { $elemMatch: { user_id: userIdToAccept } }, event_id: eventId, start_datetime: { $gte: dayStartDate } } };
  }
  const eventsWithUser = await EventDetailRepository.fetchEventDetails(fetchEventDetailsOptions);
  if (!eventsWithUser || eventsWithUser.length === 0) {
    throw new BadRequest('user_not_found_in_invitation_list');
  }

  eventsWithUser.forEach(async (eventDetail) => {
    const invitedUsers = eventDetail.invited_users;
    const userIndex = invitedUsers.findIndex(
      (userAccept) => userAccept.user_id.toString() === userIdToAccept.toString(),
    );
    if (userIndex !== -1 && invitedUsers[userIndex].status !== constants.userStatus.accepted) {
      invitedUsers[userIndex].status = constants.userStatus.accepted;
      invitedUsers[userIndex].reason = '';
      await eventDetail.save();
    }
  });
  const calendarUnit = await _getCalendarUnit({ project }).select('_id');
  const basicFilter = { event_id: eventId };
  const eventDetail = await EventDetailRepository.fetchEventDetails({ filters: basicFilter });
  const eventIds = eventDetail.map((events) => events.invited_users);
  const userIds = eventIds[0].map((iu) => iu.user_id.toString());
  if (!project.deleted) {
    if (event.createUser_exclude === false) {
      const payload = {
        project,
        device,
        sender: userIdToAccept.toString(),
        receiver: event.created_by,
        section: sections.GLOBAL,
        tool: tools.DEFAULT,
        unit: calendarUnit._id,
        action: 'calendar_accepted',
        is_global: true,
        reference_id: event._id,
        reference_data: {
          expired: event.repeat_end_date,
          messageElements: [
            { search: '{{user_name}}', replacer: user.full_name },
          ],
        },
      };

      userIds.push(event.created_by.toString());
      NotificationService.notify(payload, {}, socketClient);
    }

    socketClient('__admin_events__', {
      event: 'accept:event',
      room: userIds,
      except: device._id,
      data: {
        project_id: project._id,
        user_id: user._id,
        unit_id: calendarUnit._id,
        device_id: device._id,
        event_id: event._id,
      },
    });
  }
};

const rejectEvent = async ({
  user, eventId, reqBody, project, device,
}) => {
  const event = await EventRepository.getEventById({ filters: eventId });
  if (!event) {
    throw new BadRequest('no_event_found');
  }
  const { eventDetailId, dayStartDate, reason } = reqBody;
  const userIdToReject = user._id;
  let fetchEventDetailsOptions;

  if (!eventDetailId && !dayStartDate) {
    fetchEventDetailsOptions = { filters: { invited_users: { $elemMatch: { user_id: userIdToReject } }, event_id: eventId } };
  } else if (eventDetailId && !dayStartDate) {
    fetchEventDetailsOptions = { filters: { invited_users: { $elemMatch: { user_id: userIdToReject } }, _id: eventDetailId } };
  } else if (!eventDetailId && dayStartDate) {
    fetchEventDetailsOptions = { filters: { invited_users: { $elemMatch: { user_id: userIdToReject } }, event_id: eventId, start_datetime: { $gte: dayStartDate } } };
  }
  const eventsWithUser = await EventDetailRepository.fetchEventDetails(fetchEventDetailsOptions);

  if (!eventsWithUser || eventsWithUser.length === 0) {
    throw new BadRequest('user_not_found_in_invitation_list');
  }

  eventsWithUser.forEach(async (eventDetail) => {
    const invitedUsers = eventDetail.invited_users;
    const userIndex = invitedUsers.findIndex(
      (userReject) => userReject.user_id.toString() === userIdToReject.toString(),
    );

    if (userIndex !== -1 && invitedUsers[userIndex].status !== constants.userStatus.rejected) {
      invitedUsers[userIndex].status = constants.userStatus.rejected;
      invitedUsers[userIndex].reason = reason;
      await eventDetail.save();
    }
  });

  const calendarUnit = await _getCalendarUnit({ project }).select('_id');
  const basicFilter = { event_id: eventId };
  const eventDetail = await EventDetailRepository.fetchEventDetails({ filters: basicFilter });
  const eventIds = eventDetail.map((events) => events.invited_users);
  const userIds = eventIds[0].map((iu) => iu.user_id.toString());
  if (!project.deleted) {
    if (event.createUser_exclude === false) {
      const payload = {
        project,
        device,
        sender: userIdToReject.toString(),
        receiver: [event.created_by],
        section: sections.GLOBAL,
        tool: tools.DEFAULT,
        unit: calendarUnit._id,
        action: 'calendar_rejected',
        is_global: true,
        reference_id: event._id,
        reference_data: {
          expired: event.repeat_end_date,
          messageElements: [
            { search: '{{user_name}}', replacer: user.full_name },
          ],
        },
      };

      userIds.push(event.created_by.toString());
      NotificationService.notifyAll(payload, {}, socketClient);
    }

    socketClient('__admin_events__', {
      event: 'reject:event',
      room: userIds,
      except: device._id,
      data: {
        project_id: project._id,
        user_id: user._id,
        device_id: device._id,
        unit_id: calendarUnit._id,
        event_id: eventId,
        reason,
      },
    });
  }
};

export default {
  createEvent,
  getEvent,
  listEvents,
  boxListEvents,
  editEvent,
  deleteEvents,
  invitationDetailList,
  invitationList,
  acceptEvent,
  rejectEvent,
};
