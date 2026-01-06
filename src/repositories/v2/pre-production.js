import PreProductions from 'zillit-libs/mongo-models-v2/PreProductionActivity';
import PreProductionEvents from 'zillit-libs/mongo-models-v2/PreProductionEvent';

const updatePreProduction = ({ filters, data }) => PreProductions.updateOne({ ...filters }, { $set: { ...data } });

const updatePreProductionEvent = ({ filters, data }) => PreProductionEvents.updateOne({ ...filters }, { $set: { ...data } });

export default {
  updatePreProduction,
  updatePreProductionEvent,
};
