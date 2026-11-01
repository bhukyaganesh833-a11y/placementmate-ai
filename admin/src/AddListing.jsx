import { useState } from 'react';

const empty = {
  type: 'internship', title: '', organization: '', description: '',
  applyUrl: '', sourceName: '', sourceUrl: '', location: '', skills: '', deadline: '',
};

export default function AddListing({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const body = {
        type: f.type,
        title: f.title,
        organization: f.organization,
        description: f.description,
        applyUrl: f.applyUrl,
        source: { name: f.sourceName, url: f.sourceUrl },
        skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (f.location.trim()) body.location = f.location.trim();
      if (f.deadline) body.deadline = new Date(`${f.deadline}T23:59:00+05:30`).toISOString();
      await onCreate(body);
      setF(empty);
      setOpen(false);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button onClick={() => setOpen(true)}>+ Add listing</button>;

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, border: '1px solid #ccc', borderRadius: 8, padding: 12, margin: '12px 0' }}>
      <select value={f.type} onChange={set('type')}>
        <option value="internship">internship</option>
        <option value="job">job</option>
        <option value="hackathon">hackathon</option>
        <option value="competition">competition</option>
      </select>
      <input placeholder="Title (min 3 chars)" value={f.title} onChange={set('title')} required />
      <input placeholder="Company / organizer" value={f.organization} onChange={set('organization')} required />
      <textarea placeholder="Description (min 20 chars)" rows={4} value={f.description} onChange={set('description')} required />
      <input placeholder="Official apply link (https://...)" value={f.applyUrl} onChange={set('applyUrl')} required />
      <input placeholder="Source name (e.g. Company careers page)" value={f.sourceName} onChange={set('sourceName')} required />
      <input placeholder="Source link (https://...)" value={f.sourceUrl} onChange={set('sourceUrl')} required />
      <input placeholder="Location (optional)" value={f.location} onChange={set('location')} />
      <input placeholder="Skills, comma separated (optional)" value={f.skills} onChange={set('skills')} />
      <label>Deadline (optional) <input type="date" value={f.deadline} onChange={set('deadline')} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save as draft'}</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
    </form>
  );
}
