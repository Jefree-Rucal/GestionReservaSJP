// src/components/AprobacionListado.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/RegistrarPago.css';

const BASE_URL =
  import.meta?.env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

const ESTADOS = {
  ACTIVO: 1,
  PENDIENTE: 2,
  TERMINADA: 3,
  COMPLETADA: 4,
  APROBADA: 5,
  RECHAZADA: 6,
  CANCELADA: 8, // Cancelada
};

const nombreEstado = (id) => {
  const n = Number(id);
  if (n === ESTADOS.PENDIENTE)  return 'Pendiente';
  if (n === ESTADOS.APROBADA)   return 'Aprobada';
  if (n === ESTADOS.RECHAZADA)  return 'Rechazada';
  if (n === ESTADOS.CANCELADA)  return 'Cancelada';
  if (n === ESTADOS.ACTIVO)     return 'Activo';
  if (n === ESTADOS.TERMINADA)  return 'Terminada';
  if (n === ESTADOS.COMPLETADA) return 'Completada';
  return '—';
};

const BadgeEstado = ({ id }) => {
  const txt = nombreEstado(id);
  const cls =
    Number(id) === ESTADOS.PENDIENTE ? 'badge badge-pendiente' :
    Number(id) === ESTADOS.APROBADA  ? 'badge badge-aprobada'  :
    Number(id) === ESTADOS.RECHAZADA ? 'badge badge-rechazada' : 'badge';
  return <span className={cls}>{txt}</span>;
};

// --- ayuda: considerar solo conflictos vigentes (por si backend no filtra todo)
const EXCLUIR_ESTADOS_IDS = new Set([
  ESTADOS.RECHAZADA,
  ESTADOS.COMPLETADA,
  ESTADOS.CANCELADA,
]);

const nombreEsNoVigente = (txt) =>
  /cancelad|rechazad|completad/i.test(String(txt || ''));

const esConflictoVigente = (c) => {
  const ids = [c?.estado_id, c?.estado, c?.estado_reserva_id]
    .map((n) => Number(n))
    .filter(Number.isFinite);

  for (const id of ids) if (EXCLUIR_ESTADOS_IDS.has(id)) return false;

  const name =
    c?.estado_nombre ?? c?.estado_texto ?? c?.estado_descripcion ?? '';
  if (nombreEsNoVigente(name)) return false;

  return true;
};

export default function AprobacionListado({ modo = 'pendientes' }) {
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [banner, setBanner] = useState(null);
  const [actionLoading, setActionLoading] = useState({}); // { [id]: true }

  // modal de confirmación
  const [confirm, setConfirm] = useState({
    open: false,
    id: null,
    estado: null, // 5 o 6
    titulo: '',
    mensaje: '',
    labelOk: '',
    colorOk: '',
  });

  const estadoFiltro = useMemo(() => {
    if (modo === 'aprobadas')  return ESTADOS.APROBADA;
    if (modo === 'rechazadas') return ESTADOS.RECHAZADA;
    return ESTADOS.PENDIENTE;
  }, [modo]);

  const showAcciones = modo === 'pendientes';

  const fmtFechaHora = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const fecha = d.toLocaleDateString('es-GT');
    const hora = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${fecha}, ${hora}`;
  };

  const show = (type, text) => setBanner({ type, text });
  const clearBanner = () => setBanner(null);

  // API: cambiar estado (con opción silenciosa)
  async function setEstado(idReserva, nuevoEstado, { silent = false } = {}) {
    try {
      if (!silent) {
        setActionLoading((prev) => ({ ...prev, [idReserva]: true }));
      }

      const r = await fetch(`${BASE_URL}/api/reservas/${idReserva}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_id: Number(nuevoEstado) }),
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
      }

      // si estamos viendo pendientes, al cambiar de estado ya no debe estar en la lista
      setFilas((prev) => prev.filter((f) => f.id_reserva !== idReserva));

      if (!silent) {
        show('success', 'Estado actualizado correctamente');
      }
    } catch (e) {
      if (!silent) {
        show('error', `No se pudo actualizar el estado: ${e.message}`);
      } else {
        console.error('Auto-cancelación fallida:', e);
      }
    } finally {
      if (!silent) {
        setActionLoading((prev) => {
          const n = { ...prev };
          delete n[idReserva];
          return n;
        });
        setConfirm({
          open: false,
          id: null,
          estado: null,
          titulo: '',
          mensaje: '',
          labelOk: '',
          colorOk: '',
        });
      }
    }
  }

  // cargar + auto-cancelar pendientes vencidas
  const cargar = async () => {
    setLoading(true);
    clearBanner();
    try {
      const url = `${BASE_URL}/api/reservas/listado?estado=${Number(
        estadoFiltro
      )}`;
      const r = await fetch(url, { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'No se pudo cargar');

      const arr = Array.isArray(data) ? data : [];
      const depuradas = arr.filter(
        (x) => Number(x?.estado_id) === Number(estadoFiltro)
      );

      if (estadoFiltro === ESTADOS.PENDIENTE) {
        // 🔥 Solo en "Pendientes": si ya pasó la hora_inicio (o la fecha), CANCELAR
        const isExpired = (row) => {
          // priorizar hora_inicio; si no hay, usar fecha
          const inicio = row?.hora_inicio || row?.fecha;
          if (!inicio) return false;

          const dt = new Date(inicio);
          if (isNaN(dt)) return false;

          const now = new Date();
          return dt < now; // ya empezó -> está vencida
        };

        const vencidas = depuradas.filter(isExpired);
        const vigentes = depuradas.filter((r) => !isExpired(r));

        // Cancela en backend sin molestar al usuario
        if (vencidas.length > 0) {
          await Promise.all(
            vencidas.map((v) =>
              setEstado(v.id_reserva, ESTADOS.CANCELADA, { silent: true })
            )
          );
        }

        setFilas(vigentes); // solo mostramos las aún vigentes
      } else {
        setFilas(depuradas);
      }
    } catch (e) {
      console.error(e);
      show('error', 'No se pudieron cargar las reservas');
      setFilas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro]);

  // búsqueda + rango
  const filasFiltradas = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return filas.filter((row) => {
      const okTexto =
        !qq ||
        String(row.id_reserva).includes(qq) ||
        String(row.solicitante_nombre || '')
          .toLowerCase()
          .includes(qq) ||
        String(row.espacio_nombre || row.inmueble_nombre || '')
          .toLowerCase()
          .includes(qq);

      const fi = row.hora_inicio ? new Date(row.hora_inicio) : null;
      const ff = row.hora_final ? new Date(row.hora_final) : null;

      let okDesde = true;
      let okHasta = true;

      if (desde) {
        const d = new Date(desde);
        d.setHours(0, 0, 0, 0);
        okDesde = fi ? fi >= d : true;
      }
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        okHasta = ff ? ff <= h : true;
      }
      return okTexto && okDesde && okHasta;
    });
  }, [filas, q, desde, hasta]);

  // --- Pre-chequeo de choques antes de aprobar
  async function preflightAprobacion(row) {
    const espacioId = Number(row?.espacio_id);
    const inicio = row?.hora_inicio;
    const fin = row?.hora_final;

    if (espacioId && inicio && fin) {
      const url =
        `${BASE_URL}/api/reservas/espacios/ocupado/${espacioId}` +
        `?inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(
          fin
        )}&soloVigentes=1`;
      const r = await fetch(url);
      if (r.status === 404) return; // sin choques
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || 'No se pudo validar ocupación');

      const crudos = Array.isArray(data?.conflictos) ? data.conflictos : [];
      const vigentes = crudos.filter(
        (c) =>
          Number(c?.id_reserva) !== Number(row.id_reserva) &&
          esConflictoVigente(c)
      );

      if (vigentes.length > 0) {
        throw new Error(
          'Choque de horario: el espacio ya está reservado en ese rango.'
        );
      }
    }
  }

  // abrir modal aprobar/rechazar (con preflight para aprobar)
  const abrirConfirm = async (row, tipo) => {
    if (tipo === 'aprobar') {
      try {
        setActionLoading((prev) => ({ ...prev, [row.id_reserva]: true }));
        await preflightAprobacion(row);
      } catch (e) {
        console.error(e);
        show('error', e.message || 'El espacio está ocupado en ese rango.');
        setActionLoading((prev) => {
          const n = { ...prev };
          delete n[row.id_reserva];
          return n;
        });
        return; // NO abrimos el modal
      } finally {
        setActionLoading((prev) => {
          const n = { ...prev };
          delete n[row.id_reserva];
          return n;
        });
      }

      setConfirm({
        open: true,
        id: row.id_reserva,
        estado: ESTADOS.APROBADA,
        titulo: 'Aprobar reserva',
        mensaje: `¿Seguro que quieres aprobar la reserva #${row.id_reserva}?`,
        labelOk: 'Aprobar',
        colorOk: 'btn-approve',
      });
    } else {
      setConfirm({
        open: true,
        id: row.id_reserva,
        estado: ESTADOS.RECHAZADA,
        titulo: 'Rechazar reserva',
        mensaje: `¿Seguro que quieres rechazar la reserva #${row.id_reserva}?`,
        labelOk: 'Rechazar',
        colorOk: 'btn-reject',
      });
    }
  };

  const aprobar = (row) => abrirConfirm(row, 'aprobar');
  const rechazar = (row) => abrirConfirm(row, 'rechazar');

  const titulo =
    modo === 'aprobadas'
      ? '— Aprobadas'
      : modo === 'rechazadas'
      ? '— Rechazadas'
      : '— Pendientes';

  return (
    <div className="registrar-pago-container">
      <div className="pagina-header" style={{ marginBottom: 10 }}>
        <h2 className="titulo-pagina">
          ✅ Aprobación y Control{' '}
          <span style={{ fontWeight: 600 }}>{titulo}</span>
        </h2>
        <p className="descripcion-pagina">
          Gestiona el flujo de aprobación de reservas
        </p>
      </div>

      {banner && (
        <div
          className="mensaje"
          style={{
            marginBottom: 12,
            background:
              banner.type === 'error' ? '#fdecea' : '#e7f6ee',
            color: banner.type === 'error' ? '#b42318' : '#027a48',
            border: '1px solid',
            borderColor:
              banner.type === 'error' ? '#f5c2c7' : '#a6e3c5',
            padding: '10px 12px',
            borderRadius: 10,
          }}
        >
          {banner.text}
        </div>
      )}

      {/* filtros */}
      <div
        className="filtros-reporte"
        style={{ gridTemplateColumns: '1fr auto auto auto' }}
      >
        <input
          placeholder="🔎 Buscar: ID, solicitante o recurso"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
        />
        <button className="btn-registrar-pago" onClick={cargar}>
          Actualizar
        </button>
      </div>

      {/* tabla */}
      <div className="tabla-contenedor aprobacion-tabla">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            🔄 Cargando…
          </div>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-reservas">
              <thead>
                <tr className="encabezado-tabla sticky">
                  <th className="columna">ID</th>
                  <th className="columna">Solicitante</th>
                  <th className="columna">Recurso</th>
                  <th className="columna">Inicio</th>
                  <th className="columna">Fin</th>
                  <th className="columna">Estado</th>
                  {showAcciones && (
                    <th className="columna">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.length === 0 ? (
                  <tr>
                    <td
                      className="fila-sin-datos"
                      colSpan={showAcciones ? 7 : 6}
                    >
                      No hay registros
                    </td>
                  </tr>
                ) : (
                  filasFiltradas.map((r) => (
                    <tr key={r.id_reserva} className="fila-reserva">
                      <td className="dato-reserva">
                        #{r.id_reserva}
                      </td>
                      <td className="dato-reserva">
                        {r.solicitante_nombre || '—'}
                      </td>
                      <td className="dato-reserva">
                        {r.espacio_nombre ||
                          r.inmueble_nombre ||
                          '—'}
                      </td>
                      <td className="dato-reserva">
                        {fmtFechaHora(r.hora_inicio)}
                      </td>
                      <td className="dato-reserva">
                        {fmtFechaHora(r.hora_final)}
                      </td>
                      <td className="dato-reserva">
                        <BadgeEstado id={r.estado_id} />
                      </td>
                      {showAcciones && (
                        <td className="dato-reserva">
                          <div className="acciones-wrap">
                            <button
                              className="btn-approve"
                              disabled={
                                !!actionLoading[r.id_reserva]
                              }
                              onClick={() => aprobar(r)}
                            >
                              {actionLoading[r.id_reserva]
                                ? '...'
                                : 'Aprobar'}
                            </button>
                            <button
                              className="btn-reject"
                              disabled={
                                !!actionLoading[r.id_reserva]
                              }
                              onClick={() => rechazar(r)}
                            >
                              {actionLoading[r.id_reserva]
                                ? '...'
                                : 'Rechazar'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de confirmación */}
      {confirm.open && (
        <div
          className="confirm-overlay"
          onClick={(e) => {
            if (
              e.target.classList.contains('confirm-overlay')
            )
              setConfirm({
                ...confirm,
                open: false,
              });
          }}
        >
          <div className="confirm-card">
            <h3>{confirm.titulo}</h3>
            <p>{confirm.mensaje}</p>
            <div className="confirm-actions">
              <button
                className={`confirm-ok ${confirm.colorOk}`}
                onClick={() =>
                  setEstado(confirm.id, confirm.estado)
                }
                disabled={!!actionLoading[confirm.id]}
              >
                {actionLoading[confirm.id]
                  ? 'Procesando…'
                  : confirm.labelOk}
              </button>
              <button
                className="confirm-cancel"
                onClick={() =>
                  setConfirm({
                    open: false,
                    id: null,
                    estado: null,
                    titulo: '',
                    mensaje: '',
                    labelOk: '',
                    colorOk: '',
                  })
                }
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* fallback badges */}
      <style>{`
        .badge{display:inline-block;padding:6px 10px;border-radius:9999px;font-weight:700;font-size:12px}
        .badge-pendiente{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
        .badge-aprobada{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
        .badge-rechazada{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
      `}</style>
    </div>
  );
}
