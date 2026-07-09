import pool from '../../config/database';

export class ProfileRepository {

    async getProfileById(userId: string) {
        const query = `
        SELECT 
            user_id, username, display_name, bio, profile_pic_url,
            follower_count, following_count, post_count, is_celebrity
            FROM profiles
            WHERE user_id = $1;
            `;
            const res = await pool.query(query, [userId]);
            return res.rows[0];
    }

    async updateProfile(userId: string, updates: { displayName?: string; bio?: string; profilePicUrl?: string; username?: string }) {
        //Dynamically build the update query based on provided fields
        const fields: string[] = [];
        const values: any[] = [];
        let queryIndex = 1;

        if(updates.username) {
            fields.push(`username = $${queryIndex++}`);
            values.push(updates.username);
        }
        if (updates.displayName) {
            fields.push(`display_name = $${queryIndex++}`);
            values.push(updates.displayName);
        }
        if (updates.bio) {
            fields.push(`bio = $${queryIndex++}`);
            values.push(updates.bio);
        }
        if (updates.profilePicUrl) {
            fields.push(`profile_pic_url = $${queryIndex++}`);
            values.push(updates.profilePicUrl);
        }

        if (fields.length === 0) return null;

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(userId);// Add userid for the Where clause

        const query = `
        UPDATE profiles
        SET ${fields.join(', ')}
        WHERE user_id = $${queryIndex}
        RETURNING *;
        `;

        const res = await pool.query(query, values);
        return res.rows[0];
    }

    async searchProfiles(searchQuery: string, limit: number) {
        //The query string is appended with a wildcard '%' for prefix matching
        const query = `
        SELECT user_id, username, display_name, profile_pic_url
        FROM profiles
        WHERE username LIKE $1
        LIMIT $2;
        `;
        const res = await pool.query(query, [`${searchQuery}%`, limit]);
        return res.rows;
    }
}