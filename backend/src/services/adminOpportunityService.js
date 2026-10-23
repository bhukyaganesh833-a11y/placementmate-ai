import { z } from 'zod';
import {
  opportunityInputSchema,
  buildStoredDocument,
  toAdmin,
  withContent,
  contentOf,
  stableStringify,
  normalizeUrlKey,
} from '../models/opportunity.js';
import { adminListQuerySchema, buildAdminPlan, buildOverduePlan } from '../models/adminQuery.js';
import { decodeCursor } from '../models/listQuery.js';
import { HttpError, notFound } from '../utils/errors.js';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');

const notes = z.string().trim().min(5, 'Notes must be at least 5 characters').max(1000);
const confirmed = z.literal(true, { message: 'This check must be completed and confirmed' });

// Approving means the admin really checked these three things.
const reviewSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('approve'),
    notes,
    checks: z.object({
      sourceVerified: confirmed, // listing matches the official source page
      applyLinkWorks: confirmed, // official apply/registration link opens and is correct
      noApplicantFee: confirmed, // applicants are not asked to pay to apply
    }),
  }),
  z.object({ result: z.literal('reject'), notes }),
]);

const optionalNotesSchema = z.object({ notes: z.string().trim().max(1000).optional() }).default({});

const SUBMITTABLE = ['draft', 'rejected', 'unpublished'];

export class AdminOpportunityService {
  constructor(repo) {
    this.repo = repo;
  }

  async list(rawQuery) {
    const params = adminListQuerySchema.parse(rawQuery);
    const { items, nextCursor } = await this.repo.list(buildAdminPlan(params));
    return { items: items.map(toAdmin), nextCursor };
  }

  async get(rawId) {
    return toAdmin(await this.#mustGet(rawId));
  }

  async history(rawId) {
    const doc = await this.#mustGet(rawId);
    return this.repo.listAudit(doc.id);
  }

  // New listings always start as unverified drafts.
  async create(rawBody, actor) {
    const input = opportunityInputSchema.parse(rawBody);
    const saved = await this.repo.create(buildStoredDocument(input));
    await this.#audit(saved.id, actor, 'create');
    return { item: toAdmin(saved), duplicates: await this.#duplicates(saved) };
  }

  // Full replace of the editable fields. If the content really changed, the listing loses its
  // "verified" status (and goes offline if it was published) until it is checked again.
  async replace(rawId, rawBody, actor) {
    const existing = await this.#mustGet(rawId);
    const input = opportunityInputSchema.parse(rawBody);

    const changed = stableStringify(contentOf(existing)) !== stableStringify(contentOf(input));
    const next = withContent(existing, input);
    next.updatedAt = nowIso();

    if (changed) {
      next.verificationStatus = 'unverified';
      next.lastVerifiedAt = null;
      next.verifiedBy = null;
      if (existing.publicationStatus === 'published') next.publicationStatus = 'unpublished';
    }
    // A new deadline can bring an expired listing back; the date is re-checked on save.
    if (existing.deadline !== next.deadline) next.isExpired = false;

    const saved = await this.repo.save(next);
    await this.#audit(saved.id, actor, 'update', {
      notes: changed ? 'Content changed: verification reset' : 'No content change',
    });
    return { item: toAdmin(saved), duplicates: await this.#duplicates(saved) };
  }

  async submit(rawId, actor) {
    const existing = await this.#mustGet(rawId);
    if (!SUBMITTABLE.includes(existing.publicationStatus)) {
      throw new HttpError(409, 'INVALID_STATE', `Cannot submit a listing that is ${existing.publicationStatus}`);
    }
    return this.#transition(existing, actor, 'submit', { publicationStatus: 'in_review' });
  }

  async review(rawId, rawBody, actor) {
    const body = reviewSchema.parse(rawBody);
    const existing = await this.#mustGet(rawId);

    if (body.result === 'approve') {
      return this.#transition(
        existing,
        actor,
        'review',
        {
          verificationStatus: 'verified',
          verificationNotes: body.notes,
          lastVerifiedAt: nowIso(),
          verifiedBy: actor.uid,
          // A previously rejected listing goes back to review; publishing is a separate step.
          ...(existing.publicationStatus === 'rejected' ? { publicationStatus: 'in_review' } : {}),
        },
        { result: 'approve', notes: body.notes },
      );
    }

    // Rejecting also takes a published listing offline.
    return this.#transition(
      existing,
      actor,
      'review',
      {
        verificationStatus: 'rejected',
        publicationStatus: 'rejected',
        verificationNotes: body.notes,
        lastVerifiedAt: null,
        verifiedBy: null,
      },
      { result: 'reject', notes: body.notes },
    );
  }

  async publish(rawId, actor) {
    const existing = await this.#mustGet(rawId);
    if (existing.publicationStatus === 'published') {
      throw new HttpError(409, 'INVALID_STATE', 'Listing is already published');
    }
    if (existing.verificationStatus !== 'verified') {
      throw new HttpError(409, 'NOT_VERIFIED', 'A listing must be reviewed and verified before it can be published');
    }
    if (existing.isExpired || (existing.deadline && new Date(existing.deadline) < new Date())) {
      throw new HttpError(409, 'EXPIRED', 'Listing has expired. Update the deadline first');
    }
    return this.#transition(existing, actor, 'publish', {
      publicationStatus: 'published',
      publishedAt: nowIso(),
    });
  }

  async unpublish(rawId, rawBody, actor) {
    const { notes: reason } = optionalNotesSchema.parse(rawBody);
    const existing = await this.#mustGet(rawId);
    if (existing.publicationStatus !== 'published') {
      throw new HttpError(409, 'INVALID_STATE', 'Only published listings can be unpublished');
    }
    return this.#transition(existing, actor, 'unpublish', { publicationStatus: 'unpublished' }, { notes: reason });
  }

  async expire(rawId, actor) {
    const existing = await this.#mustGet(rawId);
    return this.#transition(existing, actor, 'expire', { isExpired: true });
  }

  async remove(rawId, rawBody, actor) {
    const { notes: reason } = optionalNotesSchema.parse(rawBody);
    const existing = await this.#mustGet(rawId);
    await this.repo.delete(existing.id);
    await this.#audit(existing.id, actor, 'delete', { notes: reason || `Deleted: ${existing.title}` });
    return { id: existing.id, deleted: true };
  }

  // Marks published listings whose deadline has passed as expired (safe to run repeatedly).
  async expireOverdue(actor) {
    const nowStamp = nowIso();
    let cursor = null;
    let expired = 0;

    for (let page = 0; page < 5; page += 1) {
      const { items, nextCursor } = await this.repo.list(buildOverduePlan(cursor));
      let reachedFuture = false;
      for (const doc of items) {
        if (doc.deadlineSort >= nowStamp) {
          reachedFuture = true;
          break;
        }
        await this.repo.save({ ...doc, isExpired: true, updatedAt: nowStamp });
        await this.#audit(doc.id, actor, 'expire', { notes: 'Deadline passed' });
        expired += 1;
      }
      if (reachedFuture || !nextCursor) break;
      cursor = decodeCursor(nextCursor);
    }
    return { expired };
  }

  // ---- helpers ----------------------------------------------------------

  async #mustGet(rawId) {
    const id = idSchema.parse(rawId);
    const doc = await this.repo.getById(id);
    if (!doc) throw notFound('Opportunity not found');
    return doc;
  }

  async #transition(existing, actor, action, changes, auditExtra = {}) {
    const saved = await this.repo.save({ ...existing, ...changes, updatedAt: nowIso() });
    await this.#audit(saved.id, actor, action, auditExtra);
    return toAdmin(saved);
  }

  async #audit(opportunityId, actor, action, { result = null, notes: auditNotes = '' } = {}) {
    await this.repo.addAudit({
      opportunityId,
      reviewerId: actor.uid,
      reviewerEmail: actor.email || null,
      action,
      result,
      notes: auditNotes || '',
      createdAt: nowIso(),
    });
  }

  // Other listings with the same official apply link (tracking params ignored).
  async #duplicates(doc) {
    const key = normalizeUrlKey(doc.applyUrl);
    if (!key) return [];
    const found = await this.repo.findByApplyUrlKey(key);
    return found
      .filter((d) => d.id !== doc.id)
      .map((d) => ({ id: d.id, title: d.title, organization: d.organization, publicationStatus: d.publicationStatus }));
  }
}

function nowIso() {
  return new Date().toISOString();
}
