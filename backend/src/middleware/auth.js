'use strict';
const User = require('../models/User');

// Use on any route that needs a logged-in user:  router.get('/x', requireAuth, handler)
async function requireAuth(req, res, next) {
  try {
    const id = req.session && req.session.userId;
    if (!id) return res.status(401).json({ error: 'Not logged in' });
    const user = await User.findById(id);
    if (!user) {
      return req.session.destroy(() => res.status(401).json({ error: 'Not logged in' }));
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
