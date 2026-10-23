import { getAuth } from 'firebase-admin/auth';

// Production verifier. Requires the Firebase Admin app to be initialised
// (the Firestore repository does that on startup).
// checkRevoked=true also rejects tokens of disabled or signed-out-everywhere users.
export function createFirebaseAuthVerifier() {
  return {
    verify: (idToken) => getAuth().verifyIdToken(idToken, true),
  };
}
