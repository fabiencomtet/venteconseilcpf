/* Helper pour écrire une ligne dans activity_log. */
const db = require('../db');

async function logActivity({ userId, action, targetType = null, targetId = null, details = null, req = null }) {
  try {
    const ip = req ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip) : null;
    await db.query(
      `INSERT INTO activity_log (user_id, action, target_type, target_id, details, ip)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [userId, action, targetType, targetId, details ? JSON.stringify(details) : null, ip]
    );
  } catch (err) {
    console.error('Impossible d\'écrire activity_log :', err);
  }
}

module.exports = { logActivity };
