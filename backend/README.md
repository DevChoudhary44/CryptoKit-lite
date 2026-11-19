# CryptoKit backend (Node.js + Express + MongoDB)

Everything lives inside this `backend/` folder, so it never conflicts with frontend files when you merge.

## Run it
```powershell
cd backend
npm install
copy .env.example .env      # then open .env and set SESSION_SECRET (and MONGODB_URI if not local)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste the output as SESSION_SECRET
npm start
```
Open http://localhost:3000 (NOT Live Server / double-click). The backend serves your frontend files from the repo root.

## Endpoints
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register | `{name,email,password}` |
| POST | /api/auth/login | `{email,password}` |
| POST | /api/auth/logout | destroys session |
| GET | /api/auth/me | protected |
| GET | /api/auth/verify-email?token= | link from email |
| POST | /api/auth/resend-verification | protected |
| POST | /api/auth/forgot-password | `{email}` |
| POST | /api/auth/reset-password | `{token,password}`; page at /reset-password |

## Local workflow (nothing is pushed)
- Your original folder stays on the `frontend` branch and is never touched.
- A second folder (a git "worktree") is checked out on the `backend` branch. All backend work happens there.
- In that second folder's `backend/.env` set:
  `FRONTEND_DIR=D:\Crypto-toolkit` (path of the frontend folder) and `USE_AUTH_OVERRIDE=true`.
  The server then serves your frontend files plus the new `frontend-integration/auth.js`, without changing the frontend branch.

## Final connect (when backend works locally, still no push)
In the backend folder, on the `backend` branch:
```powershell
git merge frontend
copy backend\frontend-integration\auth.js auth.js     # replaces the old auth.js
```
Remove `FRONTEND_DIR` and `USE_AUTH_OVERRIDE` from `.env`, run `npm start` again, test, then commit.

## Tests
Start the server, then `npm test` (set `RUN_RATE_LIMIT_TEST=1` for the limiter test).

## Notes
- Passwords: bcrypt (cost 12). Sessions: HTTP-only cookie stored in MongoDB; "Remember me" = 30 days, otherwise until the browser closes.
- Set `REQUIRE_EMAIL_VERIFICATION=true` once SMTP is configured. Without SMTP, email links print in the terminal.
- In production set `NODE_ENV=production`, use HTTPS, and set `APP_URL` to your real domain.
- Tool inputs (hashes, Base64, etc.) are never sent to the backend.
