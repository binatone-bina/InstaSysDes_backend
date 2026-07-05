import express from 'express';
import dotenv from 'dotenv';
import pool from './config/database';
import redisClient from './config/redis';
import cookieParser from 'cookie-parser';

import authRoutes from './modules/auth/auth.routes';
import followRoutes from './modules/follow/follow.routes';
import postRoutes from './modules/post/post.routes';
import profileRoutes from './modules/profile/profile.routes';
import feedRoutes from './modules/feed/feed.routes';

import { createServer } from 'http';
import { chatGateway } from './modules/chat/chat.gateway';

import chatRoutes from './modules/chat/chat.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(cookieParser());

//Exposes your backend 'uploads' folder so the frontend can load images via URL
app.use('/uploads', express.static('uploads'));

//API Routes

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/follows', followRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/feed', feedRoutes);
app.use('/api/v1/chats', chatRoutes);

// Server and web socket setup
const httpServer = createServer(app);

//Attach the WebSocket Gateway to the same http server(runs on port 3000 too)
chatGateway.init(httpServer);



async function startServer() {
  try {
    // 1. Test PostgreSQL
    const dbTest = await pool.query('SELECT NOW()');
    console.log('🐘 PostgreSQL is alive and running. dbtT:', dbTest.rows[0].now);

    // 2. Connect to Redis explicitly and THEN ping
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    const redisTest = await redisClient.ping();
    console.log('❤️ Redis is alive and responding:', redisTest);

    // 3. Start Web Server & WebSockets TOGETHER
    // 🚀 FIX: Use httpServer.listen instead of app.listen!
    httpServer.listen(PORT, () => {
      console.log(`🚀 HTTP & WebSockets running perfectly on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Critical Error during server startup:', error);
    process.exit(1);
  }
}

startServer();


