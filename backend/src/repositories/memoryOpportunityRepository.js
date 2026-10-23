import { randomUUID } from 'node:crypto';
import { deriveFields } from '../models/opportunity.js';
import { encodeCursor, passesPostFilters } from '../models/listQuery.js';

// In-memory store with the same behaviour as the Firestore repository.
// Used for tests and for running the API before Firebase is configured.
export class MemoryOpportunityRepository {
  constructor() {
    this.docs = new Map();
    this.auditLog = [];
  }

  async create(doc) {
    const id = doc.id || randomUUID().replace(/-/g, '').slice(0, 20);
    const stored = deriveFields({ ...doc, id });
    this.docs.set(id, stored);
    return stored;
  }

  async getById(id) {
    return this.docs.get(id) || null;
  }

  // Replace the whole document (derived fields are recomputed).
  async save(doc) {
    const stored = deriveFields(doc);
    this.docs.set(stored.id, stored);
    return stored;
  }

  async delete(id) {
    return this.docs.delete(id);
  }

  async findByApplyUrlKey(key) {
    return [...this.docs.values()].filter((d) => d.applyUrlKey === key).slice(0, 10);
  }

  async addAudit(record) {
    const entry = { id: randomUUID().replace(/-/g, '').slice(0, 20), ...record };
    this.auditLog.push(entry);
    return entry;
  }

  // Newest first.
  async listAudit(opportunityId, limit = 50) {
    return this.auditLog
      .filter((a) => a.opportunityId === opportunityId)
      .reverse()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, limit);
  }

  async list(plan) {
    const dir = plan.direction === 'asc' ? 1 : -1;
    let rows = [...this.docs.values()].filter((d) =>
      Object.entries(plan.equals).every(([k, v]) => d[k] === v),
    );
    if (plan.arrayContains) {
      rows = rows.filter((d) => (d[plan.arrayContains.field] || []).includes(plan.arrayContains.value));
    }
    const cmp = (a, b) => {
      const av = a[plan.sortField];
      const bv = b[plan.sortField];
      if (av !== bv) return av < bv ? -dir : dir;
      return a.id < b.id ? -dir : a.id > b.id ? dir : 0;
    };
    rows.sort(cmp);
    if (plan.cursor) {
      const c = { [plan.sortField]: plan.cursor.sortValue, id: plan.cursor.id };
      rows = rows.filter((d) => cmp(d, c) > 0);
    }
    const scanned = rows.slice(0, plan.limit + 1);
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
