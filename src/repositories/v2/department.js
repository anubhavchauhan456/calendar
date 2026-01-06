import Department from 'zillit-libs/mongo-models-v2/Departments';

const fetchDepartment = ({ filters }) => Department.findOne(filters);

export default {
  fetchDepartment,
};
