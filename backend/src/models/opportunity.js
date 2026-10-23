import { z } from 'zod';

// ---- Enumerations (keep identical in website + Android models) -------------
export const OPPORTUNITY_TYPES = ['internship', 'job', 'hackathon', 'competition'];
export const WORK_MODES = ['remote', 'hybrid', 'onsite'];
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'];
export const PARTICIPATION = ['individual', 'team', 'both'];
export const VERIFICATION_STATUS = ['unverified', 'pending', 'verified', 'rejected'];
export const PUBLICATION_STATUS = ['draft', 'in_review', 'published', 'unpublished', 'rejected'];

// Sorts far after any real date so listings with no deadline sort last.
export const NO_DEADLINE_SORT_VALUE = '9999-12-31T00:00:00.000Z';

// ---- Safe URL handling -----------------------------------------------------
export const safeUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((u) => {
    try {
      const url = new URL(u);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'URL must be http(s) and must not contain credentials');

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());

const compensation = z
  .object({
    kind: z.enum(['paid', 'unpaid', 'unspecified']).default('unspecified'),
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
    currency: z.literal('INR').default('INR'),
    period: z.enum(['month', 'year', 'total']).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((c) => c.min === undefined || c.max === undefined || c.min <= c.max, 'min must be <= max')
  .default({ kind: 'unspecified', currency: 'INR' });

// ---- Input schema (used by admin create/update in Milestone 2 and seeding) --
export const opportunityInputSchema = z.object({
  type: z.enum(OPPORTUNITY_TYPES),
  title: z.string().trim().min(3).max(150),
  organization: z.string().trim().min(2).max(150), // company or organizer
  description: z.string().trim().min(20).max(8000),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  eligibility: z.string().trim().max(1500).optional(),
  qualification: z.string().trim().max(300).optional(),
  experience: z.string().trim().max(200).optional(),
  location: z.string().trim().max(120).optional(),
  workMode: z.enum(WORK_MODES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  compensation,
  duration: z.string().trim().max(80).optional(),
  theme: z.string().trim().max(150).optional(),
  participation: z.enum(PARTICIPATION).optional(),
  teamSize: z
    .object({ min: z.number().int().min(1), max: z.number().int().min(1) })
    .refine((t) => t.min <= t.max, 'min must be <= max')
    .optional(),
  rules: z.string().trim().max(4000).optional(),
  prizes: z.string().trim().max(1000).optional(), // only when verified
  registrationStart: isoDate.optional(),
  eventStart: isoDate.optional(),
  eventEnd: isoDate.optional(),
  deadline: isoDate.optional(),
  applyUrl: safeUrl,
  source: z.object({ name: z.string().trim().min(2).max(120), url: safeUrl }),
});

// ---- Derived/stored shape --------------------------------------------------
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'of', 'in', 'at', 'to', 'a', 'an', 'on']);

export function tokenize(text) {
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .map((t) => t.replace(/^\.+|\.+$/g, ''))
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
    ),
  ].slice(0, 40);
}

export function buildStoredDocument(input, { now = new Date(), id } = {}) {
  const iso = now.toISOString();
  const data = {
    ...input,
    verificationStatus: 'unverified',
    verificationNotes: '', // internal, never returned by the public API
    lastVerifiedAt: null,
    publicationStatus: 'draft',
    isExpired: false,
    createdAt: iso,
    updatedAt: iso,
  };
  return { ...(id ? { id } : {}), ...deriveFields(data) };
}

// Recompute query helper fields. Call after every write.
export function deriveFields(doc) {
  const expiredByDate = doc.deadline ? new Date(doc.deadline) < new Date() : false;
  return {
    ...doc,
    isExpired: doc.isExpired || expiredByDate,
    isPublic: doc.publicationStatus === 'published' && !(doc.isExpired || expiredByDate),
    isPaid: doc.compensation?.kind === 'paid',
    applyUrlKey: normalizeUrlKey(doc.applyUrl),
    deadlineSort: doc.deadline || NO_DEADLINE_SORT_VALUE,
    locationLower: doc.location ? doc.location.toLowerCase() : null,
    organizationLower: doc.organization.toLowerCase(),
    skillsLower: (doc.skills || []).map((s) => s.toLowerCase()),
    searchTokens: tokenize(`${doc.title} ${doc.organization} ${(doc.skills || []).join(' ')}`),
  };
}

// Helper fields we compute for queries. Nobody needs to see them.
const DERIVED_FIELDS = [
  'isPublic',
  'isPaid',
  'deadlineSort',
  'locationLower',
  'organizationLower',
  'skillsLower',
  'searchTokens',
  'applyUrlKey',
];

// Fields that must never reach students (public API).
const PRIVATE_FIELDS = ['verificationNotes', 'verifiedBy', ...DERIVED_FIELDS];

export function toPublic(doc) {
  const out = { ...doc };
  for (const f of PRIVATE_FIELDS) delete out[f];
  return out;
}

// Admins see everything except the query helper fields.
export function toAdmin(doc) {
  const out = { ...doc };
  for (const f of DERIVED_FIELDS) delete out[f];
  return out;
}

// Same job link with tracking params / trailing slash / www => same key (duplicate detection).
export function normalizeUrlKey(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${path}${url.search}`;
  } catch {
    return null;
  }
}

// The fields an admin edits (everything in the input schema).
export const CONTENT_KEYS = Object.keys(opportunityInputSchema.shape);

export function contentOf(obj) {
  const out = {};
  for (const k of CONTENT_KEYS) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// Replace all editable fields of an existing document with a new validated input.
export function withContent(existing, input) {
  const base = { ...existing };
  for (const k of CONTENT_KEYS) delete base[k];
  return deriveFields({ ...base, ...input });
}
