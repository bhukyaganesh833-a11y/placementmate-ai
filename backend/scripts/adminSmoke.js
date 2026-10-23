// Live check of the admin API against a RUNNING server (npm run dev, DATA_STORE=firestore).
// It creates one clearly-labelled test listing, walks it through review/publish/unpublish,
// then deletes it. Usage:
//   npm run smoke:admin -- admin@example.com YourPassword
import { signIn } from './lib/signIn.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run smoke:admin -- <admin email> <password>');
  process.exit(1);
}

const base = process.env.API_BASE || 'http://localhost:8080';
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function call(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

let token;
let id;

try {
  check('Server is running', (await call('GET', '/health')).status === 200);
  check('Admin route without a token is refused (401)', (await call('GET', '/api/v1/admin/opportunities')).status === 401);

  token = await signIn(email, password);
  check('Signed in with Firebase', Boolean(token));

  const list = await call('GET', '/api/v1/admin/opportunities', token);
  check('Admin list works (200)', list.status === 200, `status ${list.status}${list.json?.error ? ` ${list.json.error.code}` : ''}`);
  if (list.status === 403) console.log('      -> this account is not an admin yet. Run: npm run set-admin -- <email>');

  const created = await call('POST', '/api/v1/admin/opportunities', token, {
    type: 'internship',
    title: '[TEST] Smoke test listing (delete me)',
    organization: 'Smoke Test Org',
    description: 'Temporary listing created by the admin smoke test. It is deleted at the end of the run.',
    skills: ['Smoke'],
    deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    applyUrl: 'https://example.com/smoke-test',
    source: { name: 'Smoke test', url: 'https://example.com/smoke-test' },
  });
  id = created.json?.data?.id;
  check('Create draft (201)', created.status === 201 && created.json.data.publicationStatus === 'draft', `status ${created.status}`);

  if (id) {
    const early = await call('POST', `/api/v1/admin/opportunities/${id}/publish`, token, {});
    check('Publishing before verification is blocked (409)', early.status === 409);

    const weak = await call('POST', `/api/v1/admin/opportunities/${id}/review`, token, {
      result: 'approve',
      notes: 'Missing checks on purpose',
      checks: { sourceVerified: true, applyLinkWorks: true, noApplicantFee: false },
    });
    check('Approval without all checks is refused (400)', weak.status === 400);

    const ok = await call('POST', `/api/v1/admin/opportunities/${id}/review`, token, {
      result: 'approve',
      notes: 'Smoke test: all checks confirmed',
      checks: { sourceVerified: true, applyLinkWorks: true, noApplicantFee: true },
    });
    check('Approve with all checks (200, verified)', ok.status === 200 && ok.json.data.verificationStatus === 'verified');

    const pub = await call('POST', `/api/v1/admin/opportunities/${id}/publish`, token, {});
    check('Publish (200)', pub.status === 200 && pub.json.data.publicationStatus === 'published');

    const detail = await call('GET', `/api/v1/opportunities/${id}`);
    check('Students can open the published listing', detail.status === 200);
    const search = await call('GET', '/api/v1/opportunities?q=smoke&limit=50');
    check('Listing appears in the public search', Boolean(search.json?.data?.some((d) => d.id === id)), `status ${search.status}`);

    const unpub = await call('POST', `/api/v1/admin/opportunities/${id}/unpublish`, token, { notes: 'Smoke test cleanup' });
    check('Unpublish (200)', unpub.status === 200);
    const gone = await call('GET', `/api/v1/opportunities/${id}`);
    check('Students can no longer see it (404)', gone.status === 404);

    const history = await call('GET', `/api/v1/admin/opportunities/${id}/history`, token);
    check('Audit history is recorded', history.status === 200 && history.json.data.length >= 4, `${history.json?.data?.length ?? 0} entries`);
  }
} catch (err) {
  check('Script ran without an exception', false, err.message);
} finally {
  if (id && token) {
    const del = await call('DELETE', `/api/v1/admin/opportunities/${id}`, token, { notes: 'Smoke test cleanup' });
    check('Cleanup: test listing deleted', del.status === 200);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
