import { z } from 'zod';
import { OPPORTUNITY_TYPES, PUBLICATION_STATUS } from './opportunity.js';
import { decodeCursor } from './listQuery.js';

// Validates GET /api/v1/admin/opportunities query parameters.
export const adminListQuerySchema = z
  .object({
    status: z.enum(PUBLICATION_STATUS).optional(),
    type: z.enum(OPPORTUNITY_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(400).optional(),
  })
  .strict();

// Most recently edited first, any publication status.
export function buildAdminPlan(params) {
  const equals = {};
  if (params.status) equals.publicationStatus = params.status;
  if (params.type) equals.type = params.type;
  return {
    equals,
    arrayContains: null,
    postFilters: [],
    sortField: 'updatedAt',
    direction: 'desc',
    limit: params.limit,
    cursor: decodeCursor(params.cursor),
  };
}

// Published listings whose deadline might have passed (soonest deadline first).
export function buildOverduePlan(cursor = null) {
  return {
    equals: { publicationStatus: 'published', isExpired: false },
    arrayContains: null,
    postFilters: [],
    sortField: 'deadlineSort',
    direction: 'asc',
    limit: 100,
    cursor,
  };
}
