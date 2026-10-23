# PlacementMate AI — Milestone 1: Foundation + Public Opportunity API

PlacementMate AI is an independent discovery platform for internships, fresher jobs, hackathons and
competitions. It cannot guarantee a job, internship, interview, prize or selection.

## 1. Architecture

```
 React website (Vite)  ─┐
                        ├──►  Express REST API  ──►  Firebase Admin SDK ──►  Cloud Firestore
 Android app (Compose) ─┘     /api/v1/...              (server only)          (all client access
                              validation, rate limit,                         denied by rules)
                              CORS, logging
                                    ▲
                      Milestone 2+: Firebase Auth ID token → server-side role check
```

One backend serves both clients, so listings are always identical. Clients never touch Firestore
directly and never hold secrets.

## 2. Stack choices

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ (ESM) | Same language as the website; built-in test runner and `--env-file` mean fewer dependencies |
| API | Express 4 | Simple, widely documented, fine for a solo developer |
| Validation | Zod | One schema validates input and documents the data model |
| Database | Cloud Firestore | Required by your spec; the free tier suits an MVP (check current quotas before relying on it) |
| Security | helmet, cors (allow-list), express-rate-limit | Baseline hardening |
| Logging | pino + pino-http | Structured JSON logs, auth headers redacted |
| Tests | node:test + supertest | No extra test framework |
| JavaScript, not TypeScript, on the backend | | Fewer build steps for now; Zod gives runtime type safety. The website can use TypeScript in Milestone 3 |

Repository pattern: `OpportunityService` talks to an interface with two implementations,
`FirestoreOpportunityRepository` (real) and `MemoryOpportunityRepository` (tests / no-Firebase dev).

## 3. Folder structure

```
placementmate-ai/
├─ .gitignore
├─ firebase.json
├─ firestore.rules              # deny-all for clients
├─ firestore.indexes.json       # 16 indexes used by the list API
└─ backend/
   ├─ package.json
   ├─ .env.example
   ├─ scripts/seed.js           # loads SAMPLE data (not real listings)
   ├─ src/
   │  ├─ server.js              # entry point
   │  ├─ app.js                 # middleware + routes
   │  ├─ config/{env.js,firebase.js}
   │  ├─ models/{opportunity.js,listQuery.js}
   │  ├─ repositories/{index.js,firestore…,memory…}
   │  ├─ services/opportunityService.js
   │  ├─ routes/opportunities.js
   │  ├─ middleware/errorHandler.js
   │  ├─ utils/errors.js
   │  └─ data/sampleOpportunities.js
   └─ tests/opportunities.test.js
```

## 4. Windows setup

1. Install Node.js LTS (v20 or newer) from nodejs.org. Check: `node -v`.
2. Install Git for Windows and VS Code.
3. Open the project folder in VS Code, then a terminal (PowerShell).

## 5. Run it (no Firebase needed yet)

```powershell
cd placementmate-ai\backend
npm install
copy .env.example .env      # DATA_STORE=memory is already the default
npm run dev                 # loads labelled SAMPLE data into memory
```

Test in a second terminal (PowerShell):

```powershell
Invoke-RestMethod http://localhost:8080/health
Invoke-RestMethod "http://localhost:8080/api/v1/opportunities?type=internship&paid=true"
Invoke-RestMethod "http://localhost:8080/api/v1/opportunities?q=java&sort=deadline&limit=5"
```

Automated tests: `npm test`

## 6. Connect Firestore

1. Go to console.firebase.google.com → Add project (skip Google Analytics for now).
2. Build → Firestore Database → Create database → production mode → choose a region close to India
   (for example `asia-south1`, Mumbai). The location cannot be changed later.
3. Project settings → Service accounts → Generate new private key. Save the JSON to
   `backend\secrets\serviceAccountKey.json`. **Never commit it** (it is git-ignored).
4. Edit `backend\.env`:
   ```
   DATA_STORE=firestore
   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccountKey.json
   FIREBASE_PROJECT_ID=<your project id>
   ```
5. Deploy rules and indexes:
   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase use --add          # pick your project
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   Index building takes a few minutes. Check status in Firestore → Indexes.
6. Load sample data (optional): `npm run seed`, then `npm run dev`.

## 7. API (Milestone 1)

`GET /api/v1/opportunities` — query parameters:

| Param | Meaning |
|---|---|
| `type` | `internship`, `job`, `hackathon`, `competition` |
| `q` | Keyword (whole words from title, organization, skills) |
| `organization`, `location` | Exact match, case-insensitive |
| `skill` | One skill, e.g. `java` |
| `workMode` | `remote`, `hybrid`, `onsite` |
| `paid` | `true` / `false` |
| `sort` | `recent` (default) or `deadline` |
| `limit` | 1–50 (default 20) |
| `cursor` | Value of `page.nextCursor` from the previous response |

Response: `{ "data": [...], "page": { "nextCursor": "…" | null, "count": n } }`
`GET /api/v1/opportunities/:id` → `{ "data": {...} }`. Errors always look like
`{ "error": { "code", "message", "details?" } }`.

Only `published`, non-expired listings appear in the list. Drafts, in-review, rejected and
unpublished listings return 404 on detail.

## 8. Known limitations (deliberate)

- **Not yet tested against a real Firestore project.** The tests run against the in-memory repository,
  which follows the same query plan. Your first Firestore run is the real check; see the checklist.
- **Keyword search is whole-word**, not prefix or fuzzy (Firestore has no full-text search). Typing
  `pyth` will not find "Python". If you need better search later, options are Typesense/Algolia/Meilisearch;
  check their free tiers and terms first.
- Firestore allows one `array-contains` per query. With `q` and `skill` together, the first is filtered
  in the database and the rest on the fetched page, so a page can occasionally contain fewer items than
  `limit`. Keep requesting `nextCursor` until it is `null`.
- Not in Milestone 1: stipend/salary range, qualification, deadline-range and event-date filters. They
  need inequality queries that interact with sorting. They are planned for Milestone 3.
- No write endpoints and no authentication yet. Those arrive in Milestone 2.
- `isExpired` is also computed from the deadline when a document is written. A scheduled expiry job is
  planned for Milestone 2.
- Dates are stored as UTC ISO-8601 strings so sorting is simple and identical on every platform.

## 9. Common errors

| Symptom | Fix |
|---|---|
| `Cannot find module` / `ERR_MODULE_NOT_FOUND` | Run `npm install` inside `backend\` |
| `node --env-file` not recognized | Node is older than 20.6. Upgrade Node |
| `Invalid environment configuration` | Fix the variable named in the message in `.env` |
| `EADDRINUSE :8080` | Something else uses the port. Change `PORT` in `.env` |
| `Could not load the default credentials` | `GOOGLE_APPLICATION_CREDENTIALS` path is wrong, or the JSON file is missing |
| `FAILED_PRECONDITION: The query requires an index` | Run the firebase deploy command in step 6.5, wait for the index to finish building, or open the link in the error message to create the missing one |
| `PERMISSION_DENIED` from Firestore | Check `FIREBASE_PROJECT_ID` matches the key's project |
| Browser CORS error | Add the website origin to `CORS_ORIGINS` (exact, e.g. `http://localhost:5173`) |
| 429 responses | Rate limit (120 requests/minute per IP). Wait a minute |
| PowerShell blocks `firebase` scripts | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |

## 10. Local vs production

- Local: `DATA_STORE=memory` or a Firebase project used for development, `NODE_ENV=development`.
- Production: `NODE_ENV=production` (the app refuses to start unless `DATA_STORE=firestore` and CORS has
  no `*`), credentials supplied as a host secret (`FIREBASE_SERVICE_ACCOUNT_JSON`) rather than a file,
  HTTPS terminated by the host, and a separate Firebase project from development. Hosting is chosen in Milestone 6.

## 11. Milestone 1 checklist

- [ ] `npm install` finishes without errors
- [ ] `npm test` shows 18 passing tests
- [ ] `npm run dev` starts and `/health` returns `{"status":"ok"}`
- [ ] List endpoint returns sample data; filters, `sort=deadline` and `cursor` paging work
- [ ] Detail endpoint returns one listing; an unknown id returns a 404 JSON error
- [ ] Firebase project created, service-account key stored in `secrets\` and not in git
- [ ] `DATA_STORE=firestore`, `npm run seed` succeeds and documents appear in the Firestore console
- [ ] Rules and indexes deployed; the same API calls work against Firestore (report any index errors to me)
- [ ] `git init`, first commit made, and `git status` shows `.env` and `secrets\` are not tracked
