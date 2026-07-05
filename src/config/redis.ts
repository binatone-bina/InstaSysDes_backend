import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL, 
  // Add a socket reconnect strategy so it doesn't slam your terminal if it fails
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) {
        return new Error('Redis connection failed permanently.');
      }
      return 1000; // Retry every 1 second
    }
  }
});

redisClient.on('error', (err) => console.error('❌ Redis Error:', err.message));

export default redisClient;