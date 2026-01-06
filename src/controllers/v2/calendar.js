import ApiResponse from 'zillit-libs/utils/api-response';
import CalendarService from '../../services/v2/calendar';

class CALENDAR {
  constructor() {
    this.version = 2;
  }

  async createEvent(req, res) {
    const {
      project, device, body, user, headers,
    } = req;
    const { moduledata } = headers;
    try {
      await CalendarService.createEvent({
        project, device, user, reqBody: body, moduledata,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_event_created', data: {} });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async listEvents(req, res) {
    const {
      project, user,
    } = req;

    const { epochStartDate, epochEndDate } = req.query;

    try {
      const data = await CalendarService.listEvents({
        project, epochStartDate, epochEndDate, user,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_events_obtained_successfully', data });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async boxListEvents(req, res) {
    const {
      project, user,
    } = req;

    const { epochStartDate, epochEndDate } = req.query;

    try {
      const data = await CalendarService.boxListEvents({
        project, epochStartDate, epochEndDate, user,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_events_obtained_successfully', data });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async getEvent(req, res) {
    const {
      project, user,
    } = req;
    const { eventId } = req.params;

    try {
      const data = await CalendarService.getEvent({
        project, user, eventId,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_event_obtained_successfully', data });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async invitationDetailList(req, res) {
    const {
      project, user, query,
    } = req;
    try {
      const data = await CalendarService.invitationDetailList({
        project, user, query,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_invitation_detail_obtained_successfully', data });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async invitationList(req, res) {
    const {
      project, user, query,
    } = req;
    try {
      const data = await CalendarService.invitationList({
        project, user, query,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_events_obtained_successfully', data });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async deleteEvents(req, res) {
    const {
      project, device, user,
    } = req;
    const { eventDetailId, dayStartDate } = req.query;
    const { eventId } = req.params;
    try {
      await CalendarService.deleteEvents({
        project, user, device, eventId, eventDetailId, dayStartDate,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_event_deleted_successfully' });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async acceptEvent(req, res) {
    const {
      project, device, user, body,
    } = req;
    const { eventId } = req.params;
    try {
      await CalendarService.acceptEvent({
        project, device, user, eventId, reqBody: body,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_invitation_accepted' });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async rejectEvent(req, res) {
    const {
      project, device, user, body,
    } = req;
    const { eventId } = req.params;
    try {
      const data = await CalendarService.rejectEvent({
        project, device, user, eventId, reqBody: body,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_invitation_rejected', data });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }

  async editEvent(req, res) {
    const {
      project, device, user, body, headers,
    } = req;
    const { eventId } = req.params;
    const { moduledata } = headers;
    try {
      await CalendarService.editEvent({
        project, device, user, eventId, reqBody: body, moduledata,
      });
      return ApiResponse.handleResponse(res, { message: 'calendar_event_edited', data: {} });
    } catch (error) {
      return ApiResponse.handleError(res, error);
    }
  }
}

export default new CALENDAR();
