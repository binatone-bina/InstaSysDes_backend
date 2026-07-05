import pool from '../../config/database';

export class ChatRepository {

    //1. Check if a DM already exists between these two exact users
    async createOrGetDM(userA: string, userB: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //Check if a DM already exists btw these two exact users
            const findDMQuery = `
            SELECT c.id 
            FROM conversations c
            JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
            JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
            WHERE c.type = 'DM'
            AND cp1.user_id = $1
            AND cp2.user_id = $2;
            `;
            
            const existing = await client.query(findDMQuery, [userA, userB]);

            if(existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return existing.rows[0].id; //return existing conversation_id
            }

            //If no DM exists, create one
            const createConvQuery = `
            INSERT INTO conversations (type) 
            VALUES ('DM') RETURNING id;
            `;

            const newCOnv = await client.query(createConvQuery);
            const conversationId = newCOnv.rows[0].id;

            //Add both participants to the junction table
            const addParticipantsQuery = `
            INSERT INTO conversation_participants (conversation_id, user_id)
            VALUES ($1, $2), ($1, $3);
            `;
            await client.query(addParticipantsQuery, [conversationId, userA, userB]);

            await client.query('COMMIT');
            return conversationId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    //2. Save a new message to the db
    async saveMessage(conversationId: string, senderId: string, content?: string, image?: string) {
        const query = `
        INSERT INTO messages (conversation_id, sender_id, content, image_url)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
        `;

        const res = await pool.query(query, [conversationId, senderId, content, image]);
        return res.rows[0];
    }

    //3. Fetch paginated chat history (using your composite index)
    async getChatHistory(conversationId: string, limit: number, cursor?: string) {
        const query = `
        SELECT * FROM messages
        WHERE conversation_id = $1
        ${cursor ? 'AND created_at < $3' : ''}
        ORDER BY created_at DESC
        LIMIT $2;
        `;

        const values = cursor ? [conversationId, limit, new Date(cursor)] : [conversationId, limit];
        const res = await pool.query(query, values);
        
        return res.rows;
    }

    // Fetch the Inbox view: all conversations sorted by their latest message
    // Fetch the Inbox view: all conversations sorted by their latest message
    async getInbox(userId: string, limit: number, cursor?: string) {
        // 1. Start with the base query
        let query = `
        SELECT 
            c.id AS conversation_id,
            c.type,
            CASE 
                WHEN c.type = 'GROUP' THEN c.name
                ELSE (
                    SELECT p.display_name
                    FROM conversation_participants cp_other
                    JOIN profiles p ON cp_other.user_id = p.user_id
                    WHERE cp_other.conversation_id = c.id AND cp_other.user_id != $1
                    LIMIT 1
                )
            END AS conversation_name,
            
            lm.id AS last_message_id,
            lm.content AS last_message_content,
            lm.created_at AS last_message_at
        FROM conversation_participants cp
        JOIN conversations c ON cp.conversation_id = c.id
        LEFT JOIN LATERAL (
            SELECT id, content, created_at 
            FROM messages 
            WHERE conversation_id = c.id 
            ORDER BY created_at DESC 
            LIMIT 1
        ) lm ON true
        WHERE cp.user_id = $1
        `;
        
        // 2. Base values: $1 = userId, $2 = limit
        const values: any[] = [userId, limit];

        // 3. If a cursor is provided, add the WHERE clause for pagination and push the $3 value
        if (cursor) {
            query += ` AND COALESCE(lm.created_at, c.created_at) < $3 `;
            values.push(new Date(cursor));
        }

        // 4. Finally, append the ORDER BY and LIMIT clauses
        query += ` ORDER BY COALESCE(lm.created_at, c.created_at) DESC LIMIT $2; `;
        
        const res = await pool.query(query, values);
        
        return res.rows;
    }
    
    // Helper for ChatService to get the "other" users in a DM
    async getConversationParticipantIds(conversationId: string, excludeUserId: string) {
        const query = `
        SELECT user_id 
        FROM conversation_participants 
        WHERE conversation_id = $1 AND user_id != $2;
        `;
        const res = await pool.query(query, [conversationId, excludeUserId]);
        return res.rows.map(row => row.user_id);
    }

    // Mark a single message as delivered
    async markMessageDelivered(messageId: string) {
        const query = `
        UPDATE messages 
        SET delivered_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND delivered_at IS NULL 
        RETURNING id, conversation_id, sender_id, delivered_at;
        `;
        const res = await pool.query(query, [messageId]);
        return res.rows[0];
    }

    // Mark a single message as read (and also mark delivered if it somehow wasn't)
    async markMessageRead(messageId: string) {
        const query = `
        UPDATE messages 
        SET 
            read_at = CURRENT_TIMESTAMP,
            delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
        WHERE id = $1 AND read_at IS NULL 
        RETURNING id, conversation_id, sender_id, read_at, delivered_at;
        `;
        const res = await pool.query(query, [messageId]);
        return res.rows[0];
    }

    //Create a new Group Chat and add initial participants
    async createGroupChat(name: string, participantIds: string[]) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //1. Create the conversation record
            const createGroupQuery = `
                INSERT INTO conversations (type, name) 
                VALUES ('GROUP', $1) RETURNING id;
            `;
            const newGroup = await client.query(createGroupQuery, [name]);
            const conversationId = newGroup.rows[0].id;

            // 2. Bulk insert all participants using UNNEST
            const addParticipantsQuery = `
                INSERT INTO conversation_participants (conversation_id, user_id)
                SELECT $1, unnest($2::uuid[]);
            `;
            await client.query(addParticipantsQuery, [conversationId, participantIds]);

            await client.query('COMMIT');
            return conversationId;
        }catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    //Group basic functions
    
    // 1. Check if a user is a participant of a conversation
    async isParticipant(conversationId: string, userId: string): Promise<boolean> {
        const query = `
        SELECT 1 FROM conversation_participants
        WHERE conversation_id = $1 AND user_id = $2;
        `;
        const res = await pool.query(query, [conversationId, userId]);
        return res.rows.length > 0;
    }
    // 2. Add a single participant to a conversation
    async addParticipant(conversationId: string, userId: string) {
        const query = `
        INSERT INTO conversation_participants (conversation_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING; -- Prevents errors if they are already added
        `;
        await pool.query(query, [conversationId, userId]);
    }

    // 3. Remove a participant from a conversation
    async removeParticipant(conversationId: string, userId: string) {
        const query = `
        DELETE FROM conversation_participants 
        WHERE conversation_id = $1 AND user_id = $2;
        `;
        await pool.query(query, [conversationId, userId]);
    }
}