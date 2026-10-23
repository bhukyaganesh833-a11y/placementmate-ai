import { config } from '../config/env.js';
import { MemoryOpportunityRepository } from './memoryOpportunityRepository.js';

export async function createOpportunityRepository() {
  if (config.DATA_STORE === 'firestore') {
    const [{ getDb }, { FirestoreOpportunityRepository }] = await Promise.all([
      import('../config/firebase.js'),
      import('./firestoreOpportunityRepository.js'),
    ]);
    return new FirestoreOpportunityRepository(getDb());
  }
  return new MemoryOpportunityRepository();
}
