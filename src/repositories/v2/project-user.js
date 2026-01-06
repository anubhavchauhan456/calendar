import ProjectUser from 'zillit-libs/mongo-models-v2/ProjectUser';

const fetchProjectUsers = ({ filters }) => ProjectUser.find(filters);

export default {
  fetchProjectUsers,
};
