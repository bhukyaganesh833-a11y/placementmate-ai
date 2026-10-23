// Development helper: sign in with email + password and return a Firebase ID token.
// Needs FIREBASE_WEB_API_KEY in .env (Firebase console > Project settings > General > Web API Key).
export async function signIn(email, password) {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key) throw new Error('FIREBASE_WEB_API_KEY is missing in backend/.env');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed: ${data?.error?.message || res.status}`);
  return data.idToken;
}
