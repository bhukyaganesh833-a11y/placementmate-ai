// Inserts SAMPLE listings into the configured store (use DATA_STORE=firestore to write to Firestore).
// Sample data is not real. Delete it before launch.
import { createOpportunityRepository } from '../src/repositories/index.js';
import { seedSampleOpportunities } from '../src/data/sampleOpportunities.js';

const repo = await createOpportunityRepository();
const created = await seedSampleOpportunities(repo);
for (const c of created) console.log('created', c.id, c.title);
console.log('Done.');
process.exit(0);
