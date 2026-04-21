/* API publique : expose les sessions inter actives (pour le site public). */
const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/sessions', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, parcours, dates, date_start, lieu, places
       FROM sessions_inter
       WHERE active = true AND (date_start IS NULL OR date_start >= CURRENT_DATE - INTERVAL '1 day')
       ORDER BY date_start NULLS LAST, id`
    );
    res.set('Cache-Control', 'public, max-age=300'); // 5 min
    res.json({ sessions: rows });
  } catch (err) {
    console.error('GET /api/sessions error :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
