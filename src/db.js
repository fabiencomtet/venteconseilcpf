/* Pool PostgreSQL partagé pour l'ensemble de l'app. */
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL || process.env.SCALINGO_POSTGRESQL_URL;

if (!connectionString) {
  console.error('Variable DATABASE_URL / SCALINGO_POSTGRESQL_URL manquante.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Erreur PostgreSQL pool :', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
