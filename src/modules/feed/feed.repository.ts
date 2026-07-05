import pool from '../../config/database';

export class FeedRepository {

    // Only triggered during cache miss

    //Query 1: Fetch recent posts from normal followings
    async getNormalFollowingsPosts(userId: string, limit: number) {
        const query = `
        SELECT p.id AS post_id, p.created_at
        FROM follows f
        JOIN profiles prof ON f.following_id = prof.user_id
        JOIN posts p ON f.following_id = p.user_id
        WHERE f.follower_id = $1 
            AND prof.is_celebrity = FALSE
        ORDER BY p.created_at DESC
        LIMIT $2;
        `;

        const res = await pool.query(query, [userId, limit]);
        return res.rows;
    }

    //Query 2: Fetch the single latest post from the celebrity followings
    async getCelebFollowingsLatestPosts(userId: string) {
        const query = `
        SELECT DISTINCT ON (p.user_id) p.id AS post_id, p.created_at, p.user_id as celeb_id
        FROM follows f
        JOIN profiles prof ON f.following_id = prof.user_id
        JOIN posts p ON f.following_id = p.user_id
        WHERE f.follower_id = $1 
            AND prof.is_celebrity = TRUE
        ORDER BY p.user_id, p.created_at DESC;
        `;

        const res = await pool.query(query, [userId]);
        return res.rows;
    }

    //Helper: Just get the list of celeb Ids this user follows for the redis pipeline
    async getFollowedCelebrityIds(userId: string) {
        const query = `
        SELECT f.following_id
        FROM follows f
        JOIN profiles p ON f.following_id = p.user_id
        WHERE f.follower_id = $1 AND p.is_celebrity = TRUE;
        `;

        const res = await pool.query(query, [userId]);
        return res.rows.map(row => row.following_id);
    }
}