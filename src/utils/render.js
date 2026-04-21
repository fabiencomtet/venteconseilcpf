/* Rendu minimaliste de templates HTML.
 * Syntaxe : {{key}} échappé, {{{key}}} brut. Ajoute auto les helpers flash_html. */
const fs = require('fs');
const path = require('path');

const VIEWS_DIR = path.join(__dirname, '..', '..', 'views');
const cache = new Map();

function loadTemplate(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(VIEWS_DIR, `${name}.html`);
  const content = fs.readFileSync(file, 'utf8');
  if (process.env.NODE_ENV === 'production') cache.set(name, content);
  return content;
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

function flashBlock(message, type) {
  if (!message) return '';
  const cls = type === 'error' ? 'admin-flash-error' : 'admin-flash-ok';
  return `<div class="admin-flash ${cls}">${escapeHtml(message)}</div>`;
}

function render(name, data = {}) {
  // Helpers auto-générés pour les messages courants
  const ctx = { ...data };
  if (ctx.error !== undefined) ctx.error_html = flashBlock(ctx.error, 'error');
  if (ctx.notice !== undefined) ctx.notice_html = flashBlock(ctx.notice, 'notice');

  let html = loadTemplate(name);
  // Brut : {{{key}}} — traité en premier pour éviter que la regex échappée ne matche
  html = html.replace(/\{\{\{([a-zA-Z0-9_.]+)\}\}\}/g, (_m, key) => {
    const v = ctx[key];
    return v === null || v === undefined ? '' : String(v);
  });
  // Échappé : {{key}}
  html = html.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_m, key) => escapeHtml(ctx[key]));
  return html;
}

module.exports = { render, escapeHtml, flashBlock };
