import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { BadRequestError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/http/asyncHandler';
import { ok } from '../../common/http/ApiResponse';
import type { IPhotoStorage } from './upload.storage';

/** Images only — completion proof is a photo, nothing else. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Binary photo upload (closes mobile-backlog gap #1). Multipart field `photo`;
 * returns `{ photoUrl }` in the standard envelope, sized/typed at the edge.
 * `identityGuard` accepts EITHER a user JWT or a console token — crew proof
 * photos are the first consumer, guest attachments come later.
 *
 * @openapi
 * /api/v1/uploads:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a photo, get back its hosted URL
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties: { photo: { type: string, format: binary } }
 *     responses:
 *       200: { description: "{ photoUrl }" }
 */
export function buildUploadRouter(storage: IPhotoStorage, identityGuard: RequestHandler): Router {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES.has(file.mimetype)) cb(null, true);
      else cb(new BadRequestError('Only image uploads are accepted (jpeg/png/webp/heic)'));
    },
  });

  router.post(
    '/',
    identityGuard,
    upload.single('photo'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new BadRequestError('Attach the photo as multipart field "photo"');
      const photoUrl = await storage.save(req.file.originalname, req.file.mimetype, req.file.buffer);
      return ok(res, { photoUrl });
    }),
  );

  return router;
}
