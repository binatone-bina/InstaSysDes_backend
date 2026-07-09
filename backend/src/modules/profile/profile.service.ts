import pool from '../../config/database';

import { ProfileRepository } from './profile.repository';
import redisClient from '../../config/redis';

const profileRepo = new ProfileRepository();
const Cache_TTL = 120; //Cache TTL in seconds (2 minutes)

export class ProfileService {

    constructor() {
        //Start the automatic celebrity promotion engine
        this.startCelebrityPromotionWorker();
    }
    
    async getProfile(userId: string) {
        const cacheKey = `profile:view:${userId}`;

        //1. check redis cache first
        const cachedProfile = await redisClient.get(cacheKey);
        if(cachedProfile) {
            return JSON.parse(cachedProfile);
        }

        //2. cache miss: fetch from db
        const profile = await profileRepo.getProfileById(userId);
        if(!profile) {
            throw new Error('Profile not found');
        }

        //3. populate cache with a ttl
        await redisClient.setEx(cacheKey, Cache_TTL, JSON.stringify(profile));
        
        return profile;
    }

    async updateProfile(userId: string, updates: any ) {
        const updatedProfile = await profileRepo.updateProfile(userId, updates);

        //Cache Eviction: instantly delete the old cached profile so next read gets fresh data
        await redisClient.del(`profile:view:${userId}`);

        return updatedProfile;
    }

    async searchUsers(query: string, limit: number) {
        //Direct DB hit: we dont cache search queries bcoz they are highly variable
        //and the text_pattern_ops index handles it efficiently at the DB level
        return await profileRepo.searchProfiles(query, limit);
    }

    private startCelebrityPromotionWorker() {
        console.log('🌟 Celebrity Promotion Monitor Active.');

        //Runs every 10 secs in testing, in production will be every 1-2 hrs
        setInterval(async () => {
            try {
                // Find anyone who has 5 or more followers but isn't a celebrity yet
                const query = `
                UPDATE profiles 
                SET is_celebrity = TRUE 
                WHERE follower_count >= 5 AND is_celebrity = FALSE
                RETURNING user_id;
                `;
                
                const res = await pool.query(query);

                if (res.rows.length > 0) {
                console.log(`🎉 Automatically promoted ${res.rows.length} users to Celebrity status!`);
                
                // Instantly evict their cache!
                // This ensures the next time the Follow or Post Service looks them up, 
                // it sees is_celebrity = true and routes them to the high-speed Redis buffers.
                for (const row of res.rows) {
                    await redisClient.del(`profile:view:${row.user_id}`);
                }
                }
            } catch (error) {
                console.error('❌ Error in Celebrity Promotion Worker:', error);
            }
            }, 10000);
    }
}