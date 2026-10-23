import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATA_STORE = 'memory';

const { createApp } = await import('../src/app.js');
const { MemoryOpportunityRepository } = await import('../src/repositories/memoryOpportunityRepository.js');
const { buildStoredDocument, opportunityInputSchema } = await import('../src/models/opportunity.js');

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const base = {
  description: 'A test listing description that is long enough to pass validation.',
  applyUrl: 'https://example.com/apply',
  source: { name: 'Test source', url: 'https://example.com/src' },
};

let app;
let ids = {};

async function add(raw, { status = 'published', createdAt } = {}) {
  const doc = buildStoredDocument(opportunityInputSchema.parse({ ...base, ...raw }), {
    now: createdAt ? new Date(createdAt) : new Date(),
  });
  doc.publicationStatus = status;
  doc.verificationNotes = 'INTERNAL NOTE';
  return repo.create(doc);
}

let repo;
before(async () => {
  repo = new MemoryOpportunityRepository();
  const py = await add(
    { type: 'internship', title: 'Python Intern', organization: 'Acme Labs', skills: ['Python', 'SQL'], location: 'Hyderabad', workMode: 'remote', compensation: { kind: 'paid', min: 8000, max: 12000, period: 'month' }, deadline: inDays(30) },
    { createdAt: '2026-01-01T00:00:00Z' },
  );
  const java = await add(
    { type: 'job', title: 'Java Developer', organization: 'Beta Soft', skills: ['Java', 'Spring'], location: 'Bengaluru', workMode: 'onsite', deadline: inDays(5) },
    { createdAt: '2026-02-01T00:00:00Z' },
  );
  const hack = await add(
    { type: 'hackathon', title: 'Campus Hackathon', organization: 'Acme Labs', skills: ['Python'], participation: 'team', teamSize: { min: 2, max: 4 } },
    { createdAt: '2026-03-01T00:00:00Z' },
  );
  const draft = await add({ type: 'internship', title: 'Draft Intern', organization: 'Hidden Co' }, { status: 'draft' });
  const unpub = await add({ type: 'job', title: 'Unpublished Job', organization: 'Hidden Co' }, { status: 'unpublished' });
  const expired = await add(
    { type: 'internship', title: 'Old Python Intern', organization: 'Gone Co', skills: ['Python'], deadline: '2020-01-01T00:00:00Z' },
  );
  ids = { py: py.id, java: java.id, hack: hack.id, draft: draft.id, unpub: unpub.id, expired: expired.id };
  app = createApp({ opportunityRepo: repo });
});

const get = (url) => request(app).get(url);

test('health endpoint works', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('list returns only published, non-expired listings, newest first', async () => {
  const res = await get('/api/v1/opportunities');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map((d) => d.id), [ids.hack, ids.java, ids.py]);
});

test('public output hides internal fields', async () => {
  const res = await get('/api/v1/opportunities');
  for (const item of res.body.data) {
    for (const f of ['verificationNotes', 'searchTokens', 'isPublic', 'skillsLower', 'deadlineSort']) {
      assert.equal(f in item, false, `${f} leaked`);
    }
  }
});

test('filter by type', async () => {
  const res = await get('/api/v1/opportunities?type=job');
  assert.deepEqual(res.body.data.map((d) => d.id), [ids.java]);
});

test('filter by work mode, paid, location, organization (case-insensitive)', async () => {
  assert.deepEqual((await get('/api/v1/opportunities?workMode=remote')).body.data.map((d) => d.id), [ids.py]);
  assert.deepEqual((await get('/api/v1/opportunities?paid=true')).body.data.map((d) => d.id), [ids.py]);
  assert.deepEqual((await get('/api/v1/opportunities?location=bengaluru')).body.data.map((d) => d.id), [ids.java]);
  assert.equal((await get('/api/v1/opportunities?organization=acme%20labs')).body.data.length, 2);
});

test('keyword search matches title, organization and skills', async () => {
  assert.deepEqual((await get('/api/v1/opportunities?q=java')).body.data.map((d) => d.id), [ids.java]);
  assert.equal((await get('/api/v1/opportunities?q=python')).body.data.length, 2);
  assert.equal((await get('/api/v1/opportunities?q=acme')).body.data.length, 2);
});

test('multi-word keyword search narrows results', async () => {
  const res = await get('/api/v1/opportunities?q=python%20intern');
  assert.deepEqual(res.body.data.map((d) => d.id), [ids.py]);
});

test('keyword combined with skill filter works', async () => {
  const res = await get('/api/v1/opportunities?q=acme&skill=sql');
  assert.deepEqual(res.body.data.map((d) => d.id), [ids.py]);
});

test('stop-word-only keyword matches nothing', async () => {
  const res = await get('/api/v1/opportunities?q=the');
  assert.equal(res.body.data.length, 0);
});

test('sort by deadline puts soonest first and no-deadline last', async () => {
  const res = await get('/api/v1/opportunities?sort=deadline');
  assert.deepEqual(res.body.data.map((d) => d.id), [ids.java, ids.py, ids.hack]);
});

test('pagination walks all pages without duplicates', async () => {
  const seen = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const res = await get(`/api/v1/opportunities?limit=1${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(res.status, 200);
    seen.push(...res.body.data.map((d) => d.id));
    cursor = res.body.page.nextCursor;
    if (!cursor) break;
  }
  assert.deepEqual(seen, [ids.hack, ids.java, ids.py]);
});

test('invalid cursor and invalid params return 400 with the standard error shape', async () => {
  const bad = await get('/api/v1/opportunities?cursor=not-a-cursor');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_CURSOR');

  const bad2 = await get('/api/v1/opportunities?type=banana&limit=500');
  assert.equal(bad2.status, 400);
  assert.equal(bad2.body.error.code, 'VALIDATION_ERROR');

  const unknown = await get('/api/v1/opportunities?hack=1');
  assert.equal(unknown.status, 400);
});

test('detail returns a published listing', async () => {
  const res = await get(`/api/v1/opportunities/${ids.py}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.title, 'Python Intern');
  assert.equal(res.body.data.applyUrl, 'https://example.com/apply');
});

test('detail returns 404 for drafts, unpublished and unknown ids', async () => {
  for (const id of [ids.draft, ids.unpub, 'doesnotexist']) {
    const res = await get(`/api/v1/opportunities/${id}`);
    assert.equal(res.status, 404, id);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  }
});

test('detail rejects malformed ids', async () => {
  const res = await get('/api/v1/opportunities/bad%20id!');
  assert.equal(res.status, 400);
});

test('unknown route returns JSON 404', async () => {
  const res = await get('/api/v1/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
});

test('write methods are not exposed publicly', async () => {
  const res = await request(app).post('/api/v1/opportunities').send({ title: 'x' });
  assert.equal(res.status, 404);
});

test('schema rejects unsafe URLs', () => {
  for (const applyUrl of ['javascript:alert(1)', 'ftp://example.com/x', 'https://user:pw@example.com/']) {
    const r = opportunityInputSchema.safeParse({ ...base, type: 'job', title: 'Test job', organization: 'Org', applyUrl });
    assert.equal(r.success, false, applyUrl);
  }
});
