import { Response } from 'express';
import { AuthRequest } from '../../common/middlewares/auth.middleware';
import { FeedService } from './feed.service';

const feedService = new FeedService();

export class FeedController {
  async getUserFeed(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const feed = await feedService.getHomeFeed(userId, limit);
      res.status(200).json({ data: feed });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}