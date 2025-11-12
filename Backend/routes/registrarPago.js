// routes/registrarPago.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Log simple
router.use((req, _res, next) => {
  console.log(`➡️  [registrarPago] ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * POST /api/pagos/registrar
 * Crea un registro histórico de pago (sin transacción real)
 */
router.post('/registrar', async (req, res) => {
  try {
    let {
      p_monto = 0,
      p_metodo = 'Registro histórico',
      p_referencia = null,
      p_estado_id_estadop = 1, // 1 = Pendiente
      reserva_id_reserva,
      tarifa_id_tarifa = null
    } = req.body;

    if (!reserva_id_reserva) {
      return res.status(400).json({ error: 'reserva_id_reserva es requerido' });
    }

    const monto = Number(p_monto) >= 0 ? Number(p_monto) : 0;
    const fecha = new Date().toISOString().slice(0, 10);

    // Insertar registro
    const { rows } = await pool.query(
      `
      INSERT INTO pago (
        p_monto, p_fecha, p_metodo, p_referencia, p_estado_id_estadop,
        reserva_id_reserva, cestados_id_catalogo, tarifa_id_tarifa
      ) VALUES ($1,$2,$3,$4,$5,$6,$5,$7)
      RETURNING id_pago, p_fecha, p_monto, p_metodo, p_estado_id_estadop, reserva_id_reserva
      `,
      [monto, fecha, p_metodo, p_referencia, p_estado_id_estadop, reserva_id_reserva, tarifa_id_tarifa]
    );

    res.status(201).json({
      mensaje: 'Asiento de pago histórico registrado correctamente',
      pago: rows[0]
    });
  } catch (err) {
    console.error('Error registrando pago histórico:', err);
    res.status(500).json({ error: 'Error al registrar el pago histórico' });
  }
});

module.exports = router;
