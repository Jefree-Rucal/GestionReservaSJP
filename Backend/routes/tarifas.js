// routes/tarifas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// cache del nombre real de la tabla (tarifa / tarifas)
let TARIFA_TABLE = null;

// Detecta automáticamente la tabla: tarifa o tarifas (incluye variantes con comillas)
async function ensureTarifaTable() {
  if (TARIFA_TABLE) return TARIFA_TABLE;

  const sql = `
    SELECT
      COALESCE(
        to_regclass('public.tarifa'),
        to_regclass('public.tarifas'),
        to_regclass('tarifa'),
        to_regclass('tarifas'),
        to_regclass('"Tarifa"'),
        to_regclass('public."Tarifa"')
      )::text AS rel
  `;
  const { rows } = await pool.query(sql);
  const rel = rows[0]?.rel; // p.ej. 'public.tarifas'
  if (!rel) {
    const msg = 'No existe la tabla "tarifa" ni "tarifas". Crea una de ellas o ajusta el nombre.';
    const err = new Error(msg);
    err.code = 'NO_TARIFA_TABLE';
    throw err;
  }
  TARIFA_TABLE = rel; // usar tal cual (schema.tabla)
  console.log(`✅ [tarifas] usando tabla: ${TARIFA_TABLE}`);
  return TARIFA_TABLE;
}

// Logging del router
router.use((req, _res, next) => {
  console.log(`➡️  [tarifas] ${req.method} ${req.originalUrl}`);
  next();
});

// SQL base de listado (se completa con el nombre detectado de la tabla)
function listadoSQL(table) {
  return `
    SELECT 
      t.id_tarifa,
      t.t_nombre,
      t.t_descripcion,
      t.t_monto,
      t.t_estado_id_estado,
      t.inmueble_id_inmueble,
      t.espacios_publicos_id_espacio,

      c.ca_nombre AS estado_nombre,
      i.i_nombre AS inmueble_nombre,
      e.e_nombre AS espacio_nombre,

      COALESCE(i.i_nombre, e.e_nombre) AS recurso_nombre,
      CASE WHEN t.inmueble_id_inmueble IS NOT NULL THEN 'inmueble' ELSE 'espacio' END AS recurso_tipo,
      COALESCE(t.inmueble_id_inmueble, t.espacios_publicos_id_espacio) AS recurso_id
    FROM ${table} t
    LEFT JOIN cestados c ON t.cestados_id_catalogo = c.id_ca
    LEFT JOIN inmueble i ON t.inmueble_id_inmueble = i.id_inmueble
    LEFT JOIN espacios_publicos e ON t.espacios_publicos_id_espacio = e.id_espacio
    ORDER BY t.id_tarifa DESC
  `;
}

/* =========================
 * Crear tarifa
 * ========================= */
router.post('/crear', async (req, res) => {
  try {
    const table = await ensureTarifaTable();
    const { nombre, descripcion, monto, tipo_recurso, recurso_id, estado_id } = req.body;

    if (!nombre || !descripcion || !monto || !tipo_recurso || !recurso_id || !estado_id) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    if (parseFloat(monto) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (!['inmueble', 'espacio'].includes(tipo_recurso)) {
      return res.status(400).json({ error: 'Tipo de recurso inválido' });
    }

    let sql, values;
    if (tipo_recurso === 'inmueble') {
      sql = `
        INSERT INTO ${table} (
          t_nombre, t_descripcion, t_monto, t_estado_id_estado,
          inmueble_id_inmueble, cestados_id_catalogo
        ) VALUES ($1, $2, $3, $4, $5, $4)
        RETURNING *
      `;
      values = [nombre, descripcion, parseFloat(monto), parseInt(estado_id), parseInt(recurso_id)];
    } else {
      sql = `
        INSERT INTO ${table} (
          t_nombre, t_descripcion, t_monto, t_estado_id_estado,
          espacios_publicos_id_espacio, cestados_id_catalogo
        ) VALUES ($1, $2, $3, $4, $5, $4)
        RETURNING *
      `;
      values = [nombre, descripcion, parseFloat(monto), parseInt(estado_id), parseInt(recurso_id)];
    }

    const r = await pool.query(sql, values);
    res.status(201).json({ mensaje: 'Tarifa creada con éxito', tarifa: r.rows[0] });
  } catch (error) {
    if (error.code === 'NO_TARIFA_TABLE') return res.status(500).json({ error: error.message });
    console.error('Error al crear tarifa:', error);
    res.status(500).json({ error: 'Error al crear la tarifa: ' + error.message });
  }
});

/* =========================
 * Listados (dos rutas)
 * ========================= */
router.get('/listado', async (_req, res) => {
  try {
    const table = await ensureTarifaTable();
    const r = await pool.query(listadoSQL(table));
    res.json(r.rows);
  } catch (error) {
    if (error.code === 'NO_TARIFA_TABLE') return res.status(500).json({ error: error.message });
    console.error('Error al obtener listado de tarifas:', error);
    res.status(500).json({ error: 'Error al obtener el listado de tarifas' });
  }
});

// Compatibilidad: GET /api/tarifas
router.get('/', async (_req, res) => {
  try {
    const table = await ensureTarifaTable();
    const r = await pool.query(listadoSQL(table));
    res.json(r.rows);
  } catch (error) {
    if (error.code === 'NO_TARIFA_TABLE') return res.status(500).json({ error: error.message });
    console.error('Error al obtener listado de tarifas:', error);
    res.status(500).json({ error: 'Error al obtener el listado de tarifas' });
  }
});

/* =========================
 * Actualizar tarifa
 * ========================= */
router.put('/:id', async (req, res) => {
  try {
    const table = await ensureTarifaTable();
    const { id } = req.params;
    const { nombre, descripcion, monto, tipo_recurso, recurso_id, estado_id } = req.body;

    if (!nombre || !descripcion || !monto || !tipo_recurso || !recurso_id || !estado_id) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    if (parseFloat(monto) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (!['inmueble', 'espacio'].includes(tipo_recurso)) {
      return res.status(400).json({ error: 'Tipo de recurso inválido' });
    }

    let sql, values;
    if (tipo_recurso === 'inmueble') {
      sql = `
        UPDATE ${table}
        SET t_nombre = $1,
            t_descripcion = $2,
            t_monto = $3,
            t_estado_id_estado = $4,
            inmueble_id_inmueble = $5,
            espacios_publicos_id_espacio = NULL,
            cestados_id_catalogo = $4
        WHERE id_tarifa = $6
        RETURNING *
      `;
      values = [nombre, descripcion, parseFloat(monto), parseInt(estado_id), parseInt(recurso_id), parseInt(id)];
    } else {
      sql = `
        UPDATE ${table}
        SET t_nombre = $1,
            t_descripcion = $2,
            t_monto = $3,
            t_estado_id_estado = $4,
            espacios_publicos_id_espacio = $5,
            inmueble_id_inmueble = NULL,
            cestados_id_catalogo = $4
        WHERE id_tarifa = $6
        RETURNING *
      `;
      values = [nombre, descripcion, parseFloat(monto), parseInt(estado_id), parseInt(recurso_id), parseInt(id)];
    }

    const r = await pool.query(sql, values);
    if (!r.rows.length) return res.status(404).json({ error: 'Tarifa no encontrada' });
    res.json({ mensaje: 'Tarifa actualizada correctamente', tarifa: r.rows[0] });
  } catch (error) {
    if (error.code === 'NO_TARIFA_TABLE') return res.status(500).json({ error: error.message });
    console.error('Error al actualizar tarifa:', error);
    res.status(500).json({ error: 'Error al actualizar la tarifa: ' + error.message });
  }
});

/* =========================
 * Eliminar tarifa
 * ========================= */
router.delete('/:id', async (req, res) => {
  try {
    const table = await ensureTarifaTable();
    const { id } = req.params;
    const r = await pool.query(`DELETE FROM ${table} WHERE id_tarifa = $1 RETURNING *`, [parseInt(id)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Tarifa no encontrada' });
    res.json({ mensaje: 'Tarifa eliminada correctamente', tarifa: r.rows[0] });
  } catch (error) {
    if (error.code === 'NO_TARIFA_TABLE') return res.status(500).json({ error: error.message });
    console.error('Error al eliminar tarifa:', error);
    res.status(500).json({ error: 'Error al eliminar la tarifa: ' + error.message });
  }
});

module.exports = router;
