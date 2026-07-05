import { Response } from 'express';
import { AuthRequest } from '../../common/middlewares/auth.middleware';
import { PostService } from'./post.service';

const postService = new PostService();

export class PostController {
    async create (req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const {caption, mediaUrls} = req.body;

            if(!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
                res.status(400).json({ error: 'At least one media URL string is required.'});
                return;
            }

            const post = await postService.createPost(userId, caption, mediaUrls);
            res.status(201).json(post);
        } catch( error: any ){
            res.status(500).json({ error: error.message });
        }
    }

    async getUserGrid(req: AuthRequest, res: Response) {
        try {
            const { userId } = req.params as { userId: string };
            const limit = parseInt(req.query.limit as string) || 12;
            const cursor = req.query.cursor as string;

            const posts = await postService.getProfileGrid(userId, limit, cursor);
            const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;

            res.status(200).json({ data: posts, nextCursor });
        } catch ( error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async togglePostLike(req: AuthRequest, res: Response) {
        try{
            const userId = req.user!.userId;
            const {postId } = req.params as { postId: string };

            const result = await postService.toggleLike(postId, userId);
            res.status(200).json(result);
        } catch(error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async addPostComment(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { postId } = req.params as { postId: string };
            const { content } = req.body;

            if(!content || content.trim() === '') {
                res.status(400).json({ error: 'Comment body cannot be blank.'});
                return;
            }

            const result = await postService.addComment(postId, userId, content);
            res.status(201).json(result);
        } catch(error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPostCommentsList(req: AuthRequest, res: Response) {
        try {
            const { postId } = req.params as { postId: string };
            const limit = parseInt(req.query.limit as string) || 20;
            const cursor = req.query.cursor as string;

            const comments = await postService.getPostComments(postId, limit, cursor);
            const nextCursor = comments.length === limit ? comments[comments.length - 1].created_at : null;            

            res.status(200).json({ data: comments, nextCursor });
        } catch( error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}