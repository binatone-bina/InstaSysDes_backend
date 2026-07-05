import { Router } from 'express';
import { PostController } from './post.controller';
import { requireAuth } from '../../common/middlewares/auth.middleware';

const router = Router();
const postController = new PostController();

// Create & Query Feed Matrix
router.post('/', requireAuth, postController.create.bind(postController));
router.get('/user/:userId', postController.getUserGrid.bind(postController));

// High Throughput Interactivity Endpoints
router.post('/:postId/like', requireAuth, postController.togglePostLike.bind(postController));
router.post('/:postId/comments', requireAuth, postController.addPostComment.bind(postController));
router.get('/:postId/comments', postController.getPostCommentsList.bind(postController));

export default router;