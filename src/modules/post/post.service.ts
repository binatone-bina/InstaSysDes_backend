import 'crypto';
import { PostRepository } from './post.repository';
import redisClient from '../../config/redis';
import pool from '../../config/database';
import { ProfileService } from '../profile/profile.service';

const postRepo = new PostRepository();
const profileService = new ProfileService();

export class PostService {
    constructor(){
        //Fire up the sliding window flusher loops(every 5 sec)
        this.startSlidingWindowFlusher();
    }

    async createPost(userId: string, caption: string | undefined, mediaUrls: string[]) {
        const newPost = await postRepo.create(userId, caption, mediaUrls);

        // 🚀 FIX: Use the ProfileService to guarantee we catch the database fallback if cache is empty!
        const profile = await profileService.getProfile(userId); 
        const isCelebrity = profile ? profile.is_celebrity : false;

        if (isCelebrity) {
            // PULL STRATEGY: Update the Global Celebrity Hash
            await redisClient.hSet('feed:global:celebrities', userId, newPost.id);
        } else {
            // PUSH STRATEGY: Fan-out to followers' ZSETs
            const followers = await pool.query(`SELECT follower_id FROM follows WHERE following_id = $1`, [userId]);
            const timestamp = new Date(newPost.created_at).getTime();
            
            const pipeline = redisClient.multi();
            for (const row of followers.rows) {
                pipeline.zAdd(`feed:user:${row.follower_id}`, [{ score: timestamp, value: newPost.id }]);
            }
            await pipeline.exec();
        }
        return newPost;
    }

    async getProfileGrid(userId: string, limit: number, cursor?: string) {
        return await postRepo.getUserPostGrid(userId, limit, cursor);
    }

    //High Speed Interaction Buffer Core

    async toggleLike(postId: string, userId: string) {
        const likeSetKey = `post:${postId}:likes_set`;
        const hasLiked = await redisClient.sIsMember(likeSetKey, userId);

        let action : 'like' | 'unlike' = 'like';

        if(hasLiked) {
            //User is unliking
            await redisClient.sRem(likeSetKey, userId);
            await redisClient.decr(`post:${postId}:like_count`);
            action = 'unlike';
        }
        else {
            //User is liking
            await redisClient.sAdd(likeSetKey, userId);
            await redisClient.incr(`post:${postId}:like_count`);

        }

        //Queue interaction payload for background database settlement
        const eventPayload = JSON.stringify({postId, userId, action});
        await redisClient.lPush('posts:likes:queue', eventPayload);

        return {status: 'success', action, message: `Post ${action}d successfully.`};
    }

    async addComment(postId: string, userId: string, content: string) {
        const commentData = {
            id: crypto.randomUUID(),
            postId,
            userId,
            content,
            createdAt: new Date().toISOString()
        };

        //Fast memory ingestion
        await  redisClient.lPush(`post:${postId}:comments_list`, JSON.stringify(commentData));
        await redisClient.lTrim(`post:${postId}:comments_list`, 0, 99); //keep latest 100 cache strings
        await redisClient.incr(`post:${postId}:comment_count`);

        //Append to pipeline background flush queue
        await redisClient.lPush('posts:comments:queue', JSON.stringify(commentData));

        return { status: 'success', comment: commentData };
    }

    async getPostComments(postId: string, limit: number, cursor?: string) {
        //Read from persistent store (can fall back to cache lists if needed)
        return await postRepo.getCommentsPaginated(postId, limit, cursor);
    }

    async getPostsByIds(ids: string[]) {
        return await postRepo.getPostsByIds(ids);
    }

    //Background Processing engines
    private startSlidingWindowFlusher() {
        console.log('🚀 Sliding-Window Post Write Buffer Active.');

        setInterval(async () => {
            try {
                //1. Process buffered likes
                const bufferedLikes: any[] = [];
                for(let i = 0; i < 200; i++){
                    const rawLike = await redisClient.rPop('posts:likes:queue');
                    if(!rawLike) break;
                    bufferedLikes.push(JSON.parse(rawLike));
                }
                if(bufferedLikes.length > 0) {
                    await postRepo.flushLikesBatch(bufferedLikes);
                }

                //2. Process buffered comments
                const bufferedComments: any[] = [];
                for(let i = 0; i < 200; i++){
                    const rawComment = await redisClient.rPop('posts:comments:queue');
                    if(!rawComment) break;
                    bufferedComments.push(JSON.parse(rawComment));
                }
                if(bufferedComments.length > 0) {
                    await postRepo.flushCommentsBatch(bufferedComments);
                }

            } catch(error) {
                console.error('❌ Error executing sliding window synchronization: ', error);
            }
        }, 5000); //Every 5 sec

    }
}