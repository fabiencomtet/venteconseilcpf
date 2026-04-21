/* Création de l'admin initial au premier démarrage si la table users est vide. */
const bcrypt = require('bcrypt');
const db = require('./db');

const INITIAL_ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || 'fabien.comtet@kestio.com';
const INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'password123';

async function seedInitialAdmin() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return;

  const hash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 12);
  await db.query(
    `INSERT INTO users (email, password_hash, display_name, must_change_password)
     VALUES ($1, $2, $3, true)`,
    [INITIAL_ADMIN_EMAIL.toLowerCase(), hash, 'Fabien Comtet']
  );
  console.log(`Admin initial créé : ${INITIAL_ADMIN_EMAIL} (changement du mot de passe exigé au premier login).`);
}

module.exports = { seedInitialAdmin };

if (require.main === module) {
  seedInitialAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Erreur seed :', err);
      process.exit(1);
    });
}
