import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { AuthRequest } from '../../common/middlewares/auth.middleware';

const chatService = new ChatService();

export class ChatController {

    async createOrGetDM(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = req.user as AuthRequest['user'] as { userId: string };
            const { recipient_id } = req.body;

            if(!recipient_id){
                res.status(400).json({ success: false, error: 'recipient_id is required'});
                return;
            }

            const result = await chatService.establishDM(user.userId, recipient_id );
            res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async sendMessage(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = req.user as AuthRequest['user'] as { userId: string };
            const { conversationId } = req.params as { conversationId: string };
            const { content, image_url } = req.body;

            const message = await chatService.sendMessage(
                conversationId,
                user.userId,
                content,
                image_url
            );

            res.status(201).json({ success:true, data: message });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async getMessages(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = req.user as AuthRequest['user'] as { userId: string };
            const {conversationId} = req.params as { conversationId: string };
            const limit = parseInt(req.query.limit as string) || 20;
            const cursor = req.query.cursor as string | undefined;

            const messages = await chatService.getMessages(conversationId, user.userId, limit, cursor);
            res.status(200).json({ success: true, data: messages });
        } catch (error :any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getInbox(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = req.user as AuthRequest['user'] as { userId: string };
            const limit = parseInt(req.query.limit as string) || 20;
            const cursor = req.query.cursor as string | undefined;

            const inbox = await chatService.getUserInbox(user.userId, limit, cursor);
            res.status(200).json({ success: true, data: inbox });
        } catch ( error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async createGroup(req: AuthRequest, res: Response): Promise<void> {
     try {
        const user = req.user as AuthRequest['user'] as { userId: string };
        const { name, participant_ids } = req.body;

        if (!Array.isArray(participant_ids)) {
            res.status(400).json({ success: false, error: 'participant_ids must be an array' });
            return;
        }

        const result = await chatService.createGroup(name, user.userId, participant_ids);
        res.status(201).json({ success: true, data: result });
        } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
        }
    }

    async addMember(req: AuthRequest, res: Response): Promise<void> {
        try {
        const user = req.user as AuthRequest['user'] as { userId: string };
        const { conversationId } = req.params as { conversationId: string };
        const { user_id_to_add } = req.body;

        if (!user_id_to_add) {
            res.status(400).json({ success: false, error: 'user_id_to_add is required' });
            return;
        }

        const result = await chatService.addMember(conversationId, user.userId, user_id_to_add);
        res.status(200).json(result);
        } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
        }
    }

    async removeMember(req: AuthRequest, res: Response): Promise<void> {
        try {
        const user = req.user as AuthRequest['user'] as { userId: string };
        const { conversationId } = req.params as { conversationId: string };
        const { user_id_to_remove } = req.body;

        if (!user_id_to_remove) {
            res.status(400).json({ success: false, error: 'user_id_to_remove is required' });
            return;
        }

        const result = await chatService.removeMember(conversationId, user.userId, user_id_to_remove);
        res.status(200).json(result);
        } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
        }
    }

    async leaveGroup(req: AuthRequest, res: Response): Promise<void> {
        try {
        const user = req.user as AuthRequest['user'] as { userId: string };
        const { conversationId } = req.params as { conversationId: string };

        const result = await chatService.leaveGroup(conversationId, user.userId);
        res.status(200).json(result);
        } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
        }
    }

}