import pool from '../../config/database';

export class FollowRepository {

    //Direct Follow (For normal users)
    async followDirect(followerId: string, followingId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(
                `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [followerId, followingId]
            );
            
            //Increment counts ONLY if a row was actually inserted
            if (res.rowCount && res.rowCount > 0) {
                await client.query(`UPDATE profiles SET following_count = following_count + 1 WHERE user_id = $1`, [followerId]);
                await client.query(`UPDATE profiles SET follower_count = follower_count + 1 WHERE user_id = $1`, [followingId]);
            }

            await client.query('COMMIT');
        } catch(error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    //Direct Unfollow
    async unfollow(followerId: string, followingId: string) {
        const client = await pool.connect();
        try{
            await client.query('BEGIN');

            const res = await client.query(
                `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
                [followerId, followingId]
            );

            // Fix invalid @MAX syntax with standard PostgreSQL GREATEST function
            if (res.rowCount && res.rowCount > 0) {
                await client.query(`UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = $1`, [followerId]);
                await client.query(`UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE user_id = $1`, [followingId]);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async batchInsertFollows(followPairs: { followerId: string; followingId: string }[]) {
        if (followPairs.length === 0) return;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //Build a dynamic batch query safely to avoid SQL injection
            const valueRows: string[] = [];
            const queryValues: string[] = [];

            followPairs.forEach((pair, index) =>{
                const offset = index*2;
                valueRows.push(`($${offset + 1}, $${offset + 2})`);
                queryValues.push(pair.followerId, pair.followingId);
            });

            // Use RETURNING to identify which follow relations were actually inserted (i.e. did not conflict)
            const batchQuery = `
            INSERT INTO follows (follower_id, following_id)
            VALUES ${valueRows.join(', ')}
            ON CONFLICT DO NOTHING
            RETURNING follower_id, following_id
            `;
            const result = await client.query(batchQuery, queryValues);
            const insertedPairs = result.rows;

            //Bulk update profile metrics for the batch ONLY for successfully inserted follows
            for(const pair of insertedPairs) {
                await client.query(`UPDATE profiles SET following_count = following_count + 1 WHERE user_id = $1`, [pair.follower_id]);
                await client.query(`UPDATE profiles SET follower_count = follower_count + 1 WHERE user_id = $1`, [pair.following_id]);
            }

            await client.query('COMMIT');

        }
        catch(error) {
            await client.query('ROLLBACK');
            console.error('❌Failed executing batch database write: ', error);
        }
        finally {
            client.release();
        }
    }

    //Cursor Based  Pagination: Get followers
    async getFollowers(userId: string, limit: number, cursor?: string) {
        
        let query = `
        SELECT follower_id, created_at FROM follows 
        WHERE following_id = $1
        ${cursor ? 'AND created_at < $3' : ''}
        ORDER BY created_at DESC
        LIMIT $2
        `;
        
        const values = cursor ? [userId, limit, new Date(cursor)] : [userId, limit];
        const res = await pool.query(query, values);
        return res.rows;
    }

    // Cursor-Based Pagination: Get Following
    async getFollowing(userId: string, limit: number, cursor?: string) {
        let query = `
        SELECT following_id, created_at 
        FROM follows 
        WHERE follower_id = $1 
        ${cursor ? 'AND created_at < $3' : ''} 
        ORDER BY created_at DESC 
        LIMIT $2
        `;
        const values = cursor ? [userId, limit, new Date(cursor)] : [userId, limit];
        const res = await pool.query(query, values);
        return res.rows;
    }

    // Corrected Mutual Followers (People both User A and User B follow)
    async getMutualFollowing(userA: string, userB: string) {
        const query = `
        SELECT f1.following_id 
        FROM follows f1
        JOIN follows f2 ON f1.following_id = f2.following_id
        WHERE f1.follower_id = $1 AND f2.follower_id = $2;
        `;
        const res = await pool.query(query, [userA, userB]);
        return res.rows;
    }
}