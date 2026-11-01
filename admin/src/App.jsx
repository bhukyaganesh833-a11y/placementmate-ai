import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, API_BASE } from './firebase.js';
import AddListing from './AddListing.jsx';

const ADMIN = `${API_BASE}/api/v1/admin/opportunities`;

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);

  const call = useCallback(async (method, path, body) => {
    const token = await user.getIdToken();
    const res = await fetch(`${ADMIN}${path}`, {
      method,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.error?.message || json?.error?.code || `Error ${res.status}`);
    return json;
  }, [user]);

  const loadItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const qs = params.toString();
      const json = await call('GET', qs ? ('?' + qs) : '');
      setItems(json?.data || []);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [call, status, type]);

  useEffect(() => { if (user) loadItems(); }, [user, loadItems]);

  async function act(id, path, body) {
    setBusyId(id);
    try {
      await call('POST', `/${id}/${path}`, body || {});
      await loadItems();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  }

  async function createListing(body) {
    const json = await call('POST', '', body);
    await loadItems();
    if (json?.duplicates?.length) {
      window.alert('Warning: ' + json.duplicates.length + ' listing(s) already use the same apply link.');
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!ready) return <p style={{ padding: 24 }}>Loading...</p>;

  if (!user) {
    return (
      <form onSubmit={handleLogin} style={{ maxWidth: 320, margin: '80px auto', display: 'grid', gap: 12 }}>
        <h2>PlacementMate Admin</h2>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Sign in</button>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </form>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Listings</h2>
        <button onClick={() => signOut(auth)}>Sign out ({user.email})</button>
      </div>
      <AddListing onCreate={createListing} />
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">published</option>
          <option value="unpublished">unpublished</option>
          <option value="draft">draft</option>
          <option value="in_review">in_review</option>
          <option value="rejected">rejected</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="internship">internship</option>
          <option value="job">job</option>
          <option value="hackathon">hackathon</option>
          <option value="competition">competition</option>
        </select>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {items.length === 0 && !error && <p>No listings yet.</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {items.map((o) => (
          <li key={o.id} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
            <strong>{o.title}</strong> ({o.organization})
            <div style={{ margin: '6px 0' }}>
              {o.publicationStatus} / {o.verificationStatus}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {o.verificationStatus !== 'verified' && (
                <button
                  disabled={busyId === o.id}
                  onClick={() => {
                    if (!window.confirm('Confirm: source verified, apply link works, and no applicant fee?')) return;
                    act(o.id, 'review', {
                      result: 'approve',
                      notes: 'Approved from admin panel',
                      checks: { sourceVerified: true, applyLinkWorks: true, noApplicantFee: true },
                    });
                  }}
                >
                  Approve
                </button>
              )}
              {o.verificationStatus !== 'verified' && o.verificationStatus !== 'rejected' && (
                <button
                  disabled={busyId === o.id}
                  onClick={() => {
                    const notes = window.prompt('Reject reason?');
                    if (!notes) return;
                    act(o.id, 'review', { result: 'reject', notes });
                  }}
                >
                  Reject
                </button>
              )}
              {o.verificationStatus === 'verified' && o.publicationStatus !== 'published' && (
                <button disabled={busyId === o.id} onClick={() => act(o.id, 'publish')}>
                  Publish
                </button>
              )}
              {o.publicationStatus === 'published' && (
                <button
                  disabled={busyId === o.id}
                  onClick={() => act(o.id, 'unpublish', { notes: 'Unpublished from admin panel' })}
                >
                  Unpublish
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
