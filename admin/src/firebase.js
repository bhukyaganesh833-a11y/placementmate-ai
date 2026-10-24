import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const app = initializeApp({
  apiKey: 'AIzaSyA36t-jkg8ajfafkV6_2YOHKH4Bp3FWCpM',
  authDomain: 'placementmate-ai.firebaseapp.com',
  projectId: 'placementmate-ai',
  storageBucket: 'placementmate-ai.firebasestorage.app',
  messagingSenderId: '1041714024948',
  appId: '1:1041714024948:web:2183b6e8aeaa11b9e2e9a1',
});

export const auth = getAuth(app);
export const API_BASE = '';