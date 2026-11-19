'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { createToken, hashToken, isValidToken } = require('../utils/tokens');
const { sendVerificationEmail, sendResetEmail } = require('../utils/mailer');

const router = express.Router();

const BCRYPT_COST = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST); // keeps login timing similar for unknown emails
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const REQUIRE_VERIFIED = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';

// ---------- rate limiters ----------
const limiterMsg = { error: 'Too many attempts. Please try again later.' };
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: limiterMsg });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: limiterMsg });
const emailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: limiterMsg });

// ---------- validation helpers ----------
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const validEmail = (e) => e.length <= 254 && EMAIL_RE.test(e);
// bcrypt only uses the first 72 bytes, so we reject longer passwords instead of silently cutting them
const passwordError = (p) => {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters';
  if (Buffer.byteLength(p) > 72) return 'Password must be at most 72 bytes';
  return null;
};

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

// remember=true  -> cookie lasts 30 days
// remember=false -> "browser session" cookie (gone when the browser is closed)
function startSession(req, user, remember) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user._id.toString();
      req.session.cookie.maxAge = remember ? REMEMBER_MS : null;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

async function issueVerification(user) {
  const { raw, hash } = createToken();
  user.verifyTokenHash = hash;
  user.verifyTokenExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save();
  await sendVerificationEmail(user, raw);
}

// ---------- POST /register ----------
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const name = str(req.body.name);
    const email = str(req.body.email).toLowerCase();
    const password = req.body.password;

    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Name must be 2-60 characters' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    const pErr = passwordError(password);
    if (pErr) return res.status(400).json({ error: pErr });

    if (await User.exists({ email })) return res.status(409).json({ error: 'This email is already registered' });

    let user;
    try {
      user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, BCRYPT_COST) });
    } catch (err) {
      if (err && err.code === 11000) return res.status(409).json({ error: 'This email is already registered' });
      throw err;
    }

    issueVerification(user).catch((e) => console.error('Verification email failed:', e.message)); // do not block signup
    await startSession(req, user, false);
    res.status(201).json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /login ----------
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = str(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!validEmail(email) || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });

    if (REQUIRE_VERIFIED && !user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email first', code: 'EMAIL_NOT_VERIFIED' });
    }
    await startSession(req, user, req.body.remember === true);
    res.json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /logout ----------
router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('cryptokit.sid');
    res.json({ ok: true });
  });
});

// ---------- GET /me (protected) ----------
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// ---------- GET /verify-email?token=... ----------
router.get('/verify-email', async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!isValidToken(token)) return res.redirect('/?emailVerified=0');
    const user = await User.findOne({ verifyTokenHash: hashToken(token), verifyTokenExpires: { $gt: new Date() } });
    if (!user) return res.redirect('/?emailVerified=0');
    user.emailVerified = true;
    user.verifyTokenHash = undefined; // single-use
    user.verifyTokenExpires = undefined;
    await user.save();
    res.redirect('/?emailVerified=1');
  } catch (err) {
    next(err);
  }
});

// ---------- POST /resend-verification (protected) ----------
router.post('/resend-verification', requireAuth, emailLimiter, async (req, res, next) => {
  try {
    if (!req.user.emailVerified) await issueVerification(req.user);
    res.json({ ok: true, message: 'If your email is not verified yet, a new link has been sent.' });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /forgot-password ----------
router.post('/forgot-password', emailLimiter, async (req, res, next) => {
  try {
    const email = str(req.body.email).toLowerCase();
    const generic = { ok: true, message: 'If that email is registered, a reset link has been sent.' };
    if (!validEmail(email)) return res.json(generic); // same answer: do not reveal if an email exists

    const user = await User.findOne({ email });
    if (user) {
      const { raw, hash } = createToken();
      user.resetTokenHash = hash;
      user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
      await user.save();
      sendResetEmail(user, raw).catch((e) => console.error('Reset email failed:', e.message));
    }
    res.json(generic);
  } catch (err) {
    next(err);
  }
});

// ---------- POST /reset-password ----------
router.post('/reset-password', emailLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const pErr = passwordError(password);
    if (pErr) return res.status(400).json({ error: pErr });
    if (!isValidToken(token)) return res.status(400).json({ error: 'Reset link is invalid or expired' });

    const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Reset link is invalid or expired' });

    user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    user.resetTokenHash = undefined; // single-use
    user.resetTokenExpires = undefined;
    await user.save();

    // log the user out everywhere
    try {
      await mongoose.connection.collection('sessions').deleteMany({ 'session.userId': user._id.toString() });
    } catch (e) {
      console.error('Could not clear old sessions:', e.message);
    }
    res.json({ ok: true, message: 'Password updated. You can log in now.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
