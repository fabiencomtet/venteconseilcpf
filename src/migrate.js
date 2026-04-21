/* Migrations PostgreSQL exécutées au démarrage du serveur. Idempotent. */
const db = require('./db');

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sessions_inter (
    id SERIAL PRIMARY KEY,
    parcours TEXT NOT NULL CHECK (parcours IN ('fondamentaux','posture','complexe','ia')),
    dates TEXT NOT NULL,
    date_start DATE,
    lieu TEXT NOT NULL,
    places INTEGER NOT NULL DEFAULT 10,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sessions_parcours_active ON sessions_inter (parcours, active)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_date_start ON sessions_inter (date_start)`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details JSONB,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log (user_id)`,
];

async function runMigrations() {
  for (const sql of MIGRATIONS) {
    await db.query(sql);
  }
  console.log('Migrations PostgreSQL appliquées.');
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Erreur migrations :', err);
      process.exit(1);
    });
}
