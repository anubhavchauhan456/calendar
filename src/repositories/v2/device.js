import Device from 'zillit-libs/mongo-models-v2/Device';

const fetchDevices = ({ filters }) => Device.find(filters);

export default {
  fetchDevices,
};
