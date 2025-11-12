// routes/reportes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper: valida fechas y arma rango [desde..hasta] inclusive
function parseRango(req, res) {
  let { desde, hasta } = req.query;
  if (!desde || !hasta) {
    res.status(400).json({ error: 'Parámetros requeridos: desde y hasta (YYYY-MM-DD)' });
    return null;
  }
  // hasta_inclusive = hasta + 1 día (para usar < hasta+1d)
  return { desde, hastaInclusive: `${hasta} 23:59:59` };
}

// Ping de diagnóstico (útil para probar montaje)
router.get('/ping', (_req, res) => res.json({ ok: true, mod: 'reportes' }));

/* ======================================
 * REPORTE: USO DE RECURSOS (espacios + inmuebles)
 * ====================================== */
router.get('/uso', async (req, res) => {
  const rango = parseRango(req, res);
  if (!rango) return;
  const estadosActivos = [5]; // Aprobadas; agrega 2 si quieres incluir Pendientes

  try {
    // INMUEBLES: reservas que se cruzan con el rango, sumando cantidad_reserva
    const sqlInm = `
      SELECT
        i.id_inmueble,
        i.i_nombre AS nombre,
        COUNT(r.id_reserva)         AS reservas,
        COALESCE(SUM(r.cantidad_reserva), 0) AS unidades_reservadas
      FROM inmueble i
      LEFT JOIN reserva r
        ON r.inmueble_id_inmueble = i.id_inmueble
       AND r.r_estado_id_estador = ANY($3::int[])
       AND NOT (r.r_horafinal < $1::timestamp OR r.r_horainicio > $2::timestamp)
      GROUP BY i.id_inmueble, i.i_nombre
      ORDER BY i.i_nombre ASC;
    `;
    const { rows: inmuebles } = await pool.query(sqlInm, [rango.desde, rango.hastaInclusive, estadosActivos]);

    // ESPACIOS: reservas que se cruzan con el rango, sacando duración (horas)
    const sqlEsp = `
      SELECT
        e.id_espacio,
        e.e_nombre AS nombre,
        COUNT(r.id_reserva) AS reservas,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(r.r_horafinal, r.r_horainicio) - r.r_horainicio)) / 3600), 0) AS horas
      FROM espacios_publicos e
      LEFT JOIN reserva r
        ON r.espacios_publicos_id_espacio = e.id_espacio
       AND r.r_estado_id_estador = ANY($3::int[])
       AND NOT (r.r_horafinal < $1::timestamp OR r.r_horainicio > $2::timestamp)
      GROUP BY e.id_espacio, e.e_nombre
      ORDER BY e.e_nombre ASC;
    `;
    const { rows: espacios } = await pool.query(sqlEsp, [rango.desde, rango.hastaInclusive, estadosActivos]);

    res.json({ inmuebles, espacios });
  } catch (err) {
    console.error('❌ /reportes/uso', err);
    res.status(500).json({ error: 'Error al generar reporte de uso' });
  }
});

/* ======================================
 * REPORTE: USUARIOS / SOLICITANTES
 * ====================================== */
router.get('/usuarios', async (req, res) => {
  const rango = parseRango(req, res);
  if (!rango) return;

  try {
    const sql = `
      SELECT
        s.id_solitante                  AS solicitante_id,
        COALESCE(s.s_nombrec,'—')      AS solicitante,
        COUNT(r.id_reserva)            AS total_reservas,
        SUM(CASE WHEN r.r_estado_id_estador = 5 THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN r.r_estado_id_estador = 2 THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN r.r_estado_id_estador = 6 THEN 1 ELSE 0 END) AS rechazadas
      FROM solicitante s
      LEFT JOIN reserva r
        ON r.solicitante_id_solitante = s.id_solitante
       AND NOT (COALESCE(r.r_horafinal, r.r_horainicio) < $1::timestamp OR r.r_horainicio > $2::timestamp)
      GROUP BY s.id_solitante, s.s_nombrec
      ORDER BY total_reservas DESC, s.s_nombrec ASC
      LIMIT 100;
    `;
    const { rows } = await pool.query(sql, [rango.desde, rango.hastaInclusive]);
    res.json(rows);
  } catch (err) {
    console.error('❌ /reportes/usuarios', err);
    res.status(500).json({ error: 'Error al generar reporte de usuarios' });
  }
});

/* ======================================
 * DASHBOARD EJECUTIVO (KPIs simples)
 * ====================================== */
router.get('/ejecutivo', async (req, res) => {
  const rango = parseRango(req, res);
  if (!rango) return;

  try {
    const sqlR = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN r_estado_id_estador = 5 THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN r_estado_id_estador = 2 THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN r_estado_id_estador = 6 THEN 1 ELSE 0 END) AS rechazadas
      FROM reserva
      WHERE NOT (COALESCE(r_horafinal, r_horainicio) < $1::timestamp OR r_horainicio > $2::timestamp)
    `;
    const r1 = await pool.query(sqlR, [rango.desde, rango.hastaInclusive]);

    const sqlP = `
      SELECT
        COUNT(*) AS pagos_count,
        COALESCE(SUM(p_monto),0) AS pagos_monto
      FROM pago
      WHERE p_fecha >= $1::date AND p_fecha <= $2::date
    `;
    const r2 = await pool.query(sqlP, [rango.desde, rango.hastaInclusive]);

    res.json({
      reservas: r1.rows[0] || { total: 0, aprobadas: 0, pendientes: 0, rechazadas: 0 },
      pagos:    r2.rows[0] || { pagos_count: 0, pagos_monto: 0 }
    });
  } catch (err) {
    console.error('❌ /reportes/ejecutivo', err);
    res.status(500).json({ error: 'Error al generar KPIs' });
  }
});

module.exports = router;
