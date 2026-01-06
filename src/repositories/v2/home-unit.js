import HomeUnit from 'zillit-libs/mongo-models-v2/HomeUnit';

const fetchHomeUnit = ({ filters }) => HomeUnit.findOne(filters);

export default {
  fetchHomeUnit,
};
