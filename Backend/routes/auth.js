// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.use((req, _res, next) => {
  console.log(`🧩 [AUTH] ${req.method} ${req.originalUrl} (path: ${req.path})`);
  next();
});

router.get('/ping', (_req, res) => {
  res.json({ ok: true, message: 'Auth routes working!' });
});

// 👉 Ruta de prueba extra
router.get('/test-reset', (_req, res) => {
  res.json({ ok: true, msg: 'Ruta /api/auth/test-reset funciona' });
});

const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Prueba: GET /api/auth/ping (debe responder {ok:true})
router.get('/ping', (_req, res) => {
  res.json({ ok: true, message: 'Auth routes working!' });
});

/* =========================
   LOGIN: POST /api/auth/login
   ========================= */
router.post('/login', async (req, res) => {
  console.log('🔐 === LOGIN ATTEMPT ===');
  console.log('📥 Headers:', req.headers);
  console.log('📦 Body completo:', req.body);
  console.log('📦 Body type:', typeof req.body);
  console.log('📦 Body keys:', Object.keys(req.body || {}));
  
  try {
    const { usuario, contrasenia } = req.body || {};
    
    console.log('📝 Usuario extraído:', usuario);
    console.log('📝 Contraseña extraída:', contrasenia ? '***' : 'VACÍA');
    
    if (!usuario || !contrasenia) {
      console.log('❌ Validación falló - campos vacíos');
      return res.status(400).json({ 
        error: 'Usuario y contraseña requeridos' 
      });
    }

    console.log('✅ Validación pasada, buscando en BD...');

    const { rows } = await pool.query(`
      SELECT 
        id_usuario, 
        u_usuario, 
        u_contrasenia, 
        u_nombre, 
        u_apellido, 
        u_correo, 
        u_rol_id_rolu
      FROM usuario
      WHERE LOWER(u_usuario) = LOWER($1)
      LIMIT 1
    `, [usuario.trim()]);

    console.log('🔍 Usuarios encontrados:', rows.length);

    if (rows.length === 0) {
      console.log('❌ Usuario no encontrado en BD');
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    const u = rows[0];
    console.log('👤 Usuario encontrado:', u.u_usuario);

    const ok = await bcrypt.compare(contrasenia, u.u_contrasenia);
    console.log('🔑 Contraseña válida:', ok);
    
    if (!ok) {
      console.log('❌ Contraseña incorrecta');
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    const token = jwt.sign(
      { 
        sub: u.id_usuario, 
        rol: u.u_rol_id_rolu, 
        usu: u.u_usuario 
      },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    console.log('✅ Login exitoso para:', u.u_usuario);

    res.json({
      access_token: token,
      user: {
        id: u.id_usuario,
        usuario: u.u_usuario,
        nombre: u.u_nombre,
        apellido: u.u_apellido,
        correo: u.u_correo,
        rol: u.u_rol_id_rolu,
      }
    });

  } catch (e) {
    console.error('❌ Login error:', e);
    res.status(500).json({ 
      error: 'Error en el servidor al procesar login',
      detail: e.message 
    });
  }
});

/* =========================
   REFRESH: POST /api/auth/refresh
   ========================= */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ 
        error: 'Refresh token requerido' 
      });
    }

    const decoded = jwt.verify(
      refresh_token, 
      process.env.JWT_SECRET || 'dev-secret'
    );

    const newToken = jwt.sign(
      { 
        sub: decoded.sub, 
        rol: decoded.rol, 
        usu: decoded.usu 
      },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      access_token: newToken
    });

  } catch (e) {
    console.error('❌ Refresh token error:', e);
    res.status(401).json({ 
      error: 'Token inválido o expirado' 
    });
  }
});

/* =========================
   ME: GET /api/auth/me
   ========================= */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Token no proporcionado' 
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'dev-secret'
    );

    const { rows } = await pool.query(`
      SELECT 
        id_usuario, 
        u_usuario, 
        u_nombre, 
        u_apellido, 
        u_correo, 
        u_rol_id_rolu
      FROM usuario
      WHERE id_usuario = $1
      LIMIT 1
    `, [decoded.sub]);

    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'Usuario no encontrado' 
      });
    }

    const u = rows[0];
    res.json({
      user: {
        id: u.id_usuario,
        usuario: u.u_usuario,
        nombre: u.u_nombre,
        apellido: u.u_apellido,
        correo: u.u_correo,
        rol: u.u_rol_id_rolu,
      }
    });

  } catch (e) {
    console.error('❌ Get user error:', e);
    res.status(401).json({ 
      error: 'Token inválido o expirado' 
    });
  }
});

/* =========================
   ADMIN RESET PASSWORD
   POST /api/auth/admin-reset-password
   ========================= */
router.post('/admin-reset-password', async (req, res) => {
  try {
    const {
      targetUsuario,
      nuevaContrasenia,
      adminContrasenia,
    } = req.body || {};

    if (!targetUsuario || !nuevaContrasenia || !adminContrasenia) {
      return res.status(400).json({
        error: 'Campos requeridos: targetUsuario, nuevaContrasenia, adminContrasenia',
      });
    }

    const { rows: adminRows } = await pool.query(
      `SELECT id_usuario, u_usuario, u_contrasenia
         FROM usuario
        WHERE id_usuario = 2
        LIMIT 1`
    );

    if (!adminRows.length) {
      return res.status(500).json({
        error: 'No se encontró el usuario administrador (id=2) en la BD',
      });
    }

    const admin = adminRows[0];
    const okAdmin = await bcrypt.compare(adminContrasenia, admin.u_contrasenia);
    if (!okAdmin) {
      return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
    }

    const { rows: userRows } = await pool.query(
      `SELECT id_usuario, u_usuario
         FROM usuario
        WHERE LOWER(u_usuario) = LOWER($1)
        LIMIT 1`,
      [String(targetUsuario).trim()]
    );

    if (!userRows.length) {
      return res.status(404).json({ error: 'Usuario a cambiar no encontrado' });
    }

    const target = userRows[0];

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
    const newHash = await bcrypt.hash(String(nuevaContrasenia), saltRounds);

    await pool.query(
      `UPDATE usuario
          SET u_contrasenia = $1
        WHERE id_usuario = $2`,
      [newHash, target.id_usuario]
    );

    console.log(`🔐 Contraseña reseteada para usuario ${target.u_usuario} por admin ${admin.u_usuario}`);

    return res.json({
      ok: true,
      mensaje: 'Contraseña actualizada correctamente',
    });
  } catch (e) {
    console.error('❌ admin-reset-password error:', e);
    return res.status(500).json({
      error: 'Error al cambiar contraseña',
      detail: e.message,
    });
  }
});

module.exports = router;