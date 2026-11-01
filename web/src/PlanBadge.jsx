import { useEffect, useState } from 'react';

export default function PlanBadge({ user }) {
  const [plan, setPlan] = useState('...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken(true);
        const res = await fetch('/api/v1/me', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(json?.error?.code || `Error ${res.status}`);
        if (!cancelled) setPlan(json.data.plan);
      } catch (e) {
        if (!cancelled) setPlan('unknown: ' + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return <span style={{ border: '1px solid #888', borderRadius: 12, padding: '2px 8px' }}>Plan: {plan}</span>;
}
