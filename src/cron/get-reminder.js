import NotificationService from 'zillit-libs/services-v2/notification';
import BadRequest from 'zillit-libs/errors/BadRequest';
import socketClient from '../config/socketClient';
import EventDetailRepository from '../repositories/v2/event-details';
import EventRepository from '../repositories/v2/event';
import ProjectsRepository from '../repositories/v2/project';
import ProjectUserRepository from '../repositories/v2/project-user';
import HomeUnitRepository from '../repositories/v2/home-unit';

const { sections, tools } = NotificationService.NotificationConstants;

const getReminder = async () => {
  try {
    const currentTime = Date.now();

    // Fetch all event details that meet the criteria
    const allEvents = await EventDetailRepository.fetchEventDetails({
      filters: {
        next_reminder: { $lte: currentTime, $gt: 0 },
        notified: 0,
        deleted: 0,
      },
    });

    if (!allEvents.length) {
      throw new BadRequest('no_event_found');
    }

    // Fetch events related to the fetched event details
    const eventIds = allEvents.map((event) => event.event_id);

    const [allEvent] = await Promise.all([
      EventRepository.fetchEvents({ filters: { _id: { $in: eventIds } } }),
    ]);
    const eventDetailIds = allEvents.map((events) => events._id);
    const filters = { _id: { $in: eventDetailIds } };
    const data = { notified: 1 };
    const projectIds = allEvent.map((e) => e.project_id);
    const createdByIds = allEvent.map((e) => e.created_by);
    const projects = await ProjectsRepository.fetchProjects({
      filters: { _id: { $in: projectIds } },
    });
    const createbyId = await ProjectUserRepository.fetchProjectUsers({ filters: { _id: { $in: createdByIds } } });
    const receiverIds = allEvents.flatMap(({ event_id: eventId, _id: eventDetailId, invited_users: users }) => users.map((userId) => ({ eventId, eventDetailId, userId })));
    const calendarUnit = await HomeUnitRepository.fetchHomeUnit({ filters: { project_id: { $in: projectIds }, identifier: 'home_unit_calendar' } });

    allEvent.forEach(async (event) => {
      const project = projects.filter((item) => item._id.toString() === event.project_id.toString());
      const createby = createbyId.filter((item) => item._id.toString() === event.created_by.toString());
      const eventTitle = allEvents.filter((item) => item.event_id.toString() === event._id.toString());
      const nextReminder = eventTitle[0].start_datetime;

      const userIdsForEvent = receiverIds
        .filter(({ eventId }) => eventId.toString() === event._id.toString())
        .map(({ userId }) => userId.user_id);
      if (event.createUser_exclude === false) {
        userIdsForEvent.push(event.created_by);
      }
      if (userIdsForEvent.length > 0) {
        if (!project.deleted) {
          const payload = {
            project: project[0],
            sender: event.created_by,
            receiver: userIdsForEvent,
            section: sections.HOME,
            tool: tools.CALENDAR,
            unit: calendarUnit ? calendarUnit._id : null,
            action: 'calendar_reminder',
            reference_id: event._id,
            reference_data: {
              messageElements: [
                { search: '{{user_name}}', replacer: createby.length > 0 ? createby[0].full_name : 'User' },
                { search: '{{event_title}}', replacer: eventTitle[0].title },
                { search: '{{event_time}}', replacer: nextReminder },
              ],
            },
          };
          await NotificationService.notifyAll(payload, { save: false, self: true });
        }
      }
    });
    await EventDetailRepository.updateEventDetails({ filters, data });

    // Emit socket events for notifications
    eventDetailIds.forEach((eventId) => {
      socketClient('__admin_events__', {
        event: 'event:notify',
        room: `${eventId}_room`,
        data: { event_id: eventId },
      });
    });
  } catch (error) {
    console.log('[CALENDAR REMINDER]', error.message);
  }
};

export default getReminder;
