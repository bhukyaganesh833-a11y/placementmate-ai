import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase.js';

export default function AuthBar() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);

  async function submit(mode) {
    setError('');
    try {
      if (mode === 'signup') await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      setPassword('');
    } catch (e) {
      setError(e.message);
    }
  }

  if (!ready) return null;

  if (user) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        <span>Signed in as {user.email}</span>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password (6+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={() => submit('signin')}>Sign in</button>
      <button onClick={() => submit('signup')}>Sign up</button>
      {error && <span style={{ color: 'crimson' }}>{error}</span>}
    </div>
  );
}
