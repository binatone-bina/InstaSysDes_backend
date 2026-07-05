import { Response } from 'express';
import { AuthRequest } from '../../common/middlewares/auth.middleware';
import { ProfileService } from './profile.service';

const profileService = new ProfileService();

export class ProfileController {
    
    async getMyProfile(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const profile = await profileService.getProfile(userId);
            res.status(200).json(profile);
        } catch(error: any){
            res.status(404).json({ error: error.message });
        }
    }

    async getUserProfile(req: AuthRequest, res: Response) {
        try{
            const { userId } = req.params as { userId: string };
            const profile = await profileService.getProfile(userId);
            res.status(200).json(profile);
        } catch(error: any){
            res.status(404).json({ error: error.message });
        }
    }

    async updateMyProfile(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { displayName, bio, profilePicUrl, username } = req.body;

            const upddatedProfile = await profileService.updateProfile(userId, { displayName, bio, profilePicUrl, username});

            res.status(200).json({ status: 'success', profile: upddatedProfile });
        } catch(error: any){
            res.status(400).json({ error: error.message });
        }
    }

    async searchProfiles(req: AuthRequest, res: Response) {
        try {
            const q = req.query.q as string;
            const limit = parseInt(req.query.limit as string) ||  10;

            if(!q || q.trim() === ''){
                res.status(400).json({ error: 'Search query parameter "q" is required.'});
                return;
            }

            const results = await profileService.searchUsers(q.toLowerCase(), limit);
            res.status(200).json({ data: results });
        } catch(error: any) {
            res.status(500).json({ error: 'Search failed' });
        }
    }
}