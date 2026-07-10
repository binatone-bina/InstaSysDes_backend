import redisClient from '../../config/redis';
import { FeedRepository } from './feed.repository';
import { PostService } from '../post/post.service';

const feedRepo = new FeedRepository();
const postService = new PostService();

export class FeedService {

    async getHomeFeed(userId: string, limit: number) {
        const zsetKey = `feed:user:${userId}`;
        let normalPostIds : {id: string, timestamp: number }[] = [];

        //STEP 1: Fetch Push Data(normal followers)
        const cachedNormalPosts = await redisClient.zRangeWithScores(zsetKey, 0, limit - 1, { REV: true});

        if(cachedNormalPosts.length > 0) {
            // Cache Hit
            normalPostIds = cachedNormalPosts.map(p => ({ id: p.value, timestamp: p.score }));
        } else {
            //Cache Miss Fallback
            const dbNormalPosts = await feedRepo.getNormalFollowingsPosts(userId, limit);
            normalPostIds = dbNormalPosts.map((p: any) => ({ id: p.post_id, timestamp: new Date(p.created_at).getTime() }));

            //Async Repopulation
            if(normalPostIds.length > 0) {
                this.asyncRepopulateZSet(zsetKey, normalPostIds);
            }
        }

        //Step 2: Fetch Pull Data(celebrity followers)
        let celebPostIds: {id: string, timestamp: number}[] = [];

        //First, know who they follow(you can cache this list in redis too for extra speed)
        const followedCelebs = await feedRepo.getFollowedCelebrityIds(userId);

        if(followedCelebs.length > 0) {
            //HMGET to grab all their latest posts instantly
            const globalCelebPosts = await redisClient.hmGet('feed:global:celebrities', followedCelebs);

            //Filter out nulls ( celebs who havent posted yet)
            const validCelebPostIds = globalCelebPosts.filter(id => id !== null) as string[];

            if(validCelebPostIds.length > 0) {
                //We need their timstamps for sorting. Post hydration will provide this
                //For now, we store them to be merged
                celebPostIds = validCelebPostIds.map(id => ({ id, timestamp: Date.now() })); // Approximated until hydration
    
            }
        }

        //Step 3: The interleveling / merge logic
        const mergedIds = [...normalPostIds, ...celebPostIds];

        //Remove duplicates (in case a celeb is accidently in the normal ZSET)
        const uniqueIds = Array.from(new Map(mergedIds.map(item => [item.id, item])).values());

        //Sort chronologically (newest first)
        uniqueIds.sort((a, b) => b.timestamp - a.timestamp);
        const finalIdsToFetch = uniqueIds.slice(0, limit).map(item => item.id);

        if(finalIdsToFetch.length === 0) return [];

        //Step 4: Post Hydration
        //Make a bulk call to Post Service to fetch the full JSON of these Ids
        const hydratedPosts = await postService.getPostsByIds(finalIdsToFetch);

        return hydratedPosts;

    }
    private async asyncRepopulateZSet(key: string, posts: { id: string, timestamp: number }[]) {
        try {
        const zsetArgs = posts.map(p => ({ score: p.timestamp, value: p.id }));
        await redisClient.zAdd(key, zsetArgs);
        await redisClient.expire(key, 86400); // 24 hour TTL
        } catch (error) {
        console.error('Failed to repopulate feed cache', error);
        }
    }
}