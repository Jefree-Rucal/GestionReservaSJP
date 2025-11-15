// backend/routes/usuarios.js
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const router = express.Router();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
});

/* =========================
   CREATE: POST /api/usuarios
   ========================= */
router.post('/', async (req, res) => {
  try {
    const {
      usuario, u_usuario,
      nombre, u_nombre,
      apellido, u_apellido,
      correo, u_correo,
      contrasenia, password, pass,
      rol, u_rol_id_rolu,
      estado, id_estado,
    } = req.body || {};

    const username = (u_usuario ?? usuario ?? '').trim();
    const first    = (u_nombre  ?? nombre  ?? '').trim();
    const last     = (u_apellido ?? apellido ?? '').trim();
    const email    = (u_correo  ?? correo  ?? null) || null;
    const rawPwd   = (contrasenia ?? password ?? pass ?? '').trim();
    const roleId   = Number(u_rol_id_rolu ?? rol ?? 6) || 6;
    const estadoId = Number(id_estado ?? estado ?? 1) || 1;

    if (!username || !first || !rawPwd) {
      return res.status(400).json({ error: 'usuario, nombre y contraseña son requeridos' });
    }

    const dup = await pool.query(
      `SELECT 1
         FROM usuario
        WHERE LOWER(u_usuario) = LOWER($1)
           OR LOWER(COALESCE(u_correo, '')) = LOWER(COALESCE($2, ''))`,
      [username, email]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ error: 'El usuario o correo ya existe' });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
    const hash = await bcrypt.hash(rawPwd, saltRounds);

    const ins = await pool.query(
      `INSERT INTO usuario
         (u_usuario, u_nombre, u_apellido, u_correo, u_contrasenia, u_rol_id_rolu, id_estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id_usuario, u_usuario, u_nombre, u_apellido, u_correo, u_rol_id_rolu,
                 id_estado AS estado_id`,
      [username, first, last, email, hash, roleId, estadoId]
    );

    return res.status(201).json({
      mensaje: 'Usuario creado',
      usuario: ins.rows[0],
    });
  } catch (e) {
    console.error('Error al crear usuario:', e);
    return res.status(500).json({ error: 'Error al crear usuario' });
  }
});

/* =========================
   READ LIST: GET /api/usuarios
   ========================= */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id_usuario,
        u.u_usuario,
        u.u_nombre,
        u.u_apellido,
        u.u_correo,
        u.u_rol_id_rolu,
        u.id_estado AS estado_id,
        CASE WHEN u.id_estado = 1 THEN 'Activo'
             WHEN u.id_estado = 7 THEN 'Inactivo'
             ELSE 'Desconocido' END AS estado_nombre
      FROM usuario u
      ORDER BY u.id_usuario DESC
    `);
    res.json({ usuarios: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

/* =========================
   ROLES: GET /api/usuarios/roles/lista
   (antes de /:id para evitar capturar "roles" como id)
   ========================= */
router.get('/roles/lista', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_rolu, ur_nombre
      FROM u_rol
      ORDER BY id_rolu
    `);
    res.json({ roles: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

/* =========================
   READ ONE: GET /api/usuarios/:id
   ========================= */
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const { rows } = await pool.query(
      `
      SELECT
        u.id_usuario,
        u.u_usuario,
        u.u_nombre,
        u.u_apellido,
        u.u_correo,
        u.u_rol_id_rolu,
        u.id_estado AS estado_id,
        CASE WHEN u.id_estado = 1 THEN 'Activo'
             WHEN u.id_estado = 7 THEN 'Inactivo'
             ELSE 'Desconocido' END AS estado_nombre
      FROM usuario u
      WHERE u.id_usuario = $1
      `,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ usuario: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

/* =========================
   UPDATE: PUT /api/usuarios/:id
   ========================= */
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const {
      u_usuario,
      u_nombre,
      u_apellido,
      u_correo,
      u_rol_id_rolu,
      id_estado,
    } = req.body;

    const { rows } = await pool.query(
      `
      UPDATE usuario
      SET
        u_usuario      = COALESCE($1, u_usuario),
        u_nombre       = COALESCE($2, u_nombre),
        u_apellido     = COALESCE($3, u_apellido),
        u_correo       = COALESCE($4, u_correo),
        u_rol_id_rolu  = COALESCE($5, u_rol_id_rolu),
        id_estado      = COALESCE($6, id_estado)
      WHERE id_usuario = $7
      RETURNING
        id_usuario, u_usuario, u_nombre, u_apellido, u_correo, u_rol_id_rolu,
        id_estado AS estado_id
      `,
      [u_usuario ?? null, u_nombre ?? null, u_apellido ?? null, u_correo ?? null,
       u_rol_id_rolu ?? null, id_estado ?? null, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ mensaje: 'Usuario actualizado', usuario: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

/* =========================
   DELETE (soft): DELETE /api/usuarios/:id
   - Niega eliminar administradores (rol 1)
   - Marca id_estado = 7 (Inactivo)
   ========================= */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const { rows } = await pool.query(
      `SELECT id_usuario, u_rol_id_rolu, id_estado FROM usuario WHERE id_usuario = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = rows[0];
    if (Number(user.u_rol_id_rolu) === 1) {
      return res.status(403).json({ error: 'No se puede eliminar un Administrador' });
    }

    const upd = await pool.query(
      `UPDATE usuario SET id_estado = 7 WHERE id_usuario = $1 RETURNING id_usuario`,
      [id]
    );
    if (upd.rowCount === 0) {
      return res.status(500).json({ error: 'No se pudo desactivar' });
    }
    return res.json({ mensaje: 'Usuario desactivado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
});

module.exports = router;
