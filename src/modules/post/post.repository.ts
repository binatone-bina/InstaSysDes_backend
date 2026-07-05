import pool from '../../config/database';

export class PostRepository {
    async create(userId: string, caption: string | undefined, mediaUrls: string[]) {
        /*const query = `
        INSERT INTO posts (user_id, caption, media_urls)
        VALUES ($1, $2, $3)
        RETURNING *;
        `;

        const res = await pool.query(query, [userId, caption, mediaUrls]);
        return res.rows[0];*/

        //1. grab a dedicated client from the pool to lock the transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //2. Insert the post
            const insertQuery = `
            INSERT INTO posts (user_id, caption, media_urls)
            VALUES ($1, $2, $3)
            RETURNING *;
            `;
            const res = await client.query(insertQuery, [userId, caption, mediaUrls]);

            //3. Increment the user's post_count automatically
            await client.query(
                `UPDATE profiles SET post_count = post_count + 1 WHERE user_id = $1`,
                [userId]

            );

            await client.query('COMMIT');
            return res.rows[0];
        }catch (error) {
            await client.query('ROLLBACK'); // Cancel everything if an error occurs
            throw error;
        } finally {
            client.release(); // Return client to the pool
        }
    }

    //Cursor Pagination for profile grid
    async getUserPostGrid(userId: string, limit: number, cursor?: string) {
        const query = `
        SELECT * FROM posts
        WHERE user_id = $1
        ${cursor ? 'AND created_at < $3' : ''}
        ORDER BY created_at DESC
        LIMIT $2;
        `;

        const values = cursor ? [userId, limit, new Date(cursor)] : [userId, limit];
        const res = await pool.query(query, values);
        return res.rows;
    }

    //Chronological comment extraction
    async getCommentsPaginated(postId: string, limit: number, cursor?: string) {
        const query = `
        SELECT * FROM post_comments
        WHERE post_id = $1
        ${cursor ? 'AND created_at < $3' : ''}
        ORDER BY created_at DESC
        LIMIT $2;
        `;

        const values = cursor ? [postId, limit, new Date(cursor)] : [postId, limit];
        const res = await pool.query(query, values);
        return res.rows;
    }

    //High Performance Bulk Sync Engines(Invoked by background worker)

    async flushLikesBatch(likes: {postId:  string; userId: string; action: 'like' | 'unlike' }[]) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for(const item of likes) {
                if(item.action === 'like') {
                    await client.query(
                        `INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [item.postId, item.userId]
                    );
                    await client.query(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, [item.postId]);   
                } else {
                    await client.query(`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, [item.postId, item.userId]);
                    await client.query(`UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = $1`, [item.postId]);
                }
            }

            await client.query('COMMIT');
        }
        catch(error) {
            await client.query('ROLLBACK');
            console.error('❌Failed executing batch database write: ', error);
        } finally {
            client.release();
        }
    }

    async flushCommentsBatch(comments: {id: string; postId: string; userId: string; content: string; createdAt: string }[]) {
        if(comments.length === 0) return;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const valueRows: string[] = [];
            const queryValues: any[] = [];

            comments.forEach((c, index) => {
                const offset = index * 5;
                valueRows.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
                queryValues.push(c.id, c.postId, c.userId, c.content, new Date(c.createdAt));
            });

            const batchQuery = `
            INSERT INTO post_comments (id, post_id, user_id, content, created_at)
            VALUES ${valueRows.join(', ')}
            ON CONFLICT DO NOTHING;
            `;
            await pool.query(batchQuery, queryValues);

            //Increment aggregate counts per post
            const distinctPostIds = Array.from(new Set(comments.map(c => c.postId)));
            for (const postId of distinctPostIds) {
                const incrementAmount = comments.filter(c => c.postId === postId).length;
                await client.query(
                `UPDATE posts SET comment_count = comment_count + $1 WHERE id = $2`,
                [incrementAmount, postId]
                );
            }

            await client.query('COMMIT');
        } catch(error) {
            await client.query('ROLLBACK');
            console.error('❌ Failed processing Comments bulk insert batch:', error);
        }finally {
            client.release();
        }
    }

    // Bulk fetch posts for feed hydration
    async getPostsByIds(ids: string[]) {
        if (!ids || ids.length === 0) return [];

        // 1. Fetch all matching posts in a single database round-trip
        const query = `
            SELECT * FROM posts 
            WHERE id = ANY($1::uuid[]);
        `;
        const res = await pool.query(query, [ids]);
        const posts = res.rows;

        // 2. Crucial Step: Preserve the original feed ordering!
        // PostgreSQL's "ANY" operator returns rows in whatever order it finds them on disk.
        // We map them back to match the exact order of the IDs array generated by the feed engine.
        const postMap = new Map(posts.map(post => [post.id, post]));
        return ids
            .map(id => postMap.get(id))
            .filter(post => post !== undefined); // Removes any posts that might have been deleted
    }
}