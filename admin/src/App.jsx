import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, API_BASE } from './firebase.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/api/v1/admin/opportunities`, { cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text(); if (!text) throw new Error(`Empty response, status ${res.status}`); const json = JSON.parse(text);
        if (!res.ok) throw new Error(json?.error?.code || `Error ${res.status}`);
        setItems(json.data || []);
        setError('');
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [user]);

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
    <div style={{ maxWidth: 800, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Listings</h2>
        <button onClick={() => signOut(auth)}>Sign out ({user.email})</button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {items.length === 0 && !error && <p>No listings yet.</p>}
      <ul>
        {items.map((o) => (
          <li key={o.id}>
            {o.title} ({o.organization}) - {o.publicationStatus} / {o.verificationStatus}
          </li>
        ))}
      </ul>
    </div>
  );
}
