// routes/pagos.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Log simple
router.use((req, _res, next) => {
  console.log(`➡️  [pagos] ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * GET /api/pagos/listado
 * Pagos + datos de la reserva + solicitante + nombre del recurso + info de tarifa
 */
router.get('/listado', async (_req, res) => {
  try {
    const sql = `
      SELECT
        -- Pago
        p.id_pago,
        p.p_monto,
        p.p_fecha,
        p.p_referencia,
        p.p_metodo,
        p.p_estado_id_estadop,
        p.cestados_id_catalogo,
        p.reserva_id_reserva,
        p.tarifa_id_tarifa,

        -- Reserva (nombres reales en tu BD)
        r.r_fechareserva           AS fecha_reserva,
        r.r_horainicio             AS hora_inicio,
        r.r_horafinal              AS hora_final,
        r.r_motivouso              AS motivo,

        -- Solicitante (ajusta nombres si los tuyos difieren)
        s.s_nombrec                AS solicitante_nombre,
        s.s_dpi                    AS solicitante_dpi,
        s.s_telefono               AS solicitante_telefono,
        s.s_correoe                AS solicitante_correo,

        -- Recurso
        COALESCE(i.i_nombre, e.e_nombre) AS recurso_nombre,
        CASE
          WHEN r.espacios_publicos_id_espacio IS NOT NULL THEN 'Espacio público'
          WHEN r.inmueble_id_inmueble IS NOT NULL THEN 'Mueble'
          ELSE 'Recurso'
        END AS recurso_tipo,

        -- Tarifa
        t.t_nombre                 AS tarifa_nombre,
        t.t_monto                  AS tarifa_monto

      FROM pago p
      JOIN reserva r
        ON r.id_reserva = p.reserva_id_reserva
      LEFT JOIN solicitante s
        -- ⚠️ PK en tu BD es id_solitante (sin “ci”)
        ON s.id_solitante = r.solicitante_id_solitante
      LEFT JOIN inmueble i
        ON i.id_inmueble = r.inmueble_id_inmueble
      LEFT JOIN espacios_publicos e
        ON e.id_espacio = r.espacios_publicos_id_espacio
      LEFT JOIN tarifa t
        ON t.id_tarifa = p.tarifa_id_tarifa
      ORDER BY p.id_pago DESC;
    `;
    const r = await pool.query(sql);
    res.json(r.rows);
  } catch (err) {
    console.error('GET /pagos/listado error:', err);
    res.status(500).json({ error: 'Error al obtener listado de pagos' });
  }
});

/**
 * GET /api/pagos
 * (listado básico; admite ?reserva_id=123)
 */
router.get('/', async (req, res) => {
  try {
    const { reserva_id } = req.query;

    const base = `
      SELECT 
        p.id_pago,
        p.p_monto,
        p.p_fecha,
        p.p_metodo,
        p.p_referencia,
        p.p_estado_id_estadop,
        p.reserva_id_reserva,
        p.cestados_id_catalogo,
        p.tarifa_id_tarifa
      FROM pago p
    `;
    const params = [];
    const where  = [];

    if (reserva_id) {
      params.push(parseInt(reserva_id, 10));
      where.push(`p.reserva_id_reserva = $${params.length}`);
    }

    const sql = base + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY p.id_pago DESC';
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('Error listando pagos:', err);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

/**
 * GET /api/pagos/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const r = await pool.query(
      `
      SELECT
        p.id_pago,
        p.p_monto,
        p.p_fecha,
        p.p_referencia,
        p.p_metodo,
        p.p_estado_id_estadop,
        p.cestados_id_catalogo,
        p.reserva_id_reserva,
        p.tarifa_id_tarifa,

        r.r_fechareserva           AS fecha_reserva,
        r.r_horainicio             AS hora_inicio,
        r.r_horafinal              AS hora_final,
        r.r_motivouso              AS motivo,

        s.s_nombre                 AS solicitante_nombre,
        s.s_dpi                    AS solicitante_dpi,
        s.s_telefono               AS solicitante_telefono,
        s.s_correo                 AS solicitante_correo,

        COALESCE(i.i_nombre, e.e_nombre) AS recurso_nombre,
        CASE
          WHEN r.espacios_publicos_id_espacio IS NOT NULL THEN 'Espacio público'
          WHEN r.inmueble_id_inmueble IS NOT NULL THEN 'Mueble'
          ELSE 'Recurso'
        END AS recurso_tipo,

        t.t_nombre                 AS tarifa_nombre,
        t.t_monto                  AS tarifa_monto
      FROM pago p
      JOIN reserva r
        ON r.id_reserva = p.reserva_id_reserva
      LEFT JOIN solicitante s
        ON s.id_solitante = r.solicitante_id_solitante
      LEFT JOIN inmueble i
        ON i.id_inmueble = r.inmueble_id_inmueble
      LEFT JOIN espacios_publicos e
        ON e.id_espacio = r.espacios_publicos_id_espacio
      LEFT JOIN tarifa t
        ON t.id_tarifa = p.tarifa_id_tarifa
      WHERE p.id_pago = $1
      `,
      [id]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error obteniendo pago:', err);
    res.status(500).json({ error: 'Error al obtener el pago' });
  }
});

/**
 * POST /api/pagos/crear
 * Crea un registro informativo de pago para la reserva.
 * Si no envías monto ni tarifa, toma la tarifa ACTIVA del recurso y su monto.
 */
router.post('/crear', async (req, res) => {
  try {
    let {
      p_monto,
      p_fecha,
      p_metodo = 'manual',
      p_referencia = null,
      p_estado_id_estadop = 1,
      reserva_id_reserva,
      tarifa_id_tarifa // opcional
    } = req.body;

    if (!reserva_id_reserva) {
      return res.status(400).json({ error: 'reserva_id_reserva es requerido' });
    }

    // 1) Traer reserva
    const rRes = await pool.query(
      `SELECT id_reserva, inmueble_id_inmueble, espacios_publicos_id_espacio
         FROM reserva WHERE id_reserva = $1`,
      [parseInt(reserva_id_reserva, 10)]
    );
    if (!rRes.rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    const reserva = rRes.rows[0];

    // 2) Tarifa por defecto (si no se indicó)
    if (!tarifa_id_tarifa) {
      let tSql, tParams;
      if (reserva.inmueble_id_inmueble) {
        tSql = `SELECT id_tarifa, t_monto FROM tarifa
                WHERE inmueble_id_inmueble = $1 AND t_estado_id_estado = 1
                ORDER BY id_tarifa DESC LIMIT 1`;
        tParams = [reserva.inmueble_id_inmueble];
      } else if (reserva.espacios_publicos_id_espacio) {
        tSql = `SELECT id_tarifa, t_monto FROM tarifa
                WHERE espacios_publicos_id_espacio = $1 AND t_estado_id_estado = 1
                ORDER BY id_tarifa DESC LIMIT 1`;
        tParams = [reserva.espacios_publicos_id_espacio];
      } else {
        return res.status(400).json({ error: 'La reserva no tiene recurso (espacio/mueble).' });
      }

      const tRes = await pool.query(tSql, tParams);
      if (!tRes.rows.length) {
        return res.status(400).json({ error: 'No existe tarifa ACTIVA para el recurso de esta reserva.' });
      }
      tarifa_id_tarifa = tRes.rows[0].id_tarifa;
      if (p_monto == null) p_monto = tRes.rows[0].t_monto;
    }

    // 3) Validaciones finales
    p_monto = Number(p_monto);
    if (!Number.isFinite(p_monto) || p_monto <= 0) {
      return res.status(400).json({ error: 'p_monto debe ser numérico > 0' });
    }
    if (!p_fecha) p_fecha = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

    // 4) Inserción
    const values = [
      p_monto,
      p_fecha,
      String(p_metodo).slice(0, 50),
      p_referencia ? String(p_referencia).slice(0, 100) : null,
      parseInt(p_estado_id_estadop, 10),
      parseInt(reserva_id_reserva, 10),
      parseInt(p_estado_id_estadop, 10), // espejo en catálogo
      parseInt(tarifa_id_tarifa, 10)
    ];

    const ins = await pool.query(
      `INSERT INTO pago
         (p_monto, p_fecha, p_metodo, p_referencia, p_estado_id_estadop,
          reserva_id_reserva, cestados_id_catalogo, tarifa_id_tarifa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      values
    );

    res.status(201).json({ mensaje: 'Pago registrado', pago: ins.rows[0] });
  } catch (err) {
    console.error('Error creando pago:', err);
    res.status(500).json({ error: 'Error al crear el pago' });
  }
});

/**
 * PUT /api/pagos/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    let {
      p_monto,
      p_fecha,
      p_metodo,
      p_referencia,
      p_estado_id_estadop,
      reserva_id_reserva,
      tarifa_id_tarifa // opcional
    } = req.body;

    if (p_monto == null || !p_fecha || !p_metodo || !reserva_id_reserva || !p_estado_id_estadop) {
      return res.status(400).json({ error: 'p_monto, p_fecha, p_metodo, p_estado_id_estadop y reserva_id_reserva son requeridos' });
    }

    p_monto = Number(p_monto);
    if (!Number.isFinite(p_monto) || p_monto <= 0) {
      return res.status(400).json({ error: 'p_monto debe ser numérico > 0' });
    }

    const values = [
      p_monto,
      p_fecha,
      String(p_metodo).slice(0, 50),
      (p_referencia ? String(p_referencia).slice(0, 100) : null),
      parseInt(p_estado_id_estadop, 10),
      parseInt(reserva_id_reserva, 10),
      parseInt(p_estado_id_estadop, 10)
    ];

    let sql = `
      UPDATE pago
         SET p_monto = $1,
             p_fecha = $2,
             p_metodo = $3,
             p_referencia = $4,
             p_estado_id_estadop = $5,
             reserva_id_reserva = $6,
             cestados_id_catalogo = $7
    `;

    if (tarifa_id_tarifa != null) {
      values.push(parseInt(tarifa_id_tarifa, 10));
      sql += `, tarifa_id_tarifa = $${values.length} `;
    }

    values.push(id);
    sql += ` WHERE id_pago = $${values.length} RETURNING *`;

    const r = await pool.query(sql, values);
    if (!r.rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json({ mensaje: 'Pago actualizado', pago: r.rows[0] });
  } catch (err) {
    console.error('Error actualizando pago:', err);
    res.status(500).json({ error: 'Error al actualizar el pago' });
  }
});

/**
 * DELETE /api/pagos/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query('DELETE FROM pago WHERE id_pago = $1 RETURNING *', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json({ mensaje: 'Pago eliminado', pago: r.rows[0] });
  } catch (err) {
    console.error('Error eliminando pago:', err);
    res.status(500).json({ error: 'Error al eliminar el pago' });
  }
});

module.exports = router;
