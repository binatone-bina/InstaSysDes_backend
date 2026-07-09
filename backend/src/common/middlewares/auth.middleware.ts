import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import redisClient from '../../config/redis';

//1. Read the public key for verification
const publicKey = fs.readFileSync(path.join(process.cwd(), 'keys', 'jwtRS256.key.pub'), 'utf8');

//Extend the Express Request interface to include  our custom user payload
export interface AuthRequest extends Request {
    user?: {
        userId: string;
    };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        //3. Extract the token
        const authHeader = req.headers.authorization;
        if(!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Authentication requrired. Missing Bearer token'});
            return;
        }

        const token = authHeader.split(' ')[1];

        //4. Check the Redis Denylist First
        const isRevoked = await redisClient.get(`denylist:${token}`);
        if(isRevoked) {
            res.status(401).json({ error: 'Session revoked. Please login again.'});
            return;
        }

        //5. Verify the token assymetrically using the public Key
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;

        //6. Attach the userId to the request object
        req.user = {
            userId: decoded.userId as string,
        };

        //7. ss control to the next middleware or controller
        next();

    }   
    catch(error: any) {
        if(error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Access token expired. ease refresh your token'});
            return;
        }
        res.status(403).json({ error: 'Invalid access token.'});
        return;
    }
}