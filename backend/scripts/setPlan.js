// Sets the plan (free or premium) for an existing Firebase user.
// Usage:  node --env-file=.env scripts/setPlan.js you@example.com premium
//         node --env-file=.env scripts/setPlan.js you@example.com free
// The plan is a Firebase custom claim that only this server-side script (and later the
// verified payment flow) can set, so students cannot upgrade themselves from the browser.
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../src/config/firebase.js';

const [email, plan] = process.argv.slice(2);
if (!email || !['free', 'premium'].includes(plan)) {
  console.error('Usage: node --env-file=.env scripts/setPlan.js you@example.com free|premium');
  process.exit(1);
}

getDb(); // initialises the Firebase Admin app
const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}), plan };
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`${email} is now on the ${plan} plan.`);
  console.log('They must sign in again (or refresh their token) for the change to apply.');
  process.exit(0);
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
