// routes/reservas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth'); // 👈 NUEVO

router.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

// ===== Estados (ajustados a tu catálogo) =====
const ESTADO_PENDIENTE = 2;
const ESTADO_APROBADA  = 5;
const ESTADO_RECHAZADA = 6;
const ESTADO_CANCELADA = 8;

// Normaliza rango (acepta desde/hasta o from/to)
function getRange(req) {
  const q = req.query || {};
  const desde = q.desde || q.from;
  const hasta = q.hasta || q.to;
  return { desde, hasta };
}

/* =========================
 *  Crear nueva reserva
 * ========================= */
router.post('/crear', auth, async (req, res) => {
  const { solicitante, reserva } = req.body;
  const client = await pool.connect();

  try {
    // 👇 Usuario autenticado (viene del JWT: sub = id_usuario)
    console.log('🔐 Usuario autenticado en /reservas/crear:', req.user);
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res
        .status(401)
        .json({ error: 'No se pudo determinar el usuario autenticado' });
    }

    await client.query('BEGIN');

    const inicio = new Date(reserva.hora_inicio);
    const fin = new Date(reserva.hora_final);
    if (isNaN(inicio) || isNaN(fin) || fin <= inicio) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Rango horario inválido' });
    }

    // ---- Solape ESPACIO (solo bloquea si hay alguna APROBADA en el rango) ----
    if (reserva.espacio_id) {
      const qEsp = `
        SELECT 1
        FROM reserva r
        WHERE r.espacios_publicos_id_espacio = $1
          AND r.r_estado_id_estador = $4
          AND NOT (r.r_horafinal <= $2 OR r.r_horainicio >= $3)
        LIMIT 1
      `;
      const choc = await client.query(qEsp, [
        reserva.espacio_id,
        reserva.hora_inicio,
        reserva.hora_final,
        ESTADO_APROBADA,
      ]);
      if (choc.rows.length) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'El espacio ya está reservado en ese rango.' });
      }
    }

    // ---- Stock INMUEBLE (solo consumen stock las APROBADAS) ----
    if (reserva.inmueble_id) {
      const { rows: ctot } = await client.query(
        'SELECT cantidad_total FROM inmueble WHERE id_inmueble = $1',
        [reserva.inmueble_id]
      );
      if (!ctot.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Inmueble no encontrado' });
      }
      const cantidadTotal = Number(ctot[0].cantidad_total);

      const q = `
        SELECT COALESCE(SUM(r.cantidad_reserva), 0) AS sum
        FROM reserva r
        WHERE r.inmueble_id_inmueble = $1
          AND r.r_estado_id_estador = $4
          AND NOT (r.r_horafinal <= $2 OR r.r_horainicio >= $3)
      `;
      const s = await client.query(q, [
        reserva.inmueble_id,
        reserva.hora_inicio,
        reserva.hora_final,
        ESTADO_APROBADA,
      ]);

      const yaReservado = Number(s.rows[0].sum || 0);
      const solicitada = Number(reserva.cantidad || 0);
      const disponible = Math.max(0, cantidadTotal - yaReservado);

      if (!Number.isFinite(solicitada) || solicitada < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cantidad inválida' });
      }
      if (solicitada > disponible) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `No hay stock suficiente en el rango seleccionado. Disponible: ${disponible}`,
        });
      }
    }

    // ---- Solicitante (PK id_solitante en tu tabla) ----
    const qSol = `
      INSERT INTO solicitante (s_nombrec, s_dpi, s_telefono, s_correoe)
      VALUES ($1, $2, $3, $4)
      RETURNING id_solitante
    `;
    const sol = await client.query(qSol, [
      solicitante.nombre,
      solicitante.dpi,
      solicitante.telefono,
      solicitante.correo,
    ]);
    const solicitanteId = sol.rows[0].id_solitante;

    // ---- Reserva (por defecto llega PENDIENTE = 2 desde el front) ----
    const qRes = `
      INSERT INTO reserva (
        r_fechareserva, r_horainicio, r_horafinal, r_motivouso,
        r_estado_id_estador, usuario_id_usuario,
        solicitante_id_solitante, espacios_publicos_id_espacio,
        inmueble_id_inmueble, cestados_id_catalogo, cantidad_reserva
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `;
    const ins = await client.query(qRes, [
      reserva.fecha,
      reserva.hora_inicio,
      reserva.hora_final,
      reserva.motivo,
      reserva.estado_id,               // normal: 2 (Pendiente)
      usuarioId,                       // ✅ usuario del token
      solicitanteId,
      reserva.espacio_id || null,
      reserva.inmueble_id || null,
      reserva.estado_id,               // espejo en catálogo
      reserva.inmueble_id ? reserva.cantidad : 1,
    ]);

    await client.query('COMMIT');
    return res
      .status(201)
      .json({ mensaje: 'Reserva creada con exito', reserva: ins.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear reserva:', error);
    return res.status(500).json({
      error: 'Error al crear la reserva: ' + (error?.detail || error?.message),
    });
  } finally {
    client.release();
  }
});


/* =========================
 *  Listado (simple)
 * ========================= */
router.get('/listado', async (req, res) => {
  try {
    const { estado } = req.query;
    const filtros = [];
    const vals = [];
    let i = 1;

    if (estado && /^\d+$/.test(String(estado))) {
      filtros.push(`r.r_estado_id_estador = $${i++}`);
      vals.push(Number(estado));
    }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';

    const query = `
      SELECT 
        r.id_reserva,
        r.r_fechareserva AS fecha,
        r.r_horainicio   AS hora_inicio,
        r.r_horafinal    AS hora_final,
        r.cantidad_reserva,
        r.r_estado_id_estador AS estado_id,
        c.ca_nombre           AS estado_nombre,
        s.s_nombrec           AS solicitante_nombre,
        i.i_nombre            AS inmueble_nombre,
        e.e_nombre            AS espacio_nombre,
        -- ➕ estos dos IDs para que el front sepa qué recurso es
        r.espacios_publicos_id_espacio AS espacio_id,
        r.inmueble_id_inmueble         AS inmueble_id
      FROM reserva r
      LEFT JOIN solicitante        s  ON r.solicitante_id_solitante     = s.id_solitante
      LEFT JOIN inmueble           i  ON r.inmueble_id_inmueble         = i.id_inmueble
      LEFT JOIN espacios_publicos  e  ON r.espacios_publicos_id_espacio = e.id_espacio
      LEFT JOIN cestados           c  ON r.cestados_id_catalogo         = c.id_ca
      ${where}
      ORDER BY r.r_fechareserva DESC, r.r_horainicio DESC
    `;
    const result = await pool.query(query, vals);
    return res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener listado de reservas:', error);
    return res
      .status(500)
      .json({ error: 'Error al obtener el listado de reservas' });
  }
});

/* =========================
 *  Detalle (para recibo)
 * ========================= */
router.get('/detalle/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const sql = `
      SELECT 
        r.id_reserva,
        r.r_fechareserva                           AS fecha_solicitud,
        r.r_horainicio                             AS hora_inicio,
        r.r_horafinal                              AS hora_final,
        r.r_motivouso                              AS motivo_uso,
        r.r_estado_id_estador                      AS estado_id,

        -- Solicitante
        s.id_solitante                             AS solicitante_id,
        s.s_nombrec                                AS solicitante_nombre,
        s.s_dpi                                    AS solicitante_dpi,
        s.s_telefono                               AS solicitante_telefono,
        s.s_correoe                                AS solicitante_correo,

        -- Recurso
        i.id_inmueble,
        i.i_nombre                                 AS inmueble_nombre,
        e.id_espacio,
        e.e_nombre                                 AS espacio_nombre,

        COALESCE(i.i_nombre, e.e_nombre, '—')      AS nombre_recurso
      FROM reserva r
      LEFT JOIN solicitante       s ON r.solicitante_id_solitante     = s.id_solitante
      LEFT JOIN inmueble          i ON r.inmueble_id_inmueble         = i.id_inmueble
      LEFT JOIN espacios_publicos e ON r.espacios_publicos_id_espacio = e.id_espacio
      WHERE r.id_reserva = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [idNum]);
    if (!rows.length)
      return res.status(404).json({ error: 'Reserva no encontrada' });

    return res.json(rows[0]);
  } catch (err) {
    console.error('❌ GET /reservas/detalle/:id', err);
    return res.status(500).json({ error: 'Error al obtener la reserva' });
  }
});

/* =========================
 *  Historial con filtros
 * ========================= */
router.get('/historial', async (req, res) => {
  try {
    let {
      desde,
      hasta,
      tipo,
      estado,
      q,
      page = '1',
      pageSize = '20',
      orden = 'recientes',
    } = req.query;

    page = Math.max(1, parseInt(page, 10) || 1);
    pageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const orderBy =
      orden === 'antiguos' ? 'r.r_horainicio ASC' : 'r.r_horainicio DESC';

    const where = [];
    const values = [];
    let i = 1;

    if (desde) {
      where.push(`DATE(COALESCE(r.r_horainicio, r.r_fechareserva)) >= $${i++}`);
      values.push(desde);
    }
    if (hasta) {
      where.push(`DATE(COALESCE(r.r_horainicio, r.r_fechareserva)) <= $${i++}`);
      values.push(hasta);
    }

    if (tipo === 'inmueble') where.push(`r.inmueble_id_inmueble IS NOT NULL`);
    else if (tipo === 'espacio')
      where.push(`r.espacios_publicos_id_espacio IS NOT NULL`);

    if (estado && /^\d+$/.test(String(estado))) {
      where.push(`r.r_estado_id_estador = $${i++}`);
      values.push(Number(estado));
    }

    if (q) {
      where.push(`(
        s.s_nombrec ILIKE $${i} OR
        i2.i_nombre ILIKE $${i} OR
        e.e_nombre  ILIKE $${i} OR
        CAST(r.id_reserva AS TEXT) ILIKE $${i}
      )`);
      values.push(`%${q}%`);
      i++;
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const sql = `
      SELECT
        r.id_reserva,
        r.r_fechareserva              AS fecha,
        r.r_horainicio                AS hora_inicio,
        r.r_horafinal                 AS hora_final,
        r.cantidad_reserva,
        r.r_estado_id_estador         AS estado_id,
        c.ca_nombre                   AS estado_nombre,

        -- Solicitante
        s.s_nombrec                   AS solicitante_nombre,
        s.s_dpi                       AS solicitante_dpi,
        s.s_telefono                  AS solicitante_telefono,
        s.s_correoe                   AS solicitante_correo,

        -- Recurso
        i2.i_nombre                   AS inmueble_nombre,
        e.e_nombre                    AS espacio_nombre,

        CASE
          WHEN r.inmueble_id_inmueble IS NOT NULL THEN 'inmueble'
          WHEN r.espacios_publicos_id_espacio IS NOT NULL THEN 'espacio'
          ELSE 'otro'
        END                           AS tipo,

        r.r_motivouso                 AS motivo_uso,

        COUNT(*) OVER()               AS total_count
      FROM reserva r
      LEFT JOIN solicitante       s  ON r.solicitante_id_solitante     = s.id_solitante
      LEFT JOIN inmueble          i2 ON r.inmueble_id_inmueble         = i2.id_inmueble
      LEFT JOIN espacios_publicos e  ON r.espacios_publicos_id_espacio = e.id_espacio
      LEFT JOIN cestados          c  ON r.cestados_id_catalogo         = c.id_ca
      ${whereSQL}
      ORDER BY ${orderBy}
      LIMIT $${i++} OFFSET $${i++}
    `;
    values.push(pageSize, offset);

    const { rows } = await pool.query(sql, values);
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    return res.json({
      page,
      pageSize,
      total,
      items: rows.map((r) => {
        delete r.total_count;
        return r;
      }),
    });
  } catch (err) {
    console.error('❌ GET /reservas/historial', err);
    return res.status(500).json({ error: 'Error al obtener historial' });
  }
});

/* =========================
 *  Rango para calendario
 * ========================= */
router.get('/rango', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res
        .status(400)
        .json({ error: 'Parámetros requeridos: from y to (YYYY-MM-DD)' });
    }

    const sql = `
      WITH base AS (
        SELECT
          r.*,
          DATE(COALESCE(r.r_horainicio, r.r_fechareserva))                 AS fecha_inicio,
          DATE(COALESCE(r.r_horafinal,  r.r_horainicio, r.r_fechareserva)) AS fecha_fin
        FROM reserva r
      )
      SELECT
        b.id_reserva,
        b.fecha_inicio,
        b.fecha_fin,
        TO_CHAR(COALESCE(b.r_horainicio, b.r_fechareserva::timestamp), 'HH24:MI') AS hora_inicio,
        TO_CHAR(COALESCE(b.r_horafinal,  b.r_horainicio), 'HH24:MI')               AS hora_final,
        b.cantidad_reserva                                                         AS cantidad,
        b.r_estado_id_estador                                                      AS estado,
        s.s_nombrec                                                                AS solicitante,
        i.i_nombre                                                                 AS nombre_inmueble,
        e.e_nombre                                                                 AS nombre_espacio,
        COALESCE(i.i_nombre, e.e_nombre, '—')                                      AS nombre_recurso,
        CASE
          WHEN b.inmueble_id_inmueble IS NOT NULL THEN 'Inmueble'
          WHEN b.espacios_publicos_id_espacio IS NOT NULL THEN 'Espacio'
          ELSE 'Otro'
        END                                                                         AS tipo
      FROM base b
      LEFT JOIN solicitante       s ON b.solicitante_id_solitante     = s.id_solitante
      LEFT JOIN inmueble          i ON b.inmueble_id_inmueble         = i.id_inmueble
      LEFT JOIN espacios_publicos e ON b.espacios_publicos_id_espacio = e.id_espacio
      WHERE NOT (b.fecha_fin < $1::date OR b.fecha_inicio > $2::date)
      ORDER BY b.fecha_inicio ASC, b.r_horainicio ASC NULLS LAST
    `;

    const { rows } = await pool.query(sql, [from, to]);
    return res.json(
      rows.map((r) => ({
        id_reserva: r.id_reserva,
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        hora_inicio: r.hora_inicio || null,
        hora_final: r.hora_final || null,
        cantidad: r.cantidad ?? null,
        estado: r.estado,
        solicitante: r.solicitante || '—',
        tipo: r.tipo,
        espacio: r.nombre_espacio || null,
        inmueble: r.nombre_inmueble || null,
        nombre_recurso: r.nombre_recurso || '—',
      }))
    );
  } catch (err) {
    console.error('❌ GET /reservas/rango', err);
    return res
      .status(500)
      .json({ error: 'Error al obtener reservas por rango' });
  }
});

/* =========================
 *  Ocupación espacios (rango exacto) — solo aprobadas y vigentes
 * ========================= */
router.get('/espacios/ocupado/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { inicio, fin, exclude } = req.query;

    const espacioId = Number(id);
    if (!Number.isInteger(espacioId) || espacioId <= 0)
      return res.status(400).json({ error: 'id inválido' });
    if (!inicio || !fin)
      return res.status(400).json({ error: 'Parámetros requeridos: inicio y fin (ISO datetime)' });

    const tInicio = new Date(inicio), tFin = new Date(fin);
    if (isNaN(tInicio) || isNaN(tFin) || tFin <= tInicio)
      return res.status(400).json({ error: 'Rango inválido: fin debe ser mayor que inicio' });

    const sql = `
      SELECT
        r.id_reserva,
        r.r_horainicio AS hora_inicio,
        r.r_horafinal  AS hora_final
      FROM reserva r
      WHERE r.espacios_publicos_id_espacio = $1
        AND r.r_estado_id_estador = $4           -- solo Aprobadas
        AND NOT (r.r_horafinal <= $2 OR r.r_horainicio >= $3)
        AND r.r_horafinal > NOW()                -- solo vigentes
        AND ($5::int IS NULL OR r.id_reserva <> $5) -- excluir actual en edición
      ORDER BY r.r_horainicio ASC
      LIMIT 50
    `;
    const excludeNum = exclude ? Number(exclude) : null;
    const { rows } = await pool.query(sql, [espacioId, inicio, fin, ESTADO_APROBADA, excludeNum]);

    return res.json({ ocupado: rows.length > 0, conflictos: rows });
  } catch (err) {
    console.error('❌ GET /reservas/espacios/ocupado/:id', err);
    return res.status(500).json({ error: 'Error al verificar ocupación' });
  }
});



/* =========================
 *  Ocupación inmuebles (respeta ?soloVigentes=1)
 * ========================= */
router.get('/inmuebles/ocupado/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { inicio, fin, exclude } = req.query;

    const inmId = Number(id);
    if (!Number.isInteger(inmId) || inmId <= 0)
      return res.status(400).json({ error: 'id inválido' });
    if (!inicio || !fin)
      return res.status(400).json({ error: 'Parámetros requeridos: inicio y fin (ISO)' });

    const tInicio = new Date(inicio), tFin = new Date(fin);
    if (isNaN(tInicio) || isNaN(tFin) || tFin <= tInicio)
      return res.status(400).json({ error: 'Rango inválido' });

    const sqlConf = `
      SELECT r.id_reserva, r.r_horainicio AS hora_inicio, r.r_horafinal AS hora_final, r.cantidad_reserva
      FROM reserva r
      WHERE r.inmueble_id_inmueble = $1
        AND r.r_estado_id_estador = $4             -- solo Aprobadas
        AND NOT (r.r_horafinal <= $2 OR r.r_horainicio >= $3)
        AND r.r_horafinal > NOW()                  -- solo vigentes
        AND ($5::int IS NULL OR r.id_reserva <> $5)
      ORDER BY r.r_horainicio ASC
      LIMIT 100
    `;
    const excludeNum = exclude ? Number(exclude) : null;
    const { rows: conflictos } = await pool.query(sqlConf, [inmId, inicio, fin, ESTADO_APROBADA, excludeNum]);

    const { rows: ctot } = await pool.query(
      'SELECT cantidad_total FROM inmueble WHERE id_inmueble = $1',
      [inmId]
    );
    if (!ctot.length) return res.status(404).json({ error: 'Inmueble no encontrado' });

    const cantidadTotal = Number(ctot[0].cantidad_total);
    const reservada = conflictos.reduce((acc, r) => acc + Number(r.cantidad_reserva || 0), 0);
    const disponible = Math.max(0, cantidadTotal - reservada);

    return res.json({
      ocupado: conflictos.length > 0,
      conflictos,
      cantidad_total: cantidadTotal,
      cantidad_reservada: reservada,
      cantidad_disponible: disponible,
    });
  } catch (err) {
    console.error('❌ GET /reservas/inmuebles/ocupado/:id', err);
    return res.status(500).json({ error: 'Error al verificar ocupación de inmueble' });
  }
});



/* =========================
 *  Cambiar estado (aprob/rechazo/general)
 * ========================= */
router.put('/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado_id } = req.body;

    const idNum = Number(id);
    const estNum = Number(estado_id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    if (!Number.isInteger(estNum) || estNum <= 0) {
      return res.status(400).json({ error: 'estado_id inválido' });
    }

    const upd = `
      UPDATE reserva
         SET r_estado_id_estador = $1,
             cestados_id_catalogo = $1
       WHERE id_reserva = $2
       RETURNING id_reserva, r_estado_id_estador AS estado_id
    `;
    const { rows } = await pool.query(upd, [estNum, idNum]);
    if (!rows.length)
      return res.status(404).json({ error: 'Reserva no encontrada' });

    return res.json({
      ok: true,
      mensaje: 'Estado actualizado',
      reserva: rows[0],
    });
  } catch (err) {
    console.error('❌ PUT /reservas/:id/estado', err);
    return res.status(500).json({
      error: err?.detail || err?.message || 'Error al actualizar el estado',
    });
  }
});

/* =========================
 *  Cancelar (alias directo a 8)
 * ========================= */
router.put('/cancelar/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE reserva 
         SET r_estado_id_estador = $2, 
             cestados_id_catalogo = $2
       WHERE id_reserva = $1
       RETURNING *`,
      [id, ESTADO_CANCELADA]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: 'Reserva no encontrada' });
    return res.json({
      mensaje: 'Reserva cancelada correctamente',
      reserva: result.rows[0],
    });
  } catch (error) {
    console.error('Error al cancelar reserva:', error);
    return res.status(500).json({
      error:
        error?.detail || error?.message || 'Error al cancelar la reserva',
    });
  }
});

/* =========================
 *  Actualización completa
 * ========================= */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, hora_inicio, hora_final, estado_id, cantidad_reserva } =
      req.body;

    if (!fecha || !hora_inicio || !hora_final) {
      return res
        .status(400)
        .json({ error: 'fecha, hora_inicio y hora_final son requeridos' });
    }
    if (new Date(hora_final) <= new Date(hora_inicio)) {
      return res
        .status(400)
        .json({ error: 'hora_final debe ser mayor que hora_inicio' });
    }

    const updateSQL = `
      UPDATE reserva
      SET r_fechareserva = $1,
          r_horainicio   = $2,
          r_horafinal    = $3,
          r_estado_id_estador = $4,
          cestados_id_catalogo = $4,
          cantidad_reserva     = $5
      WHERE id_reserva = $6
      RETURNING *
    `;

    const { rows } = await pool.query(updateSQL, [
      fecha,
      hora_inicio,
      hora_final,
      Number(estado_id),
      Number(cantidad_reserva),
      id,
    ]);

    if (!rows.length)
      return res.status(404).json({ error: 'Reserva no encontrada' });
    return res.json({
      mensaje: 'Reserva actualizada correctamente',
      reserva: rows[0],
    });
  } catch (err) {
    console.error('❌ PUT /reservas/:id', err);
    return res.status(500).json({
      error: err?.detail || err?.message || 'Error al actualizar la reserva',
    });
  }
});

/* =========================
 *  DELETE -> cancelar (estado 8) SIEMPRE
 * ========================= */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const upd = `
      UPDATE reserva
         SET r_estado_id_estador = $2,
             cestados_id_catalogo = $2
       WHERE id_reserva = $1
       RETURNING id_reserva, r_estado_id_estador AS estado_id
    `;
    const { rows } = await pool.query(upd, [id, ESTADO_CANCELADA]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    return res.json({
      ok: true,
      mensaje: 'Reserva cancelada',
      reserva: rows[0],
    });
  } catch (err) {
    console.error('❌ DELETE /reservas/:id -> cancelar', err);
    return res.status(500).json({ error: 'Error al cancelar la reserva' });
  }
});

/* =========================
 *  Disponibilidad INMUEBLES (solo APROBADAS y vigentes)
 * ========================= */
router.get('/disponibilidad/inmuebles', async (req, res) => {
  try {
    const { desde, hasta } = getRange(req);
    if (!desde || !hasta) {
      return res
        .status(400)
        .json({ error: 'Parámetros requeridos: desde y hasta (YYYY-MM-DD)' });
    }

    const sql = `
      SELECT
        i.id_inmueble,
        i.i_nombre AS nombre,
        i.cantidad_total,
        COALESCE((
          SELECT SUM(r.cantidad_reserva)
          FROM reserva r
          WHERE r.inmueble_id_inmueble = i.id_inmueble
            AND r.r_estado_id_estador = $3
            -- cae en el rango del reporte
            AND NOT (r.r_horafinal <= $1::timestamp OR r.r_horainicio >= ($2::date + INTERVAL '1 day'))
            -- y sigue vigente ahora
            AND r.r_horafinal > NOW()
        ), 0) AS cantidad_reservada_vigente
      FROM inmueble i
      ORDER BY i.i_nombre ASC
    `;

    const { rows } = await pool.query(sql, [desde, hasta, ESTADO_APROBADA]);

    const data = rows.map(r => {
      const total = Number(r.cantidad_total || 0);
      const reservada = Number(r.cantidad_reservada_vigente || 0);
      return {
        id_inmueble: r.id_inmueble,
        nombre: r.nombre,
        cantidad_total: total,
        cantidad_reservada: reservada,
        cantidad_disponible: Math.max(0, total - reservada),
      };
    });

    return res.json(data);
  } catch (err) {
    console.error('❌ GET /reservas/disponibilidad/inmuebles', err);
    return res.status(500).json({ error: 'Error al obtener disponibilidad de inmuebles' });
  }
});

/* =========================
 *  Disponibilidad ESPACIOS (solo APROBADAS y aún vigentes)
 * ========================= */
router.get('/disponibilidad/espacios', async (req, res) => {
  try {
    const { desde, hasta } = getRange(req);
    if (!desde || !hasta) {
      return res
        .status(400)
        .json({ error: 'Parámetros requeridos: desde y hasta (YYYY-MM-DD)' });
    }

    const estadosActivos = [ESTADO_APROBADA];

    const sql = `
      SELECT
        e.id_espacio,
        e.e_nombre AS nombre,
        EXISTS (
          SELECT 1
          FROM reserva r
          WHERE r.espacios_publicos_id_espacio = e.id_espacio
            AND r.r_estado_id_estador = ANY($3::int[])
            -- el rango cae entre [desde, hasta]
            AND NOT (r.r_horafinal <= $1::timestamp OR r.r_horainicio >= ($2::date + INTERVAL '1 day'))
            -- y la reserva sigue "viva" ahora mismo
            AND r.r_horafinal > NOW()
          LIMIT 1
        ) AS ocupado,
        (
          SELECT json_agg(x)
          FROM (
            SELECT
              r.id_reserva,
              r.r_horainicio AS hora_inicio,
              r.r_horafinal  AS hora_final
            FROM reserva r
            WHERE r.espacios_publicos_id_espacio = e.id_espacio
              AND r.r_estado_id_estador = ANY($3::int[])
              AND NOT (r.r_horafinal <= $1::timestamp OR r.r_horainicio >= ($2::date + INTERVAL '1 day'))
              AND r.r_horafinal > NOW()
            ORDER BY r.r_horainicio ASC
            LIMIT 3
          ) x
        ) AS conflictos
      FROM espacios_publicos e
      ORDER BY e.e_nombre ASC;
    `;

    const { rows } = await pool.query(sql, [desde, hasta, estadosActivos]);

    const data = rows.map(r => ({
      id_espacio: r.id_espacio,
      nombre: r.nombre,
      ocupado: !!r.ocupado,
      conflictos: r.conflictos || [],
    }));

    return res.json(data);
  } catch (err) {
    console.error('❌ GET /reservas/disponibilidad/espacios', err);
    return res.status(500).json({ error: 'Error al obtener disponibilidad de espacios' });
  }
});

module.exports = router;
