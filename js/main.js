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
});

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
