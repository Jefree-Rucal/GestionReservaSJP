const pool = require('../config/db');

exports.crear = async (datosReserva) => {
  const { nombre, dpi, espacio, fecha } = datosReserva;
  const query = `
    INSERT INTO reservas (nombre, dpi, espacio, fecha)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const values = [nombre, dpi, espacio, fecha];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.listar = async () => {
  const result = await pool.query('SELECT * FROM reservas ORDER BY fecha DESC');
  return result.rows;
};