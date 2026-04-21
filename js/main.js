/* KESTIO — Site Certification Vente-Conseil — JS (v2) */

const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/fabien.comtet@kestio.com';

// Mobile menu toggle + attachement sécurisé des formulaires
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.nav-burger');
  const links = document.querySelector('.nav-links');
  if (burger && links) {
    burger.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // Attache le handler sur tous les formulaires — plus robuste que onsubmit inline
  // Supprime l'éventuel onsubmit HTML pour éviter le double-appel
  document.querySelectorAll('form[data-form-type]').forEach((form) => {
    form.removeAttribute('onsubmit');
    form.addEventListener('submit', handleForm);
  });

  // Pré-remplissage contact.html depuis paramètres URL (inscription à une session)
  prefillInscriptionContext();

  // Chargement dynamique des sessions inter depuis l'API
  loadDynamicSessions();
});

// ================== SESSIONS DYNAMIQUES (depuis /api/sessions) ==================

async function loadDynamicSessions() {
  const tbody = document.querySelector('.sessions-tbl tbody');
  if (!tbody) return;

  const currentParcours = detectParcoursFromPath();
  const showParcoursColumn = !currentParcours;

  try {
    const resp = await fetch('/api/sessions', { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    let sessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (currentParcours) sessions = sessions.filter((s) => s.parcours === currentParcours);

    if (sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${showParcoursColumn ? 5 : 4}" style="text-align:center;padding:28px;color:var(--g500);font-style:italic">Aucune session inter programmée pour le moment. <a href="${contactPath()}" style="color:var(--green);font-weight:600">Contactez-nous</a> pour connaître les prochaines dates.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map((s) => renderSessionRow(s, showParcoursColumn)).join('');
  } catch (err) {
    console.warn('Sessions dynamiques indisponibles, conservation du contenu statique :', err);
    // Fallback : on laisse les lignes statiques existantes
  }
}

function detectParcoursFromPath() {
  const p = window.location.pathname;
  if (p.includes('fondamentaux-vente-conseil')) return 'fondamentaux';
  if (p.includes('posture-relation-client')) return 'posture';
  if (p.includes('vente-complexe')) return 'complexe';
  if (p.includes('vente-augmentee-ia')) return 'ia';
  return null;
}

function contactPath() {
  return window.location.pathname.includes('/formations/') ? '../contact.html' : 'contact.html';
}

function renderSessionRow(s, showParcoursColumn) {
  const url = `${contactPath()}?action=inscription&parcours=${encodeURIComponent(s.parcours)}&dates=${encodeURIComponent(s.dates)}&lieu=${encodeURIComponent(s.lieu)}`;
  const btn = `<a href="${url}" class="btn-bl btn-sm">S'inscrire</a>`;
  const placesLabel = s.places + ' ' + (s.places === 1 ? 'place' : 'places');
  const placesCls = s.places <= 3 ? 'places places-low' : 'places';
  const placesCell = `<span class="${placesCls}">${placesLabel}</span>`;
  if (showParcoursColumn) {
    return `<tr><td><strong>${escapeHtml(labelParcoursPublic(s.parcours))}</strong></td><td>${escapeHtml(s.dates)}</td><td>${escapeHtml(s.lieu)}</td><td>${placesCell}</td><td>${btn}</td></tr>`;
  }
  return `<tr><td><strong>${escapeHtml(s.dates)}</strong></td><td>${escapeHtml(s.lieu)}</td><td>${placesCell}</td><td>${btn}</td></tr>`;
}

function labelParcoursPublic(slug) {
  return (
    {
      fondamentaux: 'Parcours 01 — Fondamentaux de la vente-conseil',
      posture: 'Parcours 02 — Posture & relation client',
      complexe: 'Parcours 03 — Vente complexe',
      ia: 'Parcours 04 — Vente augmentée par l\u2019IA',
    }[slug] || slug
  );
}

function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// FAQ accordion
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
}

// Envoi d'un formulaire via FormSubmit (mode AJAX)
// Appelé par onsubmit="handleForm(event)" dans les formulaires
function handleForm(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const formOk = form.querySelector('[data-form-ok]') || document.getElementById('form-ok');

  const formData = new FormData(form);

  // Honeypot : si rempli, c'est un bot
  if (formData.get('_honey')) return false;

  // Ajout du User-Agent et timestamp pour traçabilité
  formData.append('_submittedAt', new Date().toISOString());

  // Payload JSON pour FormSubmit AJAX
  const payload = {};
  formData.forEach((value, key) => { payload[key] = value; });

  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Envoi en cours…';
  }

  fetch(FORMSUBMIT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(data => {
      if (data.success === 'true' || data.success === true) {
        if (formOk) formOk.style.display = 'block';
        if (btn) btn.style.display = 'none';
        form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
      } else {
        throw new Error(data.message || 'Envoi impossible');
      }
    })
    .catch(err => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      alert("Un problème est survenu lors de l'envoi. Merci de réessayer ou de nous contacter directement à fabien.comtet@kestio.com.");
      console.error('Formulaire KESTIO — erreur :', err);
    });
}

// Helper pour envoyer un payload direct via FormSubmit (utilisé par le diagnostic)
function sendToFormSubmit(payload) {
  return fetch(FORMSUBMIT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());
}

// Pré-remplit le formulaire de contact quand on arrive depuis un bouton "S'inscrire"
function prefillInscriptionContext() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') !== 'inscription') return;

  const parcours = params.get('parcours') || '';
  const dates = params.get('dates') || '';
  const lieu = params.get('lieu') || '';

  const objet = document.getElementById('objet');
  const message = document.getElementById('message');
  if (!objet && !message) return;

  const parcoursLabel = ({
    fondamentaux: 'Fondamentaux de la vente-conseil',
    posture: 'Posture & relation client',
    complexe: 'Vente complexe',
    ia: 'Vente augmentée par l\u2019IA',
    general: 'Certification vente-conseil'
  })[parcours] || parcours;

  if (objet) {
    const label = `Inscription — ${parcoursLabel}${dates ? ' — ' + dates : ''}${lieu ? ' (' + lieu + ')' : ''}`;
    // On ajoute une option si elle n'existe pas
    let opt = Array.from(objet.options).find(o => o.value === 'inscription');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = 'inscription';
      opt.textContent = label;
      objet.appendChild(opt);
    } else {
      opt.textContent = label;
    }
    objet.value = 'inscription';
  }

  if (message && !message.value) {
    const lines = [
      `Bonjour,`,
      ``,
      `Je souhaite m'inscrire à la session suivante :`,
      `- Parcours : ${parcoursLabel}`
    ];
    if (dates) lines.push(`- Dates : ${dates}`);
    if (lieu) lines.push(`- Lieu : ${lieu}`);
    lines.push('', 'Merci de me recontacter pour finaliser mon inscription.', '');
    message.value = lines.join('\n');
  }

  // Bandeau de contexte au-dessus du formulaire
  const form = document.querySelector('form[data-form-type="contact"]');
  if (form && !document.querySelector('.inscription-banner')) {
    const banner = document.createElement('div');
    banner.className = 'inscription-banner';
    banner.style.cssText = 'background:var(--blue-l);border-left:4px solid var(--blue);padding:14px 18px;border-radius:var(--rm);margin-bottom:20px;font-size:14px;color:var(--blue);font-weight:500';
    banner.innerHTML = `\u270f Demande d'inscription pré-remplie : <strong>${parcoursLabel}</strong>${dates ? ' — ' + dates : ''}${lieu ? ' — ' + lieu : ''}. Vérifiez vos coordonnées et validez.`;
    form.parentNode.insertBefore(banner, form);
  }
}
