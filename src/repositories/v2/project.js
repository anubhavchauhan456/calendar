import Project from 'zillit-libs/mongo-models-v2/Project';

const fetchProjects = ({ filters }) => Project.find(filters);
const fetchProject = ({ filters }) => Project.findOne(filters);

export default {
  fetchProjects,
  fetchProject,
};
