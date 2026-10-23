// Prints a Firebase ID token (valid ~1 hour) for testing admin endpoints.
// Usage: node --env-file=.env scripts/devLogin.js admin@example.com YourPassword
// Treat the token like a password: do not share it or commit it.
import { signIn } from './lib/signIn.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node --env-file=.env scripts/devLogin.js <email> <password>');
  process.exit(1);
}

try {
  console.log(await signIn(email, password));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
