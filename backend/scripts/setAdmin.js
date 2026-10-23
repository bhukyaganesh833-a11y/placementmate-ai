// Gives (or removes) the admin role for an existing Firebase user.
// Usage:  npm run set-admin -- you@example.com
//         npm run set-admin -- you@example.com --remove
// The role is stored as a Firebase custom claim, which only this server-side script can set.
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../src/config/firebase.js';

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run set-admin -- you@example.com [--remove]');
  process.exit(1);
}

getDb(); // initialises the Firebase Admin app
const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };
  if (flag === '--remove') delete claims.role;
  else claims.role = 'admin';

  await auth.setCustomUserClaims(user.uid, claims);
  console.log(flag === '--remove' ? `Admin role removed from ${email}` : `${email} is now an admin.`);
  console.log('They must sign in again (or refresh their token) for the change to apply.');
  process.exit(0);
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
