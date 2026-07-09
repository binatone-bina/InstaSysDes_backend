import { Response } from 'express';
import { AuthRequest } from '../../common/middlewares/auth.middleware';
import { FollowService } from './follow.service';

const followService = new FollowService();

export class FollowController {
    //------------------------------------------------------------------    
    async followUser(req: AuthRequest, res: Response) {
        try {
            const followerId = req.user!.userId;
            const { userId } = req.params;
            const followingId = userId as string;
            const result = await followService.follow(followerId, followingId);
            res.status(200).json(result);
        } catch ( error: any) {
            res.status(400).json({ error: error.message });
        }
    }
    //------------------------------------------------------------------
    async unfollowUser( req: AuthRequest, res: Response) {
        try{
            const followerId = req.user!.userId;
            const { userId } = req.params;
            const followingId = userId as string;

            await followService.unfollow(followerId, followingId);
            res.status(200).json({  status: 'success', message: 'Unfollowed successfully'});

        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }
    //------------------------------------------------------------------
    async getFollowers(req: AuthRequest, res: Response) {
        try {
            const { userId } = req.params;
            const userid = userId as string;
            const limit = parseInt(req.query.limit as string) || 20;
            const cursor = req.query.cursor as string;

            const followers = await followService.getFollowersList(userid, limit, cursor);

            //Calculate next cursor for frontend pagination tracking
            const nextCursor = followers.length === limit ? followers[followers.length - 1].created_at : null;

            res.status(200).json({ data: followers, nextCursor });
        }
        catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    //------------------------------------------------------------------
    async getFollowing(req: AuthRequest, res: Response) {
        try {
            const { userId } = req.params;
            const userId1 = userId as string;
            const limit = parseInt(req.query.limit as string) || 20;
            const cursor = req.query.cursor as string;

            const following = await followService.getFollowingList(userId1, limit, cursor);
            const nextCursor = following.length === limit ? following[following.length - 1].created_at : null;

            res.status(200).json({ data: following, nextCursor });
        }catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    //------------------------------------------------------------------
    async getMutualFollowers(req: AuthRequest, res: Response) {
        try {
        const currentUserId = req.user!.userId;
        const { userId: targetUserId1 } = req.params;
        const targetUserId = targetUserId1 as string;

        const mutuals = await followService.getMutual(currentUserId, targetUserId);
        res.status(200).json({ data: mutuals });
        } catch (error: any) {
        res.status(500).json({ error: error.message });
        }
    }
}