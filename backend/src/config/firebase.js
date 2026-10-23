import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from './env.js';

// Server-only. The Admin SDK bypasses Firestore security rules, so never ship
// these credentials to the website or the Android app.
export function getDb() {
  if (!getApps().length) {
    const json = config.FIREBASE_SERVICE_ACCOUNT_JSON;
    initializeApp({
      credential: json ? cert(JSON.parse(json)) : applicationDefault(),
      projectId: config.FIREBASE_PROJECT_ID,
    });
  }
  return getFirestore();
}
