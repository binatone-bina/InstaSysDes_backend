import { FollowRepository } from "./follow.repository";
import redisClient from "../../config/redis";

const followRepo = new FollowRepository();
const CELEBRITY_THRESHOLD = 5; //low threshHold for development testing

export class FollowService {
    constructor(){
        //Start background worker loop automatically when service spawns
        this.startBatchWorker();
    }

    async follow(followerId: string, followingId: string) {
        if(followerId === followingId) throw new Error("You cannot follow yourself");

        //1. Check if target user is cached as a celebrity or calculate via redis counters
        const cachedCount = await redisClient.get(`profile:${followingId}:follower_count`);
        const currentFollowers = cachedCount ? parseInt(cachedCount) : 0;

        if(currentFollowers >= CELEBRITY_THRESHOLD) {
            // Celeb path: fast ingestion write buffer
            const payload = JSON.stringify({ followerId, followingId});
            await redisClient.lPush('celebrity:follows:queue', payload);

            //Increment real time counters instantly in redis cache
            await redisClient.incr(`profile:${followingId}:follower_count`);
            await redisClient.incr(`profile:${followerId}:following_count`);
            return { status: 'queued', message: 'Follow processed via buffer.'};

        }
        //Normal path : synchronous write through
        await followRepo.followDirect(followerId, followingId);
        return { status: 'success', message: 'Followed successfully '};
    }

    async unfollow(followerId: string, followingId: string) {
        await followRepo.unfollow(followerId, followingId);
        //Invalidate Redis profile cache counters if they exist
        await redisClient.del(`profile:${followingId}:follower_count`);
        await redisClient.del(`profile:${followerId}:following_count`);
        return { status: 'success', message: 'Unfollowed successfully'};
    }

    async getFollowersList (userId: string, limit: number, cursor?: string) {
        return await followRepo.getFollowers(userId, limit, cursor);
    }
    async getFollowingList( userId: string, limit: number, cursor?: string) {
        return await followRepo.getFollowing(userId, limit, cursor);
    }
    async getMutual( userA: string, userB: string) {
        return await followRepo.getMutualFollowing(userA, userB);
    }

    
    //Background Processing queue engine
    private startBatchWorker() {
        console.log('👷‍♂️ Follow Batch Ingestion Worker started successfully');

        setInterval(async () => {
            try {
                const batchSize = 500;
                const followPairs: { followerId: string; followingId: string }[] = [];

                //Atomic multi-pop from redis queue list
                for(let i = 0; i < batchSize; i++) {
                    const item = await redisClient.rPop('celebrity:follows:queue');
                    if(!item) break;
                    followPairs.push(JSON.parse(item));
                }

                if(followPairs.length > 0) {
                    console.log(`📝 Processing batch of ${followPairs.length} celebrity follows`);
                    await followRepo.batchInsertFollows(followPairs);

                    console.log('Processed!!');
                }

            } catch (err) {
                console.error('❌ Error processing queue batch:', err);
            }
        }, 5000) //Flushes to the db every 5 sec;
    }
    

}