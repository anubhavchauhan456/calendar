import ChatRoom from 'zillit-libs/mongo-models-v2/ChatRooms';

const fetchChatRoom = ({ filters }) => ChatRoom.findOne(filters);

export default {
  fetchChatRoom,
};
