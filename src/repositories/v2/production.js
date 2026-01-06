import Productions from 'zillit-libs/mongo-models-v2/ProductionActivity';

const updateProduction = ({ filters, data }) => Productions.updateOne({ ...filters }, { $set: { ...data } });

export default {
  updateProduction,
};
