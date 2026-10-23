import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';

// Every route here requires a valid Firebase ID token whose custom claim is role=admin.
export function adminRoutes(service, auth) {
  const router = Router();

  router.use(auth.requireAdmin);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store'); // admin data must never be cached
    next();
  });

  // GET /api/v1/admin/opportunities?status=draft&type=job&limit=25&cursor=...
  router.get(
    '/opportunities',
    h(async (req, res) => {
      const { items, nextCursor } = await service.list(req.query);
      res.json({ data: items, page: { nextCursor, count: items.length } });
    }),
  );

  router.post(
    '/opportunities',
    h(async (req, res) => {
      const { item, duplicates } = await service.create(req.body, req.user);
      res.status(201).json({ data: item, duplicates });
    }),
  );

  router.get(
    '/opportunities/:id',
    h(async (req, res) => {
      res.json({ data: await service.get(req.params.id) });
    }),
  );

  router.put(
    '/opportunities/:id',
    h(async (req, res) => {
      const { item, duplicates } = await service.replace(req.params.id, req.body, req.user);
      res.json({ data: item, duplicates });
    }),
  );

  router.delete(
    '/opportunities/:id',
    h(async (req, res) => {
      res.json({ data: await service.remove(req.params.id, req.body, req.user) });
    }),
  );

  router.get(
    '/opportunities/:id/history',
    h(async (req, res) => {
      const items = await service.history(req.params.id);
      res.json({ data: items });
    }),
  );

  router.post(
    '/opportunities/:id/submit',
    h(async (req, res) => {
      res.json({ data: await service.submit(req.params.id, req.user) });
    }),
  );

  router.post(
    '/opportunities/:id/review',
    h(async (req, res) => {
      res.json({ data: await service.review(req.params.id, req.body, req.user) });
    }),
  );

  router.post(
    '/opportunities/:id/publish',
    h(async (req, res) => {
      res.json({ data: await service.publish(req.params.id, req.user) });
    }),
  );

  router.post(
    '/opportunities/:id/unpublish',
    h(async (req, res) => {
      res.json({ data: await service.unpublish(req.params.id, req.body, req.user) });
    }),
  );

  router.post(
    '/opportunities/:id/expire',
    h(async (req, res) => {
      res.json({ data: await service.expire(req.params.id, req.user) });
    }),
  );

  router.post(
    '/maintenance/expire-overdue',
    h(async (req, res) => {
      res.json({ data: await service.expireOverdue(req.user) });
    }),
  );

  return router;
}
