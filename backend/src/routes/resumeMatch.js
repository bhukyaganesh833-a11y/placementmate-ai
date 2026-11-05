import { Router } from 'express';
import { HttpError } from '../utils/errors.js';

export function resumeMatchRoutes(service, auth) {
  const router = Router();

  router.post('/resume-match', auth.requirePremium, async (req, res, next) => {
    try {
      const { resumeText, listing } = req.body || {};
      if (typeof resumeText !== 'string' || resumeText.trim().length < 50 || resumeText.length > 8000) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Resume text must be 50 to 8000 characters');
      }
      if (!listing || typeof listing.title !== 'string') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Listing is required');
      }
      const result = await service.match({ resumeText, listing });
      res.set('Cache-Control', 'no-store');
      res.json({ data: result });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
