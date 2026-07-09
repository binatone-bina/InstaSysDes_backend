import { Router } from 'express';
import { ChatController } from './chat.controller';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();
const chatController = new ChatController();

// All chat routes require the user to be logged in
router.use(requireAuth);

// 1. Inbox View
router.get('/', chatController.getInbox);

// 2. Create / Get a DM Conversation
router.post('/dm', chatController.createOrGetDM);

// 3. Message History
router.get('/:conversationId/messages', chatController.getMessages);

// 4. Send a Message
router.post('/:conversationId/messages', chatController.sendMessage);

// 5. Create a Group Chat
router.post('/group', chatController.createGroup);

// 6. Add a Member to a Group Chat
router.post('/:conversationId/members', chatController.addMember);

// 7. Remove a Member from a Group Chat
router.delete('/:conversationId/members', chatController.removeMember);

// 8. Leave a Group Chat
router.post('/:conversationId/leave', chatController.leaveGroup);

// 9. Get Group Participants(Added later)
router.get('/:conversationId/participants', chatController.getGroupParticipants);

export default router;