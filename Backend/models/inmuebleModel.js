// models/inmuebleModel.js
const pool = require('../config/db');

exports.getCantidadTotal = async (inmuebleId) => {
  const query = 'SELECT cantidad_total FROM inmueble WHERE id_inmueble = $1';
  const result = await pool.query(query, [inmuebleId]);
  return result.rows.length > 0 ? parseInt(result.rows[0].cantidad_total, 10) : null;
};

/**
 * Obtiene la cantidad reservada de un inmueble en un tramo de UN día.
 * Usa ventana semi-abierta [inicio, fin).
 * (Se mantiene por compatibilidad con la ruta de disponibilidad por fecha)
 */
exports.getCantidadReservada = async (inmuebleId, fecha, horaInicio, horaFinal) => {
  const hIni = String(horaInicio || '').slice(0, 5);
  const hFin = String(horaFinal || '').slice(0, 5);

  const estadosActivos = [1]; // Ajusta si usas más estados válidos

  const query = `
    SELECT COALESCE(SUM(r.cantidad_reserva), 0) AS cantidad_reservada
    FROM reserva r
    WHERE r.inmueble_id_inmueble = $1
      AND r.r_estado_id_estador = ANY($5::int[])
      AND NOT (
        r.r_horafinal  <= ($2::date + $3::time)
        OR r.r_horainicio >= ($2::date + $4::time)
      )
  `;

  const values = [inmuebleId, fecha, hIni, hFin, estadosActivos];
  const result = await pool.query(query, values);
  return parseInt(result.rows[0].cantidad_reservada, 10) || 0;
};

/**
 * NUEVO: Stock global del inmueble SIN considerar fechas/horarios.
 * cantidad_disponible = cantidad_total - SUM(cantidad_reserva de TODAS las reservas activas)
 */
exports.getStockDisponible = async (inmuebleId) => {
  const query = `
    SELECT 
      i.cantidad_total - COALESCE(SUM(CASE WHEN r.r_estado_id_estador = ANY($2::int[]) THEN r.cantidad_reserva ELSE 0 END), 0)
      AS cantidad_disponible
    FROM inmueble i
    LEFT JOIN reserva r
      ON r.inmueble_id_inmueble = i.id_inmueble
    WHERE i.id_inmueble = $1
    GROUP BY i.cantidad_total
  `;
  const estadosActivos = [1]; // Ajusta si tienes más estados a considerar para stock
  const result = await pool.query(query, [inmuebleId, estadosActivos]);
  // Si no hay filas, es que no existe el inmueble
  if (result.rows.length === 0) return null;
  return parseInt(result.rows[0].cantidad_disponible, 10) || 0;
};
