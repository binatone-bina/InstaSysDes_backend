import { ChatRepository } from './chat.repository';
import { chatGateway } from './chat.gateway'; 
const chatRepo = new ChatRepository();

export class ChatService {
  
  async establishDM(senderId: string, recipientId: string) {
    if (senderId === recipientId) throw new Error("You cannot DM yourself.");
    
    const conversationId = await chatRepo.createOrGetDM(senderId, recipientId);
    return { conversationId };
  }

  async sendMessage(conversationId: string, senderId: string, content?: string, imageUrl?: string) {
    if (!content && !imageUrl) {
      throw new Error("Message must contain either text or an image.");
    }

    // 1. Save to Database
    const message = await chatRepo.saveMessage(conversationId, senderId, content, imageUrl);

    // 2. Identify who needs to receive this via WebSockets
    // (For a DM, we just need the 'other' person. For a group, we loop the participants).
    // Let's assume for a second we have a quick helper to get recipient IDs:
    const recipients = await this.getOtherParticipants(conversationId, senderId);

    // 3. Fire WebSocket events to anyone who is currently online
    for (const recipientId of recipients) {
       chatGateway.emitMessageToUser(recipientId, 'RECEIVE_MESSAGE', message);
    }

    return message;
  }

  async getMessages(conversationId: string, requestorId:string, limit: number, cursor?: string) {
    console.log(`Fetching messages for conversation ${conversationId} for user ${requestorId} }`);
    const isMember = await chatRepo.isParticipant(conversationId, requestorId);
    if (!isMember) throw new Error("Unauthorized: You are not a member of this conversation.");
    
    return await chatRepo.getChatHistory(conversationId, limit, cursor);
  }

  async getUserInbox(userId: string, limit: number, cursor?: string) {
    return await chatRepo.getInbox(userId, limit, cursor);
  }

  // Quick helper to find who else is in the chat
    async getOtherParticipants(conversationId: string, senderId: string) {
        // Usually, you'd put this in chatRepo, but keeping it brief:
        //const res = await chatRepo.getChatHistory(conversationId, 1); // just a placeholder concept
        return await chatRepo.getConversationParticipantIds(conversationId, senderId);
    }

    // 1. Add this new method to create a group
    async createGroup(name: string, creatorId: string, participantIds: string[]) {
        if (!name || name.trim() === '') throw new Error("Group name is required.");
        
        // Ensure the creator is included in the participant list, and remove duplicates
        const allParticipants = Array.from(new Set([...participantIds, creatorId]));
        
        if (allParticipants.length < 2) {
        throw new Error("A group must have at least 2 members.");
        }

        const conversationId = await chatRepo.createGroupChat(name, allParticipants);
        return { conversationId, name, participants: allParticipants };
    }

    // Add a member to a group
    async addMember(conversationId: string, requestorId: string, memberToAddId: string) {
        // Basic Auth: Check if the person making the request is actually in the group
        const isMember = await chatRepo.isParticipant(conversationId, requestorId);
        if (!isMember) throw new Error("Unauthorized: You are not a member of this group.");

        await chatRepo.addParticipant(conversationId, memberToAddId);
        
        // System message or real-time event could be triggered here later!
        return { success: true, message: `User ${memberToAddId} added.` };
    }

    // Remove a member from a group
    async removeMember(conversationId: string, requestorId: string, memberToRemoveId: string) {
        const isMember = await chatRepo.isParticipant(conversationId, requestorId);
        if (!isMember) throw new Error("Unauthorized: You are not a member of this group.");

        await chatRepo.removeParticipant(conversationId, memberToRemoveId);
        return { success: true, message: `User ${memberToRemoveId} removed.` };
    }

    // Voluntarily leave a group
    async leaveGroup(conversationId: string, userId: string) {
        const isMember = await chatRepo.isParticipant(conversationId, userId);
        if (!isMember) throw new Error("You are not a member of this group.");

        await chatRepo.removeParticipant(conversationId, userId);
        return { success: true, message: "You have left the group." };
    }


}