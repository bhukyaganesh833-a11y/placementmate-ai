import { z } from 'zod';
import { listQuerySchema, buildPlan } from '../models/listQuery.js';
import { toPublic } from '../models/opportunity.js';
import { notFound } from '../utils/errors.js';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

export class OpportunityService {
  constructor(repo) {
    this.repo = repo;
  }

  async listPublic(rawQuery) {
    const params = listQuerySchema.parse(rawQuery);
    const { items, nextCursor } = await this.repo.list(buildPlan(params));
    // Safety net: hide listings whose deadline passed since they were last saved.
    const now = new Date();
    const live = items.filter((d) => !(d.deadline && new Date(d.deadline) < now));
    return { items: live.map(toPublic), nextCursor };
  }

  // A published listing stays viewable after it expires (useful for shared links);
  // drafts, in-review, rejected and unpublished listings are never exposed.
  async getPublic(rawId) {
    const id = idSchema.parse(rawId);
    const doc = await this.repo.getById(id);
    if (!doc || doc.publicationStatus !== 'published') throw notFound('Opportunity not found');
    return toPublic(doc);
  }
}
