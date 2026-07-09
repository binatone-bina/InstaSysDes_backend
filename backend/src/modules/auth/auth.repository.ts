import pool from '../../config/database';
 export class AuthRepository {
    // User Operations
    
    async createUser(username: string, email: string, passwordHash: string){
        const query = `INSERT INTO users (username, email, password_hash) 
        VALUES ($1, $2, $3) 
        RETURNING id, username, email, created_at;
        `;

        const values = [username, email, passwordHash];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    async findUserByEmail(email: string){
        const query = `SELECT * FROM users WHERE email = $1;`;
        const result = await pool.query(query, [email]);
        return result.rows[0];
    }

    //Refresh Token Operations
    async storeRefreshToken(userId: string, token: string, expiresInDays: number){
        console.log("entered storeRefreshToken");
        const query = `
        INSERT INTO refresh_tokens (user_id, token, expires_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 || ' days')::interval)
        RETURNING id;
        `;

        const values = [userId, token, expiresInDays];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    async findRefreshToken(token: string){
        console.log("entered findRefreshToken");
        const query = `SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP;`;
        const result = await pool.query(query, [token]);
        return result.rows[0];
    }
    async deleteRefreshToken(token: string){
        console.log("entered deleteRefreshToken");
        const query = `DELETE FROM refresh_tokens WHERE token = $1;`;
        await pool.query(query, [token]);
    }
 }