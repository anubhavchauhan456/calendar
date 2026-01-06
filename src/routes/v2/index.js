import express from 'express';
import moduleData from 'zillit-libs/middlewares-v2/module-data';
import checkAccess from 'zillit-libs/middlewares-v2/check-access';
import calendar from './calendar';

const router = express.Router();
router.use('/calendar', moduleData(['device_id', 'project_id', 'user_id']), checkAccess, calendar);

export default router;
