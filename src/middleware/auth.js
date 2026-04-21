/* Middleware d'authentification admin. */

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.accepts('html')) return res.redirect('/admin/login');
  return res.status(401).json({ error: 'Non authentifié' });
}

function requirePasswordCurrent(req, res, next) {
  if (req.session && req.session.mustChangePassword && req.path !== '/change-password' && req.path !== '/logout') {
    if (req.accepts('html')) return res.redirect('/admin/change-password');
    return res.status(403).json({ error: 'Changement de mot de passe requis' });
  }
  return next();
}

module.exports = { requireAuth, requirePasswordCurrent };
