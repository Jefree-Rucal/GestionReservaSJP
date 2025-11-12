// routes/catalogos.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const inmuebleModel = require('../models/inmuebleModel');

/* ──────────────────────────────────────────────────────────────
 * ESPACIOS PÚBLICOS
 * ────────────────────────────────────────────────────────────── */

// Listar espacios públicos
router.get('/espacios', async (req, res) => {
  try {
    const q = `
      SELECT 
        e.id_espacio                         AS id,
        e.e_nombre                           AS nombre,
        COALESCE(e.e_tipo, 'Otro')           AS tipo,
        COALESCE(e.e_ubicacion, '—')         AS ubicacion,
        COALESCE(e.e_estado_id_estadoe, 1)   AS estado_id
      FROM espacios_publicos e
      ORDER BY e.e_nombre ASC
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener espacios públicos:', error);
    res.status(500).json({ error: 'Error al obtener espacios públicos' });
  }
});

// Crear espacio público
router.post('/espacios', async (req, res) => {
  try {
    const { nombre, tipo, ubicacion, estado_id } = req.body;
    if (!nombre || !tipo || !ubicacion) {
      return res.status(400).json({ error: 'nombre, tipo y ubicacion son requeridos' });
    }
    const q = `
      INSERT INTO espacios_publicos (e_nombre, e_tipo, e_ubicacion, e_estado_id_estadoe, cestados_id_catalogo)
      VALUES ($1, $2, $3, $4, $4)
      RETURNING id_espacio AS id, e_nombre AS nombre, e_tipo AS tipo, e_ubicacion AS ubicacion,
                e_estado_id_estadoe AS estado_id
    `;
    const { rows } = await pool.query(q, [
      nombre.trim(), tipo, ubicacion.trim(), Number(estado_id || 1)
    ]);
    res.status(201).json({ mensaje: 'Espacio Público creado con éxito', espacio: rows[0] });
  } catch (error) {
    console.error('Error al crear espacio:', error);
    res.status(500).json({ error: 'Error al crear el espacio público: ' + error.message });
  }
});

// Editar espacio público
router.put('/espacios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, ubicacion, estado_id } = req.body;
    if (!nombre || !tipo || !ubicacion) {
      return res.status(400).json({ error: 'nombre, tipo y ubicacion son requeridos' });
    }
    const q = `
      UPDATE espacios_publicos
      SET e_nombre = $1, e_tipo = $2, e_ubicacion = $3,
          e_estado_id_estadoe = $4, cestados_id_catalogo = $4
      WHERE id_espacio = $5
      RETURNING id_espacio AS id, e_nombre AS nombre, e_tipo AS tipo, e_ubicacion AS ubicacion,
                e_estado_id_estadoe AS estado_id
    `;
    const { rows } = await pool.query(q, [
      nombre.trim(), tipo, ubicacion.trim(), Number(estado_id || 1), id
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Espacio no encontrado' });
    res.json({ mensaje: 'Espacio actualizado correctamente', espacio: rows[0] });
  } catch (error) {
    console.error('Error al editar espacio:', error);
    res.status(500).json({ error: 'Error al editar el espacio público' });
  }
});

// Eliminar espacio público
router.delete('/espacios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = await pool.query('DELETE FROM espacios_publicos WHERE id_espacio = $1', [id]);
    if (!del.rowCount) return res.status(404).json({ error: 'Espacio no encontrado' });
    res.json({ ok: true, mensaje: 'Espacio eliminado correctamente' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar: existen reservas asociadas a este espacio.' });
    }
    console.error('Error al eliminar espacio:', error);
    res.status(500).json({ error: 'Error al eliminar el espacio público' });
  }
});

/* ──────────────────────────────────────────────────────────────
 * INMUEBLES (MUEBLES)
 * ────────────────────────────────────────────────────────────── */

// Listar inmuebles
router.get('/inmuebles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id_inmueble AS id, 
        i_nombre    AS nombre, 
        i_tipo      AS tipo,
        i_ubicacion AS ubicacion,
        cantidad_total,
        COALESCE(i_estado_id_estadoi, 1) AS estado_id
      FROM inmueble
      ORDER BY i_nombre ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener inmuebles:', error);
    res.status(500).json({ error: 'Error al obtener inmuebles' });
  }
});

/**
 * NUEVO: Stock global del inmueble (SIN fechas)
 * GET /api/catalogos/inmuebles/stock/:inmuebleId
 * Devuelve: { cantidad_disponible }
 */
router.get('/inmuebles/stock/:inmuebleId', async (req, res) => {
  try {
    const { inmuebleId } = req.params;
    const id = parseInt(inmuebleId, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    const stock = await inmuebleModel.getStockDisponible(id);
    if (stock === null) return res.status(404).json({ error: 'Inmueble no encontrado' });

    res.json({ cantidad_disponible: stock });
  } catch (error) {
    console.error('Error al obtener stock de inmueble:', error);
    res.status(500).json({ error: 'Error al obtener stock de inmueble' });
  }
});

// Disponibilidad por fecha (se mantiene por compatibilidad con espacios/otros usos)
router.get('/inmuebles/disponibilidad/:inmuebleId', async (req, res) => {
  try {
    const { inmuebleId } = req.params;
    const { fecha, hora_inicio, hora_final } = req.query;

    if (!fecha || !hora_inicio || !hora_final) {
      return res.status(400).json({ error: 'Faltan parametros: fecha, hora_inicio, hora_final' });
    }

    const cantidadTotal = await inmuebleModel.getCantidadTotal(inmuebleId);
    if (cantidadTotal === null) return res.status(404).json({ error: 'Inmueble no encontrado' });

    const cantidadReservada = await inmuebleModel.getCantidadReservada(
      inmuebleId, fecha, hora_inicio, hora_final
    );

    const cantidadDisponible = Math.max(0, cantidadTotal - cantidadReservada);

    res.json({
      cantidad_total: cantidadTotal,
      cantidad_reservada: cantidadReservada,
      cantidad_disponible: cantidadDisponible,
    });
  } catch (err) {
    console.error('Error al obtener la disponibilidad:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Crear inmueble
router.post('/inmuebles', async (req, res) => {
  try {
    const { nombre, tipo, ubicacion, cantidad_total, estado_id } = req.body;
    if (!nombre || !tipo || !ubicacion || cantidad_total == null) {
      return res.status(400).json({ error: 'nombre, tipo, ubicacion y cantidad_total son requeridos' });
    }
    const query = `
      INSERT INTO inmueble (i_nombre, i_tipo, i_ubicacion, cantidad_total, i_estado_id_estadoi, cestados_id_catalogo)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING id_inmueble AS id, i_nombre AS nombre, i_tipo AS tipo, i_ubicacion AS ubicacion,
                cantidad_total, i_estado_id_estadoi AS estado_id
    `;
    const values = [nombre.trim(), tipo, ubicacion.trim(), Number(cantidad_total), Number(estado_id || 1)];
    const { rows } = await pool.query(query, values);
    res.status(201).json({ mensaje: 'Inmueble creado con éxito', inmueble: rows[0] });
  } catch (error) {
    console.error('Error al crear inmueble:', error);
    res.status(500).json({ error: 'Error al crear el inmueble: ' + error.message });
  }
});

// Editar inmueble
router.put('/inmuebles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, ubicacion, cantidad_total, estado_id } = req.body;
    if (!nombre || !tipo || !ubicacion || cantidad_total == null) {
      return res.status(400).json({ error: 'nombre, tipo, ubicacion y cantidad_total son requeridos' });
    }
    const q = `
      UPDATE inmueble
      SET i_nombre = $1, i_tipo = $2, i_ubicacion = $3,
          cantidad_total = $4, i_estado_id_estadoi = $5, cestados_id_catalogo = $5
      WHERE id_inmueble = $6
      RETURNING id_inmueble AS id, i_nombre AS nombre, i_tipo AS tipo, i_ubicacion AS ubicacion,
                cantidad_total, i_estado_id_estadoi AS estado_id
    `;
    const { rows } = await pool.query(q, [
      nombre.trim(), tipo, ubicacion.trim(), Number(cantidad_total), Number(estado_id || 1), id
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Inmueble no encontrado' });
    res.json({ mensaje: 'Inmueble actualizado correctamente', inmueble: rows[0] });
  } catch (error) {
    console.error('Error al editar inmueble:', error);
    res.status(500).json({ error: 'Error al editar el inmueble' });
  }
});

// Eliminar inmueble
router.delete('/inmuebles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM inmueble WHERE id_inmueble = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Inmueble no encontrado' });
    res.json({ ok: true, mensaje: 'Inmueble eliminado correctamente' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar: existen reservas asociadas a este inmueble.' });
    }
    console.error('Error al eliminar inmueble:', error);
    res.status(500).json({ error: 'Error al eliminar el inmueble' });
  }
});

module.exports = router;
