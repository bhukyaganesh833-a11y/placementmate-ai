import { HttpError } from '../utils/errors.js';

// verifier.verify(idToken) must return the decoded token ({ uid, email, role, ... }) or throw.
// In production it is Firebase Admin's verifyIdToken. Tests pass a fake.
// The role comes from a Firebase *custom claim* that only our server-side script can set,
// so a student cannot become admin by editing frontend code or sending custom requests.
export function createAuth(verifier) {
  function authenticate(req, _res, next) {
    const match = /^Bearer (.+)$/i.exec(req.get('authorization') || '');
    if (!match) return next(new HttpError(401, 'UNAUTHENTICATED', 'Missing bearer token'));

    verifier
      .verify(match[1])
      .then((decoded) => {
        req.user = { uid: decoded.uid, email: decoded.email || null, role: decoded.role || null };
        next();
      })
      .catch(() => next(new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired token')));
  }

  function requireAdmin(req, res, next) {
    authenticate(req, res, (err) => {
      if (err) return next(err);
      if (req.user.role !== 'admin') {
        return next(new HttpError(403, 'FORBIDDEN', 'Admin access required'));
      }
      next();
    });
  }

  return { authenticate, requireAdmin };
}
