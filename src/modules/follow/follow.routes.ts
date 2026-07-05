import { Router } from 'express';
import { FollowController } from './follow.controller';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();
const followController = new FollowController();

//State changing actions (reqs login)
router.post('/:userId', requireAuth, followController.followUser.bind(followController));
router.delete('/:userId', requireAuth, followController.unfollowUser.bind(followController));
router.get('/:userId/mutual', requireAuth, followController.getMutualFollowers.bind(followController));

// Public Directory Queries (No Login token enforced)
router.get('/:userId/followers', followController.getFollowers.bind(followController));
router.get('/:userId/following', followController.getFollowing.bind(followController));

export default router;