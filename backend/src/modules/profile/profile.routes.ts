import { Router } from 'express';
import { ProfileController } from './profile.controller';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();
const profileController = new ProfileController();

//1. Search (Must be above /:userId to prevent routing conflicts)
router.get('/search', requireAuth, profileController.searchProfiles.bind(profileController));

//2. My Profile operations
router.get('/me', requireAuth, profileController.getMyProfile.bind(profileController));
router.put('/me', requireAuth, profileController.updateMyProfile.bind(profileController));

//3. View Someone Else's Profile
router.get('/:userId', requireAuth, profileController.getUserProfile.bind(profileController));

export default router;