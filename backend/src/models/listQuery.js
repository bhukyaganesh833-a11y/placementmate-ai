import { z } from 'zod';
import { OPPORTUNITY_TYPES, WORK_MODES, tokenize } from './opportunity.js';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const text = (max) => z.string().trim().min(1).max(max);

// Validates GET /api/v1/opportunities query parameters.
export const listQuerySchema = z
  .object({
    type: z.enum(OPPORTUNITY_TYPES).optional(),
    q: text(80).optional(),
    organization: text(150).optional(),
    location: text(120).optional(),
    skill: text(40).optional(),
    workMode: z.enum(WORK_MODES).optional(),
    paid: bool.optional(),
    sort: z.enum(['recent', 'deadline']).default('recent'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(400).optional(),
  })
  .strict();

// Turns validated params into a plan both repositories can execute.
export function buildPlan(params) {
  const equals = { isPublic: true };
  if (params.type) equals.type = params.type;
  if (params.workMode) equals.workMode = params.workMode;
  if (params.paid !== undefined) equals.isPaid = params.paid;
  if (params.location) equals.locationLower = params.location.toLowerCase();
  if (params.organization) equals.organizationLower = params.organization.toLowerCase();

  // Firestore allows only one array-contains per query. The first one becomes a
  // database filter; any others are applied to the fetched page.
  const wanted = [];
  const qTokens = params.q ? tokenize(params.q) : [];
  if (params.q && qTokens.length === 0) {
    // e.g. only stop-words: match nothing rather than everything
    wanted.push({ field: 'searchTokens', value: '\u0000no-match' });
  }
  // longest keyword first: it is the most selective
  for (const t of [...qTokens].sort((a, b) => b.length - a.length)) {
    wanted.push({ field: 'searchTokens', value: t });
  }
  if (params.skill) wanted.push({ field: 'skillsLower', value: params.skill.toLowerCase() });

  const [primary, ...rest] = wanted;
  const sortField = params.sort === 'deadline' ? 'deadlineSort' : 'createdAt';
  const direction = params.sort === 'deadline' ? 'asc' : 'desc';

  return {
    equals,
    arrayContains: primary || null,
    postFilters: rest,
    sortField,
    direction,
    limit: params.limit,
    cursor: decodeCursor(params.cursor),
  };
}

export function encodeCursor(sortValue, id) {
  return Buffer.from(JSON.stringify([sortValue, id])).toString('base64url');
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const [sortValue, id] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof sortValue !== 'string' || typeof id !== 'string') throw new Error();
    return { sortValue, id };
  } catch {
    const err = new Error('Invalid cursor');
    err.status = 400;
    err.code = 'INVALID_CURSOR';
    throw err;
  }
}

export function passesPostFilters(doc, postFilters) {
  return postFilters.every((f) => (doc[f.field] || []).includes(f.value));
}
