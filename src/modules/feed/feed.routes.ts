import { Router } from 'express';
import { requireAuth } from '../../common/middlewares/auth.middleware';
import { FeedController } from './feed.controller';

const router = Router();
const feedController = new FeedController();

router.get('/', requireAuth, feedController.getUserFeed.bind(feedController));

export default router;