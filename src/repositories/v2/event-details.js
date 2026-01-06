import EventDetails from 'zillit-libs/mongo-models-v2/EventDetails';

const createEventDetail = (data) => EventDetails.create(data);

const fetchEventDetail = ({ filters }) => EventDetails.findOne(filters);

const fetchEventDetails = ({ filters }) => EventDetails.find(filters).sort({ start_datetime: 1 });

const fetchDistinctEvents = ({ filters }) => EventDetails.distinct('event_id', filters);

const updateEventDetails = ({ filters, data }) => EventDetails.updateMany({ ...filters }, { $set: { ...data } });

const deleteEventDetail = ({ filters }) => EventDetails.deleteOne({ ...filters });

const deleteEventDetails = ({ filters }) => EventDetails.deleteMany({ ...filters });

const getEventDetailCount = async ({ filters }) => EventDetails.find({ ...filters }).countDocuments();

export default {
  createEventDetail,
  fetchEventDetail,
  fetchEventDetails,
  fetchDistinctEvents,
  updateEventDetails,
  deleteEventDetail,
  deleteEventDetails,
  getEventDetailCount,
};
