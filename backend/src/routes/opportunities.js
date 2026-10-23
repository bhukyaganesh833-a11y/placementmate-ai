import { Router } from 'express';

export function opportunityRoutes(service) {
  const router = Router();

  // GET /api/v1/opportunities?type=internship&q=python&sort=deadline&limit=20&cursor=...
  router.get('/', async (req, res, next) => {
    try {
      const { items, nextCursor } = await service.listPublic(req.query);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ data: items, page: { nextCursor, count: items.length } });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/opportunities/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const item = await service.getPublic(req.params.id);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
