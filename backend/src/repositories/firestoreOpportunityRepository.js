import { FieldPath } from 'firebase-admin/firestore';
import { deriveFields } from '../models/opportunity.js';
import { encodeCursor, passesPostFilters } from '../models/listQuery.js';

const COLLECTION = 'opportunities';
const AUDIT_COLLECTION = 'adminReviews';

export class FirestoreOpportunityRepository {
  constructor(db) {
    this.db = db;
    this.col = db.collection(COLLECTION);
  }

  async create(doc) {
    const ref = doc.id ? this.col.doc(doc.id) : this.col.doc();
    const stored = deriveFields({ ...doc, id: ref.id });
    await ref.set(stored);
    return stored;
  }

  async getById(id) {
    const snap = await this.col.doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  // Replace the whole document (derived fields are recomputed).
  async save(doc) {
    const stored = deriveFields(doc);
    await this.col.doc(stored.id).set(stored);
    return stored;
  }

  async delete(id) {
    await this.col.doc(id).delete();
    return true;
  }

  async findByApplyUrlKey(key) {
    const snap = await this.col.where('applyUrlKey', '==', key).limit(10).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async addAudit(record) {
    const ref = this.db.collection(AUDIT_COLLECTION).doc();
    const entry = { id: ref.id, ...record };
    await ref.set(entry);
    return entry;
  }

  // Newest first. Needs the (opportunityId, createdAt desc) index in firestore.indexes.json.
  async listAudit(opportunityId, limit = 50) {
    const snap = await this.db
      .collection(AUDIT_COLLECTION)
      .where('opportunityId', '==', opportunityId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async list(plan) {
    let q = this.col;
    for (const [field, value] of Object.entries(plan.equals)) q = q.where(field, '==', value);
    if (plan.arrayContains) q = q.where(plan.arrayContains.field, 'array-contains', plan.arrayContains.value);

    q = q.orderBy(plan.sortField, plan.direction).orderBy(FieldPath.documentId(), plan.direction);
    if (plan.cursor) q = q.startAfter(plan.cursor.sortValue, plan.cursor.id);

    // Read one extra document to learn whether another page exists.
    const snap = await q.limit(plan.limit + 1).get();
    const scanned = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const page = scanned.slice(0, plan.limit);
    const hasMore = scanned.length > plan.limit;
    const items = page.filter((d) => passesPostFilters(d, plan.postFilters));
    const last = page[page.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last[plan.sortField], last.id) : null,
    };
  }
}
