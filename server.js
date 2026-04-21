/* KESTIO — Site Certification Vente-Conseil — Serveur Express */

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const db = require('./src/db');
const { runMigrations } = require('./src/migrate');
const { seedInitialAdmin } = require('./src/seed');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname);

// --- Sécurité HTTP (complète nginx côté header) ---
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", 'https://formsubmit.co'],
        'form-action': ["'self'", 'https://formsubmit.co'],
        'frame-ancestors': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);

// --- Middleware globaux ---
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// --- Session stockée en PostgreSQL ---
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error('SESSION_SECRET manquant dans les variables d\'environnement.');
  process.exit(1);
}

app.use(
  session({
    store: new pgSession({ pool: db.pool, tableName: 'sessions', createTableIfMissing: true }),
    name: 'kestio.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 12, // 12 h
    },
  })
);

// --- Rate limit global sur les routes /admin et /api/admin ---
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/admin', adminLimiter);
app.use('/api/admin', adminLimiter);

// --- Routes API publiques (pas de CSRF, JSON uniquement) ---
app.use('/api', apiRoutes);

// --- Routes admin (login, dashboard, CRUD) ---
// CSRF appliqué à l'intérieur du router admin pour ne pas gêner l'API publique
app.use('/admin', authRoutes);
app.use('/admin', adminRoutes);

// --- Fichiers statiques du site public ---
// Placé APRÈS les routes dynamiques pour qu'elles aient priorité
app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (['.css', '.js', '.woff2', '.woff', '.ttf', '.otf', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico', '.gif'].includes(ext)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  })
);

// --- Fallback : essayer $uri.html pour les URL sans extension ---
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/api')) return next();
  const candidate = path.join(PUBLIC_DIR, req.path + '.html');
  return res.sendFile(candidate, (err) => {
    if (err) return next();
  });
});

// --- 404 final ---
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), (err) => {
    if (err) res.type('text/plain').send('404 — Page non trouvée');
  });
});

// --- Démarrage : migrations DB + seed admin initial + écoute ---
(async () => {
  try {
    await runMigrations();
    await seedInitialAdmin();
    app.listen(PORT, () => {
      console.log(`KESTIO admin server on http://localhost:${PORT} (env=${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('Erreur au démarrage :', err);
    process.exit(1);
  }
})();
