/* Routes d'authentification : login, logout, change-password. */
const express = require('express');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');

const db = require('../db');
const { render } = require('../utils/render');
const { verifyPassword, hashPassword, validatePassword } = require('../utils/password');
const { logActivity } = require('../utils/log');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const csrfProtection = csrf({ cookie: false });

// Rate limit anti-brute-force sur /admin/login (POST)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans une minute.' },
});

// --- GET /admin/login ---
router.get('/login', csrfProtection, (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/admin');
  res.type('html').send(
    render('login', {
      csrfToken: req.csrfToken(),
      error: req.query.error || '',
    })
  );
});

// --- POST /admin/login ---
router.post('/login', loginLimiter, csrfProtection, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.redirect('/admin/login?error=' + encodeURIComponent('Email et mot de passe requis.'));
  }

  try {
    const { rows } = await db.query(
      'SELECT id, email, password_hash, display_name, must_change_password, is_active FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      await logActivity({ userId: null, action: 'login_failed', details: { email, reason: 'unknown_user' }, req });
      return res.redirect('/admin/login?error=' + encodeURIComponent('Identifiants invalides.'));
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await logActivity({ userId: user.id, action: 'login_failed', details: { reason: 'wrong_password' }, req });
      return res.redirect('/admin/login?error=' + encodeURIComponent('Identifiants invalides.'));
    }

    // Régénère la session pour éviter la fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).send('Erreur de session.');
      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.displayName = user.display_name;
      req.session.mustChangePassword = user.must_change_password;

      db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
      logActivity({ userId: user.id, action: 'login_success', req });

      if (user.must_change_password) return res.redirect('/admin/change-password');
      return res.redirect('/admin');
    });
  } catch (err) {
    console.error('POST /admin/login error :', err);
    res.status(500).send('Erreur serveur.');
  }
});

// --- POST /admin/logout ---
router.post('/logout', csrfProtection, (req, res) => {
  const userId = req.session?.userId;
  req.session.destroy(() => {
    res.clearCookie('kestio.sid');
    if (userId) logActivity({ userId, action: 'logout', req });
    res.redirect('/admin/login');
  });
});

// --- GET /admin/change-password ---
router.get('/change-password', requireAuth, csrfProtection, (req, res) => {
  const forcedHtml = req.session.mustChangePassword
    ? '<div class="admin-flash admin-flash-warn"><strong>Changement obligatoire</strong> — c\'est votre première connexion ou un administrateur a réinitialisé votre mot de passe. Merci de choisir un nouveau mot de passe avant de continuer.</div>'
    : '';
  res.type('html').send(
    render('change-password', {
      csrfToken: req.csrfToken(),
      email: req.session.email,
      displayName: req.session.displayName || '',
      forced_html: forcedHtml,
      error: req.query.error || '',
    })
  );
});

// --- POST /admin/change-password ---
router.post('/change-password', requireAuth, csrfProtection, async (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  const confirm = String(req.body.confirm_password || '');

  if (next !== confirm) {
    return res.redirect('/admin/change-password?error=' + encodeURIComponent('Les deux mots de passe ne correspondent pas.'));
  }
  const err = validatePassword(next);
  if (err) return res.redirect('/admin/change-password?error=' + encodeURIComponent(err));

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    const user = rows[0];
    if (!user) return res.redirect('/admin/login');

    const ok = await verifyPassword(current, user.password_hash);
    if (!ok) {
      return res.redirect('/admin/change-password?error=' + encodeURIComponent('Mot de passe actuel incorrect.'));
    }

    const newHash = await hashPassword(next);
    await db.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newHash, req.session.userId]
    );
    req.session.mustChangePassword = false;
    await logActivity({ userId: req.session.userId, action: 'password_changed', req });

    res.redirect('/admin?notice=' + encodeURIComponent('Mot de passe mis à jour.'));
  } catch (err) {
    console.error('POST /admin/change-password error :', err);
    res.status(500).send('Erreur serveur.');
  }
});

module.exports = router;
