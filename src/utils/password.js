/* Utilitaires mot de passe : validation + génération. */
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const MIN_LENGTH = 10;

function validatePassword(password) {
  if (typeof password !== 'string') return 'Mot de passe invalide.';
  if (password.length < MIN_LENGTH) return `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`;
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit comporter au moins une majuscule.';
  if (!/[a-z]/.test(password)) return 'Le mot de passe doit comporter au moins une minuscule.';
  if (!/[0-9]/.test(password)) return 'Le mot de passe doit comporter au moins un chiffre.';
  return null;
}

function generatePassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { validatePassword, generatePassword, hashPassword, verifyPassword, MIN_LENGTH };
