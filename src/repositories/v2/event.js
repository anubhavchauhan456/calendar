import Events from 'zillit-libs/mongo-models-v2/Events';

const createEvents = (data) => Events.create(data);

const fetchEvents = ({ filters }) => Events.find(filters).sort({ created: 1 });

const fetchEvent = ({ filters }) => Events.findOne(filters);

const countDocumentEvents = ({ filters }) => Events.countDocuments(filters);

const deleteEvent = ({ filters }) => Events.deleteOne({ ...filters });

const getEventById = ({ filters }) => Events.findById(filters);

const updateEvent = ({ filters, data }) => Events.updateOne({ ...filters }, { $set: { ...data } });

export default {
  createEvents,
  updateEvent,
  fetchEvent,
  fetchEvents,
  getEventById,
  countDocumentEvents,
  deleteEvent,
};
