'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') }); // always read backend/.env

// Windows/India networks par IPv6 / DNS ki wajah se Atlas timeout hota hai, isliye IPv4 + Google DNS
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) { /* ignore */ }

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const authRoutes = require('./src/routes/auth');

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cryptokit';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('\nSESSION_SECRET is missing or too short (need 32+ characters).');
  console.error('Create backend/.env from .env.example and set SESSION_SECRET.\n');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1); // needed behind Render/Heroku/Nginx for secure cookies

// CSP is off so the existing frontend (inline scripts, CDNs) keeps working. Other helmet protections stay on.
app.use(helmet({ contentSecurityPolicy: false }));

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(','), credentials: true }));
}

app.use(express.json({ limit: '10kb' }));

// Ek hi connection: mongoose ka client session store bhi use karega
const clientPromise = mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000, family: 4 })
  .then((m) => m.connection.getClient());

app.use(
  session({
    name: 'cryptokit.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ clientPromise, collectionName: 'sessions', stringify: false, ttl: 30 * 24 * 60 * 60 }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// ---- API ----
app.use('/api/auth', authRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Small pages/files served by the backend ----
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'views', 'reset-password.html')));
app.use('/_backend', express.static(path.join(__dirname, 'public'))); // /_backend/auth-api.js

// ---- Testing helper: use the backend's new auth.js while the frontend folder is still untouched ----
// Set USE_AUTH_OVERRIDE=true in .env while testing from a separate folder. After you merge the
// frontend and copy frontend-integration/auth.js over auth.js, set it back to false (or delete it).
if (process.env.USE_AUTH_OVERRIDE === 'true') {
  app.get('/auth.js', (req, res) => res.sendFile(path.join(__dirname, 'frontend-integration', 'auth.js')));
}

// ---- Frontend (static files from the repo root after merge) ----
const fs = require('fs');
function findFrontendDir() {
  const hasIndex = (d) => fs.existsSync(path.join(d, 'index.html'));
  if (process.env.FRONTEND_DIR) {
    const wanted = path.resolve(__dirname, process.env.FRONTEND_DIR);
    if (hasIndex(wanted)) return wanted;
    console.warn(`WARNING: FRONTEND_DIR in .env points to "${wanted}" but there is no index.html there. Ignoring it and searching automatically.`);
  }
  // First folder that really contains index.html: the parent of backend/, then the folder npm was started from
  const candidates = [path.resolve(__dirname, '..'), process.cwd(), path.resolve(process.cwd(), '..')];
  return candidates.find(hasIndex) || candidates[0];
}
const FRONTEND_DIR = findFrontendDir();
const HAS_INDEX = fs.existsSync(path.join(FRONTEND_DIR, 'index.html'));
const backendFolder = '/' + path.basename(__dirname).toLowerCase();

app.use((req, res, next) => {
  let p;
  try { p = decodeURIComponent(req.path).toLowerCase(); } catch { return res.status(400).end(); }
  if (
    p === backendFolder || p.startsWith(backendFolder + '/') ||
    p.includes('/.git') || p.includes('node_modules') || p.endsWith('.env')
  ) return res.status(404).end();
  next();
});
app.use(express.static(FRONTEND_DIR, { dotfiles: 'ignore', index: 'index.html' }));
if (!HAS_INDEX) {
  app.get('/', (req, res) => res.status(500).type('text/plain').send(
    'Backend is running, but no index.html was found in:\n  ' + FRONTEND_DIR +
    '\n\nFix: put the backend folder inside the folder that has index.html, or set FRONTEND_DIR in backend/.env.'
  ));
}

// ---- Errors ----
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

clientPromise
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CryptoKit running at http://localhost:${PORT}`);
      console.log(`Serving frontend from: ${FRONTEND_DIR}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
