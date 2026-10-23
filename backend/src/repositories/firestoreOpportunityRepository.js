import { FieldPath } from 'firebase-admin/firestore';
import { deriveFields } from '../models/opportunity.js';
import { encodeCursor, passesPostFilters } from '../models/listQuery.js';

const COLLECTION = 'opportunities';

export class FirestoreOpportunityRepository {
  constructor(db) {
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
