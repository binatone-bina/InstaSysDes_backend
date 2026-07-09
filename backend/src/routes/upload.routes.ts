import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../common/middlewares/auth.middleware';
import { uploadMiddleware } from '../middleware/upload.middleware';

const router = Router();

/**
 * POST /api/v1/upload
 * Accepts a single image file in the `file` field (multipart/form-data).
 * Saves it to the /uploads directory and returns the public URL.
 */
router.post(
  '/',
  requireAuth,
  uploadMiddleware.single('file'),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file received. Make sure to send a file in the "file" field.' });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  }
);

// Multer error handler (file type / size violations)
router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.message) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Upload failed' });
});

export default router;
