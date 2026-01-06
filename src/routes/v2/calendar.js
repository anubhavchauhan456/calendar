import express from 'express';
import joiValidator from 'zillit-libs/middlewares-v2/joi-validator';
import Calendar from '../../controllers/v2/calendar';
import CalendarValidators from '../../validators/v2/calendar';

const router = express.Router();

router.route('/').post(joiValidator(CalendarValidators.event), Calendar.createEvent);
router.route('/events').get(Calendar.listEvents);
router.route('/box/events').get(Calendar.boxListEvents);
router.route('/event/:eventId').get(Calendar.getEvent);
router.route('/invite').get(Calendar.invitationList);
router.route('/invitationlist').get(Calendar.invitationDetailList);
router.route('/:eventId').delete(Calendar.deleteEvents);
router.route('/accept/:eventId').put(Calendar.acceptEvent);
router.route('/reject/:eventId').put(Calendar.rejectEvent);
router.route('/edit/:eventId').put(joiValidator(CalendarValidators.editEvent), Calendar.editEvent);

export default router;
