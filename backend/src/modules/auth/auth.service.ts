import bycrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuthRepository } from './auth.repository';
import redisClient from '../../config/redis';

//Read keys from the root 'keys' directory
const privateKey = fs.readFileSync(path.join(process.cwd(), 'keys', 'jwtRS256.key'), 'utf8');
const authRepo = new AuthRepository();

export class AuthService {
    //Helper to generate both tokens
    private async generateTokens(userId: string) {
        //1.Create Access Token (RS256, 15 minutes)
        const accessToken = jwt.sign({userId}, privateKey, {
            algorithm: 'RS256',
            expiresIn: '15m'
        });

        //2. Refresh Tokens (opaque string, 7 days)
        const refreshToken = crypto.randomBytes(40).toString('hex');
        await authRepo.storeRefreshToken(userId, refreshToken, 7);

        return {accessToken, refreshToken};
    }

    async signUp(username: string, email: string, passwordRaw: string) {
        const saltRounds = 10;
        const passwordHash = await bycrypt.hash(passwordRaw, saltRounds);

        const user = await authRepo.createUser(username, email, passwordHash);
        const tokens = await this.generateTokens(user.id);

        return {user, ...tokens};
    }

    async login(email: string, passwordRaw: string) {
        console.log("entered login service\n");
        const user = await authRepo.findUserByEmail(email);
        if(!user) {console.log("User not found"); throw new Error('Invalid Credentials');}

        const isValid = await bycrypt.compare(passwordRaw, user.password_hash);
        if(!isValid) throw new Error('Invalid Credentials');

        const tokens = await this.generateTokens(user.id);
        return {user: {id: user.id, username: user.username, email: user.email }, ...tokens};
    }

    async refresh(oldRefreshToken: string) {
        console.log("entered service");
        const tokenRecord = await authRepo.findRefreshToken(oldRefreshToken);
        if(!tokenRecord) throw new Error('Invalid or expired refresh token');

        //Revoke the old token (Rotation)
        await authRepo.deleteRefreshToken(oldRefreshToken);

        //Issue new token pair
        return await this.generateTokens(tokenRecord.user_id);
    }

    //here we are deleting in db according to refresh token
    //and not user Id because a user can hold multiple refresh tokens
    //if they are logged in from multiple devices.
    async logout(accessToken: string, refreshToken: string) {
        //1. Delete the refresh token from the database
        if(refreshToken) {
            await authRepo.deleteRefreshToken(refreshToken);
        }

        //2.Add Access Token to redis Denylist
        if(accessToken) {
            const decoded = jwt.decode(accessToken) as jwt.JwtPayload;
            if(decoded && decoded.exp) {
                const currentTime = Math.floor(Date.now() / 1000);
                const timeRemaining = decoded.exp - currentTime;

                //Add a 5-minute buffer just to be safe
                const ttl = timeRemaining > 0 ? timeRemaining + 300 : 300;

                await redisClient.setEx(`denyList: ${accessToken}`, ttl, 'revoked');
            }
        }
    }
}