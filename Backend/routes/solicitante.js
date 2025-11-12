// routes/solicitantes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db'); // PG Pool

const normLike = (q) =>
  `%${String(q || '').normalize('NFC').trim().replace(/\s+/g, ' ')}%`;

/* ========== SUGERENCIAS ========== */
/* GET /api/solicitantes/sugerencias?q=texto  */
router.get('/sugerencias', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]); // 2+ letras

  try {
    const { rows } = await db.query(
      `
      SELECT
        s.id_solitante                    AS id,
        s.s_nombrec                       AS nombre,
        s.s_dpi                           AS dpi,
        s.s_telefono                      AS telefono,
        s.s_correoe                       AS correo
      FROM solicitante s
      WHERE s.s_nombrec ILIKE $1
      ORDER BY s.s_nombrec ASC
      LIMIT 10
      `,
      [normLike(q)]
    );
    res.json(rows);
  } catch (err) {
    console.error('sugerencias error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

/* ========== LOOKUP EXACTO POR NOMBRE ========== */
/* GET /api/solicitantes/buscar?nombre=Nombre%20Completo
   (coincidencia exacta, case-insensitive) */
async function doLookupByNombre(nombre) {
  const { rows } = await db.query(
    `
    SELECT
      s.id_solitante                    AS id,
      s.s_nombrec                       AS nombre,
      s.s_dpi                           AS dpi,
      s.s_telefono                      AS telefono,
      s.s_correoe                       AS correo
    FROM solicitante s
    WHERE s.s_nombrec ILIKE $1            -- exacto (sin %), pero case-insensitive
    ORDER BY s.id_solitante DESC
    LIMIT 1
    `,
    [nombre.trim()]
  );
  return rows[0] || null;
}

router.get('/buscar', async (req, res) => {
  const nombre = (req.query.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  try {
    const row = await doLookupByNombre(nombre);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err) {
    console.error('buscar error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

/* Alias para no romper el frontend si llama /lookup */
router.get('/lookup', async (req, res) => {
  const nombre = (req.query.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
  try {
    const row = await doLookupByNombre(nombre);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err) {
    console.error('lookup error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
