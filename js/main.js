/* KESTIO — Site Certification Vente-Conseil — JS */

// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.nav-burger');
  const links = document.querySelector('.nav-links');
  if (burger && links) {
    burger.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }
});

// FAQ accordion
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
}

// Form handler
function handleForm(e) {
  e.preventDefault();
  document.getElementById('form-ok').style.display = 'block';
  e.target.querySelector('button[type="submit"]').style.display = 'none';
}
