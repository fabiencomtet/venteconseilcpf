/* Routes admin protégées : dashboard, CRUD sessions, gestion utilisateurs. */
const express = require('express');
const csrf = require('csurf');

const db = require('../db');
const { render } = require('../utils/render');
const { requireAuth, requirePasswordCurrent } = require('../middleware/auth');
const { hashPassword, validatePassword, generatePassword } = require('../utils/password');
const { logActivity } = require('../utils/log');

const router = express.Router();
const csrfProtection = csrf({ cookie: false });

// Toutes ces routes exigent une session active et un mot de passe à jour
router.use(requireAuth);
router.use(requirePasswordCurrent);

// --- GET /admin — dashboard (sessions par défaut) ---
router.get('/', (req, res) => {
  res.redirect('/admin/sessions');
});

// ============== SESSIONS INTER ==============

router.get('/sessions', csrfProtection, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id, s.parcours, s.dates, s.date_start, s.lieu, s.places, s.active, s.updated_at,
              u.email AS updated_by_email
       FROM sessions_inter s
       LEFT JOIN users u ON u.id = s.updated_by_id
       ORDER BY s.active DESC, s.date_start NULLS LAST, s.id DESC`
    );
    const rowsHtml = rows
      .map((r) => {
        const badge = r.active
          ? '<span class="badge badge-on">Active</span>'
          : '<span class="badge badge-off">Archivée</span>';
        return `<tr>
          <td>${escapeHtml(labelParcours(r.parcours))}</td>
          <td>${escapeHtml(r.dates)}</td>
          <td>${escapeHtml(r.lieu)}</td>
          <td style="text-align:center">${r.places}</td>
          <td>${badge}</td>
          <td class="tr-actions">
            <a href="/admin/sessions/${r.id}/edit" class="btn-sm btn-edit">Modifier</a>
            <form method="POST" action="/admin/sessions/${r.id}/toggle" class="inline-form">
              <input type="hidden" name="_csrf" value="${req.csrfToken()}">
              <button type="submit" class="btn-sm btn-toggle">${r.active ? 'Archiver' : 'Réactiver'}</button>
            </form>
          </td>
        </tr>`;
      })
      .join('');

    res.type('html').send(
      render('sessions', {
        csrfToken: req.csrfToken(),
        email: req.session.email,
        displayName: req.session.displayName || req.session.email,
        notice: req.query.notice || '',
        error: req.query.error || '',
        rowsHtml_raw: rowsHtml,
      })
    );
  } catch (err) {
    console.error('GET /admin/sessions error :', err);
    res.status(500).send('Erreur serveur.');
  }
});

router.get('/sessions/new', csrfProtection, (req, res) => {
  res.type('html').send(
    render('session-form', {
      csrfToken: req.csrfToken(),
      email: req.session.email,
      displayName: req.session.displayName || req.session.email,
      title: 'Nouvelle session inter',
      action: '/admin/sessions',
      submitLabel: 'Créer la session',
      ...selectionsForParcours('fondamentaux'),
      dates: '',
      date_start: '',
      lieu: '',
      places: '10',
      active_checked: 'checked',
      error: req.query.error || '',
    })
  );
});

router.post('/sessions', csrfProtection, async (req, res) => {
  const data = parseSessionBody(req.body);
  const err = validateSession(data);
  if (err) return res.redirect('/admin/sessions/new?error=' + encodeURIComponent(err));
  try {
    const { rows } = await db.query(
      `INSERT INTO sessions_inter (parcours, dates, date_start, lieu, places, active, created_by_id, updated_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
      [data.parcours, data.dates, data.date_start, data.lieu, data.places, data.active, req.session.userId]
    );
    await logActivity({ userId: req.session.userId, action: 'session_created', targetType: 'session_inter', targetId: rows[0].id, details: data, req });
    res.redirect('/admin/sessions?notice=' + encodeURIComponent('Session créée.'));
  } catch (err2) {
    console.error('POST /admin/sessions error :', err2);
    res.redirect('/admin/sessions/new?error=' + encodeURIComponent('Erreur à la création.'));
  }
});

router.get('/sessions/:id/edit', csrfProtection, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM sessions_inter WHERE id = $1', [req.params.id]);
    const s = rows[0];
    if (!s) return res.redirect('/admin/sessions?error=' + encodeURIComponent('Session introuvable.'));
    res.type('html').send(
      render('session-form', {
        csrfToken: req.csrfToken(),
        email: req.session.email,
        displayName: req.session.displayName || req.session.email,
        title: `Modifier la session #${s.id}`,
        action: `/admin/sessions/${s.id}`,
        submitLabel: 'Enregistrer',
        ...selectionsForParcours(s.parcours),
        dates: s.dates,
        date_start: s.date_start ? s.date_start.toISOString().slice(0, 10) : '',
        lieu: s.lieu,
        places: s.places,
        active_checked: s.active ? 'checked' : '',
        error: req.query.error || '',
      })
    );
  } catch (err) {
    console.error('GET /admin/sessions/:id/edit error :', err);
    res.redirect('/admin/sessions?error=' + encodeURIComponent('Erreur de chargement.'));
  }
});

router.post('/sessions/:id', csrfProtection, async (req, res) => {
  const data = parseSessionBody(req.body);
  const err = validateSession(data);
  if (err) return res.redirect(`/admin/sessions/${req.params.id}/edit?error=` + encodeURIComponent(err));
  try {
    await db.query(
      `UPDATE sessions_inter
       SET parcours=$1, dates=$2, date_start=$3, lieu=$4, places=$5, active=$6, updated_by_id=$7, updated_at=NOW()
       WHERE id=$8`,
      [data.parcours, data.dates, data.date_start, data.lieu, data.places, data.active, req.session.userId, req.params.id]
    );
    await logActivity({ userId: req.session.userId, action: 'session_updated', targetType: 'session_inter', targetId: +req.params.id, details: data, req });
    res.redirect('/admin/sessions?notice=' + encodeURIComponent('Session mise à jour.'));
  } catch (err2) {
    console.error('POST /admin/sessions/:id error :', err2);
    res.redirect(`/admin/sessions/${req.params.id}/edit?error=` + encodeURIComponent('Erreur à la mise à jour.'));
  }
});

router.post('/sessions/:id/toggle', csrfProtection, async (req, res) => {
  try {
    await db.query(
      'UPDATE sessions_inter SET active = NOT active, updated_by_id=$1, updated_at=NOW() WHERE id=$2',
      [req.session.userId, req.params.id]
    );
    await logActivity({ userId: req.session.userId, action: 'session_toggled', targetType: 'session_inter', targetId: +req.params.id, req });
    res.redirect('/admin/sessions?notice=' + encodeURIComponent('Statut modifié.'));
  } catch (err) {
    console.error('POST /admin/sessions/:id/toggle error :', err);
    res.redirect('/admin/sessions?error=' + encodeURIComponent('Erreur.'));
  }
});

// ============== UTILISATEURS ==============

router.get('/users', csrfProtection, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.display_name, u.is_active, u.must_change_password,
              u.created_at, u.last_login_at, c.email AS created_by_email
       FROM users u
       LEFT JOIN users c ON c.id = u.created_by_id
       ORDER BY u.created_at DESC`
    );
    const rowsHtml = rows
      .map((u) => {
        const status = u.is_active ? '<span class="badge badge-on">Actif</span>' : '<span class="badge badge-off">Désactivé</span>';
        const mustChange = u.must_change_password ? ' <span class="badge badge-warn">Changement requis</span>' : '';
        const last = u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-FR') : '—';
        const self = u.id === req.session.userId;
        return `<tr>
          <td>${escapeHtml(u.email)}${self ? ' <em style="color:var(--g500)">(vous)</em>' : ''}</td>
          <td>${escapeHtml(u.display_name || '')}</td>
          <td>${status}${mustChange}</td>
          <td style="font-size:12px;color:var(--g500)">${last}</td>
          <td class="tr-actions">
            ${self ? '' : `<form method="POST" action="/admin/users/${u.id}/reset-password" class="inline-form"><input type="hidden" name="_csrf" value="${req.csrfToken()}"><button type="submit" class="btn-sm btn-reset" onclick="return confirm('Générer un nouveau mot de passe pour ${escapeHtml(u.email)} ?')">Réinitialiser</button></form>`}
            ${self ? '' : `<form method="POST" action="/admin/users/${u.id}/toggle" class="inline-form"><input type="hidden" name="_csrf" value="${req.csrfToken()}"><button type="submit" class="btn-sm btn-toggle">${u.is_active ? 'Désactiver' : 'Réactiver'}</button></form>`}
          </td>
        </tr>`;
      })
      .join('');

    const generatedHtml = req.query.pwd && req.query.for
      ? `<div class="admin-flash admin-flash-generated">
          <strong>Mot de passe généré pour ${escapeHtml(req.query.for)}</strong><br>
          <code>${escapeHtml(req.query.pwd)}</code>
          <p class="admin-flash-hint">Copiez-le et transmettez-le en main propre. Il ne s'affichera plus.</p>
        </div>`
      : '';

    res.type('html').send(
      render('users', {
        csrfToken: req.csrfToken(),
        email: req.session.email,
        displayName: req.session.displayName || req.session.email,
        notice: req.query.notice || '',
        error: req.query.error || '',
        generated_html: generatedHtml,
        rowsHtml_raw: rowsHtml,
      })
    );
  } catch (err) {
    console.error('GET /admin/users error :', err);
    res.status(500).send('Erreur serveur.');
  }
});

router.post('/users', csrfProtection, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.display_name || '').trim();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Email invalide.'));
  }
  try {
    const { rows: existing } = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.length) return res.redirect('/admin/users?error=' + encodeURIComponent('Cet email existe déjà.'));

    const pwd = generatePassword(14);
    const hash = await hashPassword(pwd);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, display_name, must_change_password, created_by_id)
       VALUES ($1,$2,$3,true,$4) RETURNING id`,
      [email, hash, name || null, req.session.userId]
    );
    await logActivity({ userId: req.session.userId, action: 'user_invited', targetType: 'user', targetId: rows[0].id, details: { email }, req });
    return res.redirect('/admin/users?notice=' + encodeURIComponent('Utilisateur créé — communiquez-lui le mot de passe ci-contre.') + '&pwd=' + encodeURIComponent(pwd) + '&for=' + encodeURIComponent(email));
  } catch (err) {
    console.error('POST /admin/users error :', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Erreur à la création.'));
  }
});

router.post('/users/:id/reset-password', csrfProtection, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT email FROM users WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.redirect('/admin/users?error=' + encodeURIComponent('Utilisateur introuvable.'));
    if (+req.params.id === req.session.userId) return res.redirect('/admin/users?error=' + encodeURIComponent('Utilisez la page "Changer mon mot de passe" pour votre propre compte.'));

    const pwd = generatePassword(14);
    const hash = await hashPassword(pwd);
    await db.query('UPDATE users SET password_hash=$1, must_change_password=true WHERE id=$2', [hash, req.params.id]);
    await logActivity({ userId: req.session.userId, action: 'user_password_reset', targetType: 'user', targetId: +req.params.id, req });
    return res.redirect('/admin/users?notice=' + encodeURIComponent('Mot de passe réinitialisé.') + '&pwd=' + encodeURIComponent(pwd) + '&for=' + encodeURIComponent(rows[0].email));
  } catch (err) {
    console.error('POST /admin/users/:id/reset-password error :', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Erreur.'));
  }
});

router.post('/users/:id/toggle', csrfProtection, async (req, res) => {
  try {
    if (+req.params.id === req.session.userId) return res.redirect('/admin/users?error=' + encodeURIComponent('Vous ne pouvez pas désactiver votre propre compte.'));
    await db.query('UPDATE users SET is_active = NOT is_active WHERE id=$1', [req.params.id]);
    await logActivity({ userId: req.session.userId, action: 'user_toggled', targetType: 'user', targetId: +req.params.id, req });
    res.redirect('/admin/users?notice=' + encodeURIComponent('Statut mis à jour.'));
  } catch (err) {
    console.error('POST /admin/users/:id/toggle error :', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Erreur.'));
  }
});

// ============== ACTIVITÉ ==============

router.get('/activity', csrfProtection, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.ip, a.created_at,
              u.email AS user_email
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    const rowsHtml = rows
      .map(
        (r) => `<tr>
          <td style="font-size:12px;color:var(--g500);white-space:nowrap">${new Date(r.created_at).toLocaleString('fr-FR')}</td>
          <td>${escapeHtml(r.user_email || '—')}</td>
          <td><code>${escapeHtml(r.action)}</code></td>
          <td style="font-size:12px">${escapeHtml(r.target_type || '')}${r.target_id ? ' #' + r.target_id : ''}</td>
          <td style="font-size:11px;color:var(--g500);font-family:monospace;max-width:280px;overflow:hidden;text-overflow:ellipsis">${r.details ? escapeHtml(JSON.stringify(r.details)) : ''}</td>
        </tr>`
      )
      .join('');

    res.type('html').send(
      render('activity', {
        csrfToken: req.csrfToken(),
        email: req.session.email,
        displayName: req.session.displayName || req.session.email,
        rowsHtml_raw: rowsHtml,
      })
    );
  } catch (err) {
    console.error('GET /admin/activity error :', err);
    res.status(500).send('Erreur serveur.');
  }
});

// ============== HELPERS ==============

function parseSessionBody(body) {
  return {
    parcours: String(body.parcours || '').toLowerCase(),
    dates: String(body.dates || '').trim(),
    date_start: body.date_start ? String(body.date_start) : null,
    lieu: String(body.lieu || '').trim(),
    places: Math.max(0, parseInt(body.places, 10) || 0),
    active: body.active === 'on' || body.active === 'true' || body.active === true,
  };
}

function validateSession(data) {
  if (!['fondamentaux', 'posture', 'complexe', 'ia'].includes(data.parcours)) return 'Parcours invalide.';
  if (!data.dates) return 'Dates requises.';
  if (!data.lieu) return 'Lieu requis.';
  if (data.places < 0) return 'Nombre de places invalide.';
  return null;
}

function labelParcours(slug) {
  return (
    {
      fondamentaux: 'Fondamentaux de la vente-conseil',
      posture: 'Posture & relation client',
      complexe: 'Vente complexe',
      ia: 'Vente augmentée par l\u2019IA',
    }[slug] || slug
  );
}

function selectionsForParcours(selected) {
  return {
    parcours_sel_fondamentaux: selected === 'fondamentaux' ? 'selected' : '',
    parcours_sel_posture: selected === 'posture' ? 'selected' : '',
    parcours_sel_complexe: selected === 'complexe' ? 'selected' : '',
    parcours_sel_ia: selected === 'ia' ? 'selected' : '',
  };
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;
