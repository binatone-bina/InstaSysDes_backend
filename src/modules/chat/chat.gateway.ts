import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../../common/middlewares/auth.middleware'; 
import fs from 'fs';
import path from 'path';

import { ChatRepository } from './chat.repository';

const chatRepo = new ChatRepository();

//The in-memory map replacing Redis Pub/Sub 
// (AS ONLY ONE WEB SERVER CAN BE MADE WITH ONLY ONE BACKEND SERVER)
//Maps userId -> socketId (no serverId reqed)

export const activeUserSockets = new Map<string, string>();

const publicKey = fs.readFileSync(path.join(process.cwd(), 'keys', 'jwtRS256.key.pub'), 'utf8');

export class ChatGateway {
    private io!: Server;

    // Instead of a constructor, we use an init method to bind the server later
    public init(server: any) {
        this.io = new Server(server, {
        path: '/api/v1/chat/connect/', // No trailing slash!
        cors: { origin: '*' }
        });

        this.setupMiddleware();
        this.setupListeners();
        console.log('🔌 WebSocket Gateway Initialized successfully');
    }

    private setupMiddleware() {
        console.log("entered the setupMiddleare func");
        this.io.use((socket, next) => {
            console.log("middleware entered");
            //Extract JWT from connection query (ws://.../?token=JWT)
            const token = socket.handshake.query.token as string;

            if(!token) return next(new Error('Authentication error: Token missing'));

            try {
                 const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
                 //Attach user info directly to socket connection object
                 socket.data.user = decoded;
                 next();
            } catch (error) {
                next(new Error('Authentication error: Invalid token'));
            }
        });
    }

    private setupListeners() {
        this.io.on('connection', (socket: Socket) => {
            const userId = socket.data.user.userId;

            //1. Mark User as Online
            activeUserSockets.set(userId, socket.id);
            console.log(`🟢User ${userId} connected. (Socket: ${socket.id})`);

            //2. Handle typing status (Zero-Persistence)
            socket.on('TYPING_START', (data: { recipientId: string, conversationId: string }) => {
                const recipientSocketId = activeUserSockets.get(data.recipientId);
                if(recipientSocketId) {
                    this.io.to(recipientSocketId).emit('USER_TYPING', {
                        conversationId: data.conversationId,
                        userId: userId
                    });
                }
            });

            // 3. Listen for Delivery Receipts
            socket.on('MESSAGE_DELIVERED', async (data: { messageId: string }) => {
                try {
                const updatedMessage = await chatRepo.markMessageDelivered(data.messageId);
                if (updatedMessage) {
                    // Notify the original sender that their message was delivered (Two Grey Ticks)
                    this.emitMessageToUser(
                    updatedMessage.sender_id, 
                    'RECEIPT_DELIVERED', 
                    { messageId: updatedMessage.id, deliveredAt: updatedMessage.delivered_at }
                    );
                }
                } catch (error) {
                console.error('Failed to update delivery status:', error);
                }
            });

            // 4. Listen for Read Receipts
            socket.on('MESSAGE_READ', async (data: { messageId: string }) => {
                try {
                const updatedMessage = await chatRepo.markMessageRead(data.messageId);
                if (updatedMessage) {
                    // Notify the original sender that their message was read (Two Blue Ticks)
                    this.emitMessageToUser(
                    updatedMessage.sender_id, 
                    'RECEIPT_READ', 
                    { messageId: updatedMessage.id, readAt: updatedMessage.read_at }
                    );
                }
                } catch (error) {
                console.error('Failed to update read status:', error);
                }
            });

            //5. Handle Disconnect
            socket.on('disconnect', () => {
                activeUserSockets.delete(userId);
                console.log(`🔴User ${userId} disconnected. (Socket: ${socket.id})`);
            });
        });
    }

    //Utility method for our HTTP API COntrollers to call when a message is saved
    public emitMessageToUser(recipientId: string, eventName: string, payload: any) {
        const socketId = activeUserSockets.get(recipientId);
        if(socketId) {
            this.io.to(socketId).emit(eventName, payload);
        }
    }
}

export const chatGateway = new ChatGateway();