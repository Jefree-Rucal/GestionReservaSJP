// models/solicitanteModel.js
const pool = require('../config/db');

exports.crearOActualizar = async (solicitanteData) => {
  const { nombre, dpi, telefono, correo } = solicitanteData;
  let solicitanteId;

  // Buscar si el solicitante ya existe por su DPI
  const buscarQuery = 'SELECT id_solitante FROM solicitante WHERE s_dpi = $1';
  const buscarResult = await pool.query(buscarQuery, [dpi]);

  if (buscarResult.rows.length > 0) {
    // Si existe, actualizar sus datos
    solicitanteId = buscarResult.rows[0].id_solitante;
    const actualizarQuery = `
      UPDATE solicitante
      SET s_nombrec = $1, s_telefono = $2, s_correoe = $3
      WHERE id_solitante = $4
    `;
    await pool.query(actualizarQuery, [nombre, telefono, correo, solicitanteId]);
  } else {
    // Si no existe, crear un nuevo solicitante
    const crearQuery = `
      INSERT INTO solicitante (s_nombrec, s_dpi, s_telefono, s_correoe)
      VALUES ($1, $2, $3, $4)
      RETURNING id_solitante;
    `;
    const crearResult = await pool.query(crearQuery, [nombre, dpi, telefono, correo]);
    solicitanteId = crearResult.rows[0].id_solitante;
  }

  return solicitanteId;
};