import { useEffect, useState } from 'react';
import AuthBar from './AuthBar.jsx';

const TYPES = ['', 'internship', 'job', 'hackathon', 'competition'];

export default function App() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (q.trim()) params.set('q', q.trim());
        if (type) params.set('type', type);
        const res = await fetch(`/api/v1/opportunities?${params}`, { cache: 'no-store' });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(json?.error?.message || `Error ${res.status}`);
        setItems(json?.data || []);
        setError('');
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, type]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, textAlign: 'left' }}>
      <h1>PlacementMate</h1>
      <p>Verified internships, jobs, hackathons and competitions.</p>
      <AuthBar />

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="Search by title, company or skill"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select style={{ padding: 8 }} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t || 'All types'}</option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading && <p>Loading...</p>}
      {!loading && !error && items.length === 0 && <p>No listings found.</p>}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {items.map((o) => (
          <li key={o.id} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
            <strong>{o.title}</strong>
            <div>{o.organization} · {o.type}{o.location ? ` · ${o.location}` : ''}{o.workMode ? ` · ${o.workMode}` : ''}</div>
            {o.skills && o.skills.length > 0 && <div>Skills: {o.skills.join(', ')}</div>}
            {o.deadline && <div>Deadline: {new Date(o.deadline).toLocaleDateString()}</div>}
            {o.applyUrl && (
              <a href={o.applyUrl} target="_blank" rel="noreferrer">Apply</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
