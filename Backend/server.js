// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');   // 👈 necesario para servir el build
const fs = require('fs');       // 👈 opcional: verificar existencia del build

const app = express();

// ===== Middlewares base =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Log global de todas las requests (para ver qué está llegando)
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.originalUrl}`);
  next();
});

// Soporte extra por si algún cliente manda text/plain con JSON
app.use((req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct === 'text/plain;charset=utf-8' || ct === 'text/plain') {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        req.body = JSON.parse(data);
        console.log('✅ Parsed text/plain as JSON:', req.body);
      } catch (e) {
        console.error('❌ Failed to parse text/plain:', e.message);
      }
      next();
    });
  } else {
    next();
  }
});

// ===== Rutas API =====
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/usuarios',    require('./routes/usuarios'));
app.use('/api/catalogos',   require('./routes/catalogos'));
app.use('/api/reservas',    require('./routes/reservas'));
app.use('/api/tarifas',     require('./routes/tarifas'));
app.use('/api/pagos',       require('./routes/pagos'));
app.use('/api/pagos',       require('./routes/registrarPago')); // (si quieres, cámbialo a '/api/registrar-pago')
app.use('/api/reportes',    require('./routes/reportes'));
app.use('/api/solicitante', require('./routes/solicitante'));
app.use('/api/permisos',    require('./routes/permisos'));

// ===== Utilidades =====
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));


// ===== Servir React (build) =====
// ruta a: Backend/../Frontend/front-react/build
const clientBuildPath = path.join(__dirname, '../Frontend/front-react/build');

if (fs.existsSync(clientBuildPath)) {
  // Archivos estáticos
  app.use(express.static(clientBuildPath));

  // Fallback SPA: cualquier ruta que NO empiece con /api la atiende React
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  console.warn('⚠️  No se encontró el build del frontend en:', clientBuildPath);
  console.warn('    Ejecuta: npm run front:build (desde Backend/)');
}

// ===== 404 SOLO para /api (al final) =====
app.use('/api', (req, res) => {
  console.warn(`⚠️  404 en ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Ruta no encontrada', path: req.originalUrl });
});

// ===== Error global =====
app.use((err, _req, res, _next) => {
  console.error('🔥 Error no controlado:', err);
  res.status(500).json({ error: 'Error interno', detail: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
