import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATA_STORE = 'memory';

const { createApp } = await import('../src/app.js');
const { MemoryOpportunityRepository } = await import('../src/repositories/memoryOpportunityRepository.js');

// Fake token verifier: no Firebase needed in tests.
const verifier = {
  async verify(token) {
    if (token === 'admin-token') return { uid: 'admin1', email: 'admin@example.com', role: 'admin' };
    if (token === 'student-token') return { uid: 'stu1', email: 'student@example.com' };
    throw new Error('invalid token');
  },
};

function setup() {
  const repo = new MemoryOpportunityRepository();
  const app = createApp({ opportunityRepo: repo, authVerifier: verifier });
  const admin = (method, url) => request(app)[method](url).set('Authorization', 'Bearer admin-token');
  return { repo, app, admin };
}

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

const listing = (over = {}) => ({
  type: 'internship',
  title: 'Test Python Intern',
  organization: 'Acme Labs',
  description: 'A test listing description that is long enough to pass validation.',
  skills: ['Python'],
  deadline: inDays(30),
  applyUrl: 'https://example.com/apply/1',
  source: { name: 'Acme careers page', url: 'https://example.com/careers' },
  ...over,
});

const approval = {
  result: 'approve',
  notes: 'Checked on the official careers page',
  checks: { sourceVerified: true, applyLinkWorks: true, noApplicantFee: true },
};

async function createDraft(admin, over) {
  const res = await admin('post', '/api/v1/admin/opportunities').send(listing(over));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function createPublished(admin, over) {
  const item = await createDraft(admin, over);
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${item.id}/review`).send(approval)).status, 200);
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${item.id}/publish`).send({})).status, 200);
  return item;
}

const publicIds = async (app, qs = '') =>
  (await request(app).get(`/api/v1/opportunities${qs}`)).body.data.map((d) => d.id);

// ---- Authentication and authorization ----------------------------------------

test('admin routes reject requests without a token', async () => {
  const { app } = setup();
  const res = await request(app).get('/api/v1/admin/opportunities');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});

test('admin routes reject invalid tokens', async () => {
  const { app } = setup();
  const res = await request(app).get('/api/v1/admin/opportunities').set('Authorization', 'Bearer nonsense');
  assert.equal(res.status, 401);
});

test('a normal student token can never use admin routes', async () => {
  const { app } = setup();
  const student = (method, url) => request(app)[method](url).set('Authorization', 'Bearer student-token');
  assert.equal((await student('get', '/api/v1/admin/opportunities')).status, 403);
  assert.equal((await student('post', '/api/v1/admin/opportunities').send(listing())).status, 403);
  assert.equal((await student('post', '/api/v1/admin/maintenance/expire-overdue')).status, 403);
  const res = await student('delete', '/api/v1/admin/opportunities/abc');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

test('a role field in the request body or headers does not grant admin', async () => {
  const { app } = setup();
  const res = await request(app)
    .post('/api/v1/admin/opportunities')
    .set('Authorization', 'Bearer student-token')
    .set('X-Role', 'admin')
    .send({ ...listing(), role: 'admin' });
  assert.equal(res.status, 403);
});

test('admin API is disabled (503) when no auth verifier is configured', async () => {
  const app = createApp({ opportunityRepo: new MemoryOpportunityRepository() });
  const res = await request(app).get('/api/v1/admin/opportunities');
  assert.equal(res.status, 503);
});

// ---- Create / read / validation ----------------------------------------------

test('creating a listing makes an unverified draft that students cannot see', async () => {
  const { app, admin } = setup();
  const item = await createDraft(admin);
  assert.equal(item.publicationStatus, 'draft');
  assert.equal(item.verificationStatus, 'unverified');
  assert.equal(item.lastVerifiedAt, null);
  assert.deepEqual(await publicIds(app), []);
  assert.equal((await request(app).get(`/api/v1/opportunities/${item.id}`)).status, 404);
});

test('admin responses hide internal helper fields but show verification details', async () => {
  const { admin } = setup();
  const item = await createDraft(admin);
  const res = await admin('get', `/api/v1/admin/opportunities/${item.id}`);
  assert.equal(res.status, 200);
  assert.equal('searchTokens' in res.body.data, false);
  assert.equal('verificationStatus' in res.body.data, true);
});

test('invalid listings are rejected with details', async () => {
  const { admin } = setup();
  const res = await admin('post', '/api/v1/admin/opportunities').send(listing({ applyUrl: 'javascript:alert(1)', title: 'x' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.length >= 2);
});

test('admin list can filter by status and type', async () => {
  const { admin } = setup();
  const draft = await createDraft(admin, { applyUrl: 'https://example.com/a' });
  const job = await createPublished(admin, { type: 'job', title: 'Junior Java Dev', applyUrl: 'https://example.com/b' });

  const all = await admin('get', '/api/v1/admin/opportunities');
  assert.equal(all.body.data.length, 2);
  const drafts = await admin('get', '/api/v1/admin/opportunities?status=draft');
  assert.deepEqual(drafts.body.data.map((d) => d.id), [draft.id]);
  const jobs = await admin('get', '/api/v1/admin/opportunities?type=job');
  assert.deepEqual(jobs.body.data.map((d) => d.id), [job.id]);
  assert.equal((await admin('get', '/api/v1/admin/opportunities?status=banana')).status, 400);
});

test('unknown id returns 404 and malformed id returns 400', async () => {
  const { admin } = setup();
  assert.equal((await admin('get', '/api/v1/admin/opportunities/doesnotexist')).status, 404);
  assert.equal((await admin('get', '/api/v1/admin/opportunities/bad%20id!')).status, 400);
});

// ---- Review and publish workflow ---------------------------------------------

test('cannot publish a listing that was not verified', async () => {
  const { admin } = setup();
  const item = await createDraft(admin);
  const res = await admin('post', `/api/v1/admin/opportunities/${item.id}/publish`).send({});
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'NOT_VERIFIED');
});

test('approval requires every verification check to be confirmed', async () => {
  const { admin } = setup();
  const item = await createDraft(admin);
  const url = `/api/v1/admin/opportunities/${item.id}/review`;

  const partial = { ...approval, checks: { ...approval.checks, noApplicantFee: false } };
  assert.equal((await admin('post', url).send(partial)).status, 400);
  assert.equal((await admin('post', url).send({ ...approval, checks: undefined })).status, 400);
  assert.equal((await admin('post', url).send({ ...approval, notes: 'ok' })).status, 400);

  const ok = await admin('post', url).send(approval);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.verificationStatus, 'verified');
  assert.ok(ok.body.data.lastVerifiedAt);
  assert.equal(ok.body.data.verifiedBy, 'admin1');
});

test('verified listing can be published and then appears for students', async () => {
  const { app, admin } = setup();
  const item = await createPublished(admin);
  assert.deepEqual(await publicIds(app), [item.id]);

  const detail = await request(app).get(`/api/v1/opportunities/${item.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.verificationStatus, 'verified');
  // admin-only fields stay private
  assert.equal('verificationNotes' in detail.body.data, false);
  assert.equal('verifiedBy' in detail.body.data, false);
});

test('publishing twice and unpublishing a draft are rejected', async () => {
  const { admin } = setup();
  const item = await createPublished(admin);
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${item.id}/publish`).send({})).status, 409);

  const draft = await createDraft(admin, { applyUrl: 'https://example.com/other' });
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${draft.id}/unpublish`).send({})).status, 409);
});

test('unpublish removes a listing from the public site', async () => {
  const { app, admin } = setup();
  const item = await createPublished(admin);
  const res = await admin('post', `/api/v1/admin/opportunities/${item.id}/unpublish`).send({ notes: 'Employer asked to pause' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.publicationStatus, 'unpublished');
  assert.deepEqual(await publicIds(app), []);
  assert.equal((await request(app).get(`/api/v1/opportunities/${item.id}`)).status, 404);
});

test('rejecting a published listing takes it offline and blocks publishing', async () => {
  const { app, admin } = setup();
  const item = await createPublished(admin);
  const res = await admin('post', `/api/v1/admin/opportunities/${item.id}/review`).send({
    result: 'reject',
    notes: 'Employer asks applicants for a fee',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.publicationStatus, 'rejected');
  assert.equal(res.body.data.verificationStatus, 'rejected');
  assert.deepEqual(await publicIds(app), []);
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${item.id}/publish`).send({})).status, 409);
});

test('submit moves a draft to in_review; published listings cannot be submitted', async () => {
  const { admin } = setup();
  const draft = await createDraft(admin);
  const sub = await admin('post', `/api/v1/admin/opportunities/${draft.id}/submit`);
  assert.equal(sub.body.data.publicationStatus, 'in_review');
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${draft.id}/submit`)).status, 409);
});

// ---- Editing -------------------------------------------------------------------

test('changing a published listing resets verification and takes it offline', async () => {
  const { app, admin } = setup();
  const item = await createPublished(admin);

  const res = await admin('put', `/api/v1/admin/opportunities/${item.id}`).send(listing({ applyUrl: 'https://example.com/new-link' }));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.verificationStatus, 'unverified');
  assert.equal(res.body.data.lastVerifiedAt, null);
  assert.equal(res.body.data.publicationStatus, 'unpublished');
  assert.deepEqual(await publicIds(app), []);
  assert.equal(res.body.data.id, item.id);
  assert.equal(res.body.data.createdAt, item.createdAt);
});

test('saving a listing without real changes keeps it published', async () => {
  const { app, admin } = setup();
  const body = listing(); // same body (same deadline) for create and save
  const item = await createPublished(admin, body);
  const res = await admin('put', `/api/v1/admin/opportunities/${item.id}`).send(body);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.publicationStatus, 'published');
  assert.equal(res.body.data.verificationStatus, 'verified');
  assert.deepEqual(await publicIds(app), [item.id]);
});

test('editing can clear optional fields', async () => {
  const { admin } = setup();
  const item = await createDraft(admin, { location: 'Hyderabad' });
  assert.equal(item.location, 'Hyderabad');
  const body = listing();
  delete body.location;
  const res = await admin('put', `/api/v1/admin/opportunities/${item.id}`).send(body);
  assert.equal('location' in res.body.data, false);
});

// ---- Expiry, deletion, duplicates, audit ---------------------------------------

test('students never see a listing once its deadline has passed, and expire-overdue marks it', async () => {
  const { app, repo, admin } = setup();
  const item = await createPublished(admin);

  // simulate time passing after publication
  const stored = await repo.getById(item.id);
  const past = new Date(Date.now() - 86_400_000).toISOString();
  repo.docs.set(item.id, { ...stored, deadline: past, deadlineSort: past });
  assert.deepEqual(await publicIds(app), []); // hidden even before cleanup

  const res = await admin('post', '/api/v1/admin/maintenance/expire-overdue');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.expired, 1);
  assert.equal((await admin('get', `/api/v1/admin/opportunities/${item.id}`)).body.data.isExpired, true);

  const again = await admin('post', '/api/v1/admin/maintenance/expire-overdue');
  assert.equal(again.body.data.expired, 0);
});

test('manually marking a listing expired hides it', async () => {
  const { app, admin } = setup();
  const item = await createPublished(admin);
  const res = await admin('post', `/api/v1/admin/opportunities/${item.id}/expire`);
  assert.equal(res.body.data.isExpired, true);
  assert.deepEqual(await publicIds(app), []);
  // an expired listing cannot be re-published until its deadline is updated
  await admin('post', `/api/v1/admin/opportunities/${item.id}/unpublish`).send({});
  assert.equal((await admin('post', `/api/v1/admin/opportunities/${item.id}/publish`).send({})).status, 409);
});

test('delete removes the listing but keeps the audit history', async () => {
  const { repo, admin } = setup();
  const item = await createPublished(admin);
  const del = await admin('delete', `/api/v1/admin/opportunities/${item.id}`).send({ notes: 'Misleading listing' });
  assert.equal(del.status, 200);
  assert.equal((await admin('get', `/api/v1/admin/opportunities/${item.id}`)).status, 404);

  const history = await repo.listAudit(item.id);
  assert.equal(history[0].action, 'delete');
  assert.equal(history[0].notes, 'Misleading listing');
  assert.equal(history[0].reviewerId, 'admin1');
});

test('duplicate apply links are reported (tracking params and trailing slash ignored)', async () => {
  const { admin } = setup();
  const first = await createDraft(admin, { applyUrl: 'https://www.example.com/jobs/42/' });
  const res = await admin('post', '/api/v1/admin/opportunities').send(
    listing({ title: 'Same job posted again', applyUrl: 'https://example.com/jobs/42?utm_source=telegram' }),
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.duplicates.length, 1);
  assert.equal(res.body.duplicates[0].id, first.id);
});

test('every admin action is written to the audit history, newest first', async () => {
  const { admin } = setup();
  const item = await createDraft(admin);
  await admin('post', `/api/v1/admin/opportunities/${item.id}/review`).send(approval);
  await admin('post', `/api/v1/admin/opportunities/${item.id}/publish`).send({});

  const res = await admin('get', `/api/v1/admin/opportunities/${item.id}/history`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((h) => h.action), ['publish', 'review', 'create']);
  const review = res.body.data[1];
  assert.equal(review.reviewerId, 'admin1');
  assert.equal(review.result, 'approve');
  assert.ok(review.createdAt);
});

test('public API still refuses write methods', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/v1/opportunities').send(listing());
  assert.equal(res.status, 404);
});
