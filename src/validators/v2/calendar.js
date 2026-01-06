import Joi from 'joi-oid';

const user = Joi.object().keys({
  user_id: Joi.objectId()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_user_id_validation';
      return errorObj;
    }),
});

const event = Joi.object({
  title: Joi.string()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_title_validation';
      return errorObj;
    }),
  description: Joi.string()
    .optional()
    .allow('')
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_description_validation';
      return errorObj;
    }),
  location: Joi.object()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_location_validation';
      return errorObj;
    }),
  location_description: Joi.string()
    .optional()
    .allow('')
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_location_description_validation';
      return errorObj;
    }),
  start_datetime: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_start_datetime_validation';
      return errorObj;
    }),
  end_datetime: Joi.number()
    .required()
    .greater(Joi.ref('start_datetime'))
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_end_datetime_validation';
      return errorObj;
    }),
  full_day: Joi.boolean()
    .optional()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_full_day_validation';
      return errorObj;
    }),
  type: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_member_option_validation';
      return errorObj;
    }),
  repeat_status: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_repeat_status_validation';
      return errorObj;
    }),
  repeat_end_date: Joi.number()
    .optional()
    .greater(Joi.ref('start_datetime'))
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_repeat_end_date_validation';
      return errorObj;
    }),
  notify: Joi.number()
    .optional()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_notify_validation';
      return errorObj;
    }),
  invited_users: Joi.array()
    .items(user)
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_invited_users_validation';
      return errorObj;
    }),
  selectedDays: Joi.array()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_selectedDays_validation';
      return errorObj;
    }),
  reference_id: Joi.objectId().optional(),
});

const editEvent = Joi.object({
  title: Joi.string()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_title_validation';
      return errorObj;
    }),
  description: Joi.string()
    .optional()
    .allow('')
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_description_validation';
      return errorObj;
    }),
  location: Joi.object()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_location_validation';
      return errorObj;
    }),
  location_description: Joi.string()
    .optional()
    .allow('')
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_location_description_validation';
      return errorObj;
    }),
  start_datetime: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_only_start_date_validation';
      return errorObj;
    }),
  end_datetime: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_only_end_date_validation';
      return errorObj;
    }),
  full_day: Joi.boolean()
    .optional()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_full_day_validation';
      return errorObj;
    }),
  type: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_member_option_validation';
      return errorObj;
    }),
  repeat_status: Joi.number()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_repeat_status_validation';
      return errorObj;
    }),
  repeat_end_date: Joi.number().optional(),
  notify: Joi.number()
    .optional()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_notify_validation';
      return errorObj;
    }),
  invited_users: Joi.array()
    .items(user)
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_invited_users_validation';
      return errorObj;
    }),
  selectedDays: Joi.array()
    .required()
    .error((err) => {
      const errorObj = err;
      errorObj[0].message = 'calendar_selectedDays_validation';
      return errorObj;
    }),
});

export default {
  event,
  editEvent,
};
