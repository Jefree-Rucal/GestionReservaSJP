// models/reservasControllers.js
const pool = require('../config/db');

exports.crear = async (reservaData) => {
  const { fecha, hora_inicio, hora_final, motivo, usuario_id, espacio_id, inmueble_id, cantidad, estado_id, solicitanteId } = reservaData;

  const query = `
    INSERT INTO reserva (
      r_fechareserva,
      r_horainicio,
      r_horafinal,
      r_motivouso,
      usuario_id_usuario,
      espacios_publicos_id_espacio,
      inmueble_id_inmueble,
      cantidad,
      r_estado_id_estador,
      solicitante_id_solitante
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;
  const values = [
    fecha,
    hora_inicio,
    hora_final,
    motivo,
    usuario_id,
    espacio_id,
    inmueble_id,
    cantidad,
    estado_id,
    solicitanteId
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.listar = async () => {
  const result = await pool.query('SELECT * FROM reserva ORDER BY r_fechareserva DESC');
  return result.rows;
};