// backend/routes/permisos.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const router = express.Router();

// === Pool a Postgres (solo para consultar rol del usuario) ===
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
});

// === Archivo de persistencia (no toca la BD) ===
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'permisos.json');

// IDs válidos (mantener en sync con tu FRONT)
const ALL_IDS = [
  // reservas
  'reservas','reservas.crear','reservas.listado','reservas.historial','reservas.calendario','reservas.aprobacion',
  // espacios
  'espacios','espacios.crear-espacio','espacios.crear-mueble','espacios.listado-espacios','espacios.listado-muebles','espacios.disponibilidad',
  // pagos
  'pagos','pagos.config','pagos.registrar','pagos.historial','pagos.reporte',
  // usuarios
  'usuarios','usuarios.listado','usuarios.crear','usuarios.permisos',
  // reportes
  'reportes','reportes.uso','reportes.usuarios','reportes.dashboard',
  // config
  'config','config.institucion','config.parametros','config.horarios','config.seguridad','config.backup',
];

// Defaults por rol (puedes ajustarlo a tu gusto)
const DEFAULTS_ROL = {
  // 1 = Administrador (todo)
  1: ALL_IDS,
  // 2 = Gestor
  2: [
    'reservas','reservas.crear','reservas.listado','reservas.historial','reservas.calendario','reservas.aprobacion',
    'espacios','espacios.listado-espacios','espacios.listado-muebles','espacios.disponibilidad',
    'pagos','pagos.registrar','pagos.historial',
    'reportes','reportes.uso','reportes.usuarios',
  ],
  // 3 = Aprobador
  3: [
    'reservas','reservas.listado','reservas.historial','reservas.aprobacion',
    'reportes','reportes.uso',
  ],
  // 5 = Recepción
  5: [
    'reservas','reservas.crear','reservas.listado','reservas.calendario',
  ],
  // 6 = Usuario
  6: [
    'reservas','reservas.listado','reservas.calendario',
  ],
};

// Helpers de persistencia
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ roles: {}, usuarios: {} }, null, 2));
  }
}
function readData() {
  ensureData();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}
function writeData(obj) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

// Valida y limpia permisos contra ALL_IDS
function cleanPerms(perms) {
  if (!Array.isArray(perms)) return [];
  const set = new Set();
  for (const p of perms) {
    if (typeof p === 'string' && ALL_IDS.includes(p)) set.add(p);
  }
  return Array.from(set);
}

// === GET permisos por rol ===
router.get('/rol/:id', async (req, res) => {
  const idRol = Number(req.params.id);
  if (Number.isNaN(idRol)) return res.status(400).json({ error: 'ID de rol inválido' });

  const data = readData();
  // 1) si hay guardado en archivo
  let permisos = data.roles[idRol]?.slice() || null;

  // 2) si no hay, usa defaults
  if (!permisos) permisos = DEFAULTS_ROL[idRol]?.slice() || [];

  return res.json({ permisos: cleanPerms(permisos) });
});

// === PUT permisos por rol ===
router.put('/rol/:id', async (req, res) => {
  const idRol = Number(req.params.id);
  if (Number.isNaN(idRol)) return res.status(400).json({ error: 'ID de rol inválido' });

  const perms = cleanPerms(req.body?.permisos);
  const data = readData();
  data.roles[idRol] = perms;
  writeData(data);
  return res.json({ ok: true });
});

// Helper: obtener rol del usuario en BD
async function getUserRole(idUsuario) {
  const { rows } = await pool.query(
    'SELECT u_rol_id_rolu AS rol FROM usuario WHERE id_usuario = $1',
    [idUsuario]
  );
  return rows[0]?.rol || null;
}

// === GET permisos por usuario ===
// Si el usuario no tiene override guardado, hereda del rol (heredaDeRol: true)
router.get('/usuario/:id', async (req, res) => {
  const idUsuario = Number(req.params.id);
  if (Number.isNaN(idUsuario)) return res.status(400).json({ error: 'ID de usuario inválido' });

  const data = readData();
  const override = data.usuarios[idUsuario];
  if (override) {
    return res.json({ permisos: cleanPerms(override), heredaDeRol: false });
  }

  // sin override => hereda de rol
  const rol = await getUserRole(idUsuario);
  const base = (readData().roles[rol] || DEFAULTS_ROL[rol] || []);
  return res.json({ permisos: cleanPerms(base), heredaDeRol: true });
});

// === PUT permisos por usuario ===
// Guarda override explícito (lista completa)
router.put('/usuario/:id', async (req, res) => {
  const idUsuario = Number(req.params.id);
  if (Number.isNaN(idUsuario)) return res.status(400).json({ error: 'ID de usuario inválido' });

  const perms = cleanPerms(req.body?.permisos);
  const data = readData();
  data.usuarios[idUsuario] = perms;
  writeData(data);
  return res.json({ ok: true });
});

module.exports = router;
