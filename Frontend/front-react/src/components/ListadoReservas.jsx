// src/components/ListadoReservas.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import '../styles/ListadoReservas.css';

const BASE_URL =
  import.meta?.env?.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

const ESTADOS = {
  PENDIENTE: 2,
  APROBADA: 5,
  RECHAZADA: 6,
  CANCELADA: 8,
};

function ListadoReservas() {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState('');

  // Filtros
  const [filtro, setFiltro] = useState({
    fecha: '',
    tipo: '',        // '', 'inmueble', 'espacio'
    estado: '',      // '', '2' (Pendiente), '5' (Aprobada), '6' (Rechazada)
    q: ''            // id / solicitante / recurso
  });

  // Modal edición
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id_reserva: null,
    fecha_inicio: '',
    hora_inicio: '',
    fecha_final: '',
    hora_final: '',
    estado_id: ESTADOS.PENDIENTE,
    cantidad_reserva: 1
  });
  const [editError, setEditError] = useState('');
  const [editCtx, setEditCtx] = useState({ esEspacio: false, espacioId: null });

  // ==== Helpers ====
  const truthy = (v) =>
    v !== null && v !== undefined && v !== '' && v !== '0' && v !== 0 && v !== 'null';

  const toDateOnly = (d) => {
    try {
      const dt = new Date(d);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return '';
    }
  };

  const toTimeLocal = (iso) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const combineISO = (dateStr, hm) => new Date(`${dateStr}T${hm}:00`).toISOString();

  const parseJSONorThrowText = async (response) => {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await response.json();
    const txt = await response.text();
    throw new Error(`Respuesta no-JSON (${response.status}): ${txt.slice(0, 200)}`);
  };

  // ✅ NUEVO: helper para saber si la reserva es de una fecha pasada (por día)
  const esFechaPasada = (reserva) => {
    const base = reserva.fecha || reserva.hora_final || reserva.hora_inicio;
    if (!base) return false;

    const d = new Date(base);
    const hoy = new Date();

    // Comparamos solo por día (no por hora)
    d.setHours(0, 0, 0, 0);
    hoy.setHours(0, 0, 0, 0);

    return d < hoy; // true si la reserva es de un día anterior a hoy
  };

  // ==== Carga ====
  const cargarReservas = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/reservas/listado`);
      const data = await parseJSONorThrowText(response);
      if (response.ok) {
        setReservas(Array.isArray(data) ? data : []);
        setMensaje('');
      } else {
        setReservas([]);
        setMensaje('❌ Error al cargar reservas: ' + (data?.error || 'Desconocido'));
      }
    } catch (error) {
      setReservas([]);
      setMensaje('❌ Error de conexión: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargarReservas(); }, [cargarReservas]);

  // ==== Filtros ====
  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltro(prev => ({ ...prev, [name]: value }));
  };

  // 1) Aplica filtros (tipo, fecha, estado, búsqueda)
  const reservasFiltradas = useMemo(() => {
    if (!Array.isArray(reservas)) return [];
    const estadoFiltro = filtro.estado ? Number(filtro.estado) : null;
    const q = filtro.q.trim().toLowerCase();

    return reservas.filter((r) => {
      // tipo
      const esInmueble = truthy(r.inmueble_id) || truthy(r.inmueble_nombre);
      const esEspacio  = truthy(r.espacio_id)  || truthy(r.espacio_nombre);

      let coincideTipo = true;
      if (filtro.tipo === 'inmueble') coincideTipo = esInmueble;
      if (filtro.tipo === 'espacio')   coincideTipo = esEspacio;

      // fecha (día de la reserva)
      const baseFecha = r.fecha || r.hora_inicio;
      const coincideFecha = !filtro.fecha ? true : toDateOnly(baseFecha) === filtro.fecha;

      // estado
      const coincideEstado = estadoFiltro == null ? true : Number(r.estado_id) === estadoFiltro;

      // texto (id/solicitante/recurso)
      if (!q) return coincideTipo && coincideFecha && coincideEstado;
      const id = String(r.id_reserva || '');
      const solicitante = String(r.solicitante_nombre || '').toLowerCase();
      const recurso = String(r.inmueble_nombre || r.espacio_nombre || '').toLowerCase();
      const hit = id.includes(q) || solicitante.includes(q) || recurso.includes(q);

      return coincideTipo && coincideFecha && coincideEstado && hit;
    });
  }, [reservas, filtro]);

  // 2) Tabla: excluimos rechazadas / canceladas
  //    y además, por defecto, reservas de FECHA PASADA
  //    👉 PERO si el usuario selecciona una fecha específica (filtro.fecha),
  //       entonces sí mostramos aunque sea del pasado.
  const reservasVisibles = useMemo(
    () => reservasFiltradas.filter(r => {
      const estado = Number(r.estado_id);

      // excluir rechazadas y canceladas
      if ([ESTADOS.RECHAZADA, ESTADOS.CANCELADA].includes(estado)) return false;

      // si NO hay filtro de fecha, ocultar las reservas de días pasados
      if (!filtro.fecha && esFechaPasada(r)) return false;

      return true;
    }),
    [reservasFiltradas, filtro.fecha] // ⚠️ importante agregar filtro.fecha a dependencias
  );

  // ==== KPIs (usamos solo las visibles para que cuadre con la tabla) ====
  const kpi = useMemo(() => {
    const base = reservasVisibles;
    const total = base.length;
    const pendientes = base.filter(r => Number(r.estado_id) === ESTADOS.PENDIENTE).length;
    const aprobadas  = base.filter(r => Number(r.estado_id) === ESTADOS.APROBADA).length;
    const rechazadas = base.filter(r => Number(r.estado_id) === ESTADOS.RECHAZADA).length;
    return { total, pendientes, aprobadas, rechazadas };
  }, [reservasVisibles]);

  // ==== Eliminar (cancela a estado 8 en backend) ====
  const handleEliminarReserva = async (idReserva) => {
    if (!window.confirm('¿Eliminar esta reserva de forma permanente?')) return;
    try {
      const response = await fetch(`${BASE_URL}/api/reservas/${idReserva}`, { method: 'DELETE' });
      const data = await parseJSONorThrowText(response);
      if (response.ok) {
        setMensaje('✅ Reserva cancelada correctamente');
        // reflejar en memoria (la tabla la ocultará)
        setReservas(prev => prev.map(r =>
          r.id_reserva === idReserva
            ? { ...r, estado_id: ESTADOS.CANCELADA, estado_nombre: 'Cancelada' }
            : r
        ));
      } else {
        setMensaje('❌ La Reserva cuenta con pago realizado: ' + (data?.error || 'Desconocido'));
      }
    } catch (error) {
      setMensaje('❌ Error de conexión: ' + error.message);
    }
  };

  // ==== Validaciones (modal) ====
  const validateRange = (fi, hi, ff, hf) => {
    if (!fi || !hi || !ff || !hf) return { ok: false, msg: 'Completa fecha y horas.' };
    const start = new Date(combineISO(fi, hi));
    const end   = new Date(combineISO(ff, hf));
    if (isNaN(start) || isNaN(end)) return { ok: false, msg: 'Fecha u hora inválida.' };
    if (end <= start) return { ok: false, msg: 'El fin debe ser mayor que el inicio.' };
    return { ok: true, startISO: start.toISOString(), endISO: end.toISOString(), startDate: fi };
  };

  // Solo valida solapes para ESPACIOS (bloquean horarios) y solo con reservas APROBADAS (5)
  const validateOverlapIfEspacio = async (esEspacio, espacioId, startISO, endISO, excludeId) => {
    if (!esEspacio || !espacioId) return { ok: true };
    try {
      const url = `${BASE_URL}/api/reservas/espacios/ocupado/${espacioId}`
        + `?inicio=${encodeURIComponent(startISO)}&fin=${encodeURIComponent(endISO)}`
        + `&soloVigentes=1&exclude=${excludeId}`;
      const r = await fetch(url);
      if (r.status === 404) return { ok: true };
      const d = await parseJSONorThrowText(r);
      if (!r.ok) return { ok: false, msg: d?.error || 'Error verificando ocupación.' };
      if (d?.ocupado) return { ok: false, msg: 'El espacio ya está reservado en ese rango.' };
      return { ok: true };
    } catch {
      return { ok: false, msg: 'No se pudo verificar ocupación.' };
    }
  };

  // ==== Editar ====
  const handleEditarClick = (reserva) => {
    const fi = toDateOnly(reserva.hora_inicio);
    const ff = toDateOnly(reserva.hora_final);
    const hi = toTimeLocal(reserva.hora_inicio);
    const hf = toTimeLocal(reserva.hora_final);

    setEditForm({
      id_reserva: reserva.id_reserva,
      fecha_inicio: fi,
      hora_inicio: hi,
      fecha_final: ff,
      hora_final: hf,
      estado_id: Number(reserva.estado_id) || ESTADOS.PENDIENTE,
      cantidad_reserva: Number(reserva.cantidad_reserva) || 1
    });

    const esEspacio = Number(reserva.espacio_id) > 0;
    const espacioId = esEspacio ? Number(reserva.espacio_id) : null;
    setEditCtx({ esEspacio, espacioId });
    setEditError('');
    setEditOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
    setEditError('');
  };

  const handleGuardarEdicion = async () => {
    const { id_reserva, fecha_inicio, hora_inicio, fecha_final, hora_final, estado_id, cantidad_reserva } = editForm;

    const range = validateRange(fecha_inicio, hora_inicio, fecha_final, hora_final);
    if (!range.ok) { setEditError(range.msg); return; }

    const overlap = await validateOverlapIfEspacio(
      editCtx.esEspacio, editCtx.espacioId, range.startISO, range.endISO, id_reserva
    );
    if (!overlap.ok) { setEditError(overlap.msg); return; }

    try {
      const response = await fetch(`${BASE_URL}/api/reservas/${id_reserva}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: range.startDate,
          hora_inicio: range.startISO,
          hora_final: range.endISO,
          estado_id: Number(estado_id),
          cantidad_reserva: Number(cantidad_reserva)
        })
      });
      const data = await parseJSONorThrowText(response);

      if (response.ok) {
        setMensaje('✅ Reserva actualizada correctamente');
        setEditOpen(false);

        const nombreEstado = (id) => {
          const n = Number(id);
          if (n === ESTADOS.PENDIENTE) return 'Pendiente';
          if (n === ESTADOS.APROBADA)  return 'Aprobada';
          if (n === ESTADOS.RECHAZADA) return 'Rechazada';
          if (n === ESTADOS.CANCELADA) return 'Cancelada';
          return '—';
        };

        setReservas(prev => prev.map(r =>
          r.id_reserva === id_reserva
            ? {
                ...r,
                fecha: range.startDate,
                hora_inicio: range.startISO,
                hora_final: range.endISO,
                estado_id: Number(estado_id),
                estado_nombre: nombreEstado(estado_id),
                cantidad_reserva: Number(cantidad_reserva)
              }
            : r
        ));
      } else {
        setEditError(data?.error || 'No se pudo actualizar.');
      }
    } catch {
      setEditError('Error de conexión al actualizar.');
    }
  };

  // ==== Render ====
  if (loading) {
    return (
      <div className="listado-reservas-container">
        <div className="loading">Cargando reservas…</div>
      </div>
    );
  }

  return (
    <div className="listado-reservas-container">
      <h3 className="titulo-listado">📋 Listado de Reservas</h3>

      {mensaje && (
        <div className={`mensaje ${mensaje.includes('✅') ? 'exito' : 'error'}`}>
          {mensaje}
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-container">
        <div className="filtros-form">
          <div className="filtro-group">
            <label>Fecha</label>
            <input
              type="date"
              name="fecha"
              value={filtro.fecha}
              onChange={handleFiltroChange}
              className="input-filtro"
            />
          </div>

          <div className="filtro-group">
            <label>Tipo</label>
            <select
              name="tipo"
              value={filtro.tipo}
              onChange={handleFiltroChange}
              className="select-filtro"
            >
              <option value="">Todos</option>
              <option value="espacio">Espacios Públicos</option>
              <option value="inmueble">Muebles</option>
            </select>
          </div>

          <div className="filtro-group">
            <label>Estado</label>
            <select
              name="estado"
              value={filtro.estado}
              onChange={handleFiltroChange}
              className="select-filtro"
            >
              <option value="">Todos</option>
              <option value={ESTADOS.PENDIENTE}>Pendiente</option>
              <option value={ESTADOS.APROBADA}>Aprobada</option>
              <option value={ESTADOS.RECHAZADA}>Rechazada</option>
            </select>
          </div>

          <div className="filtro-group">
            <label>Buscar (ID, solicitante o recurso)</label>
            <input
              name="q"
              placeholder="Ej. 123 · María · Estadio…"
              className="input-filtro"
              value={filtro.q}
              onChange={handleFiltroChange}
            />
          </div>

          <button
            onClick={() => setFiltro({ fecha: '', tipo: '', estado: '', q: '' })}
            className="btn-limpiar"
            type="button"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-total">
          <div className="kpi-title">Total Reservas</div>
          <div className="kpi-value">{kpi.total}</div>
        </div>
        <div className="kpi-card kpi-activas">
          <div className="kpi-title">Pendientes</div>
          <div className="kpi-value">{kpi.pendientes}</div>
        </div>
        <div className="kpi-card kpi-completadas">
          <div className="kpi-title">Aprobadas</div>
          <div className="kpi-value">{kpi.aprobadas}</div>
        </div>
        <div className="kpi-card kpi-canceladas">
          <div className="kpi-title">Rechazadas</div>
          <div className="kpi-value">{kpi.rechazadas}</div>
        </div>
      </div>

      {/* Tabla (sin rechazadas ni canceladas ni fechas pasadas, salvo si filtro.fecha) */}
      <div className="tabla-container">
        <div className="tabla-wrapper">
          <table className="tabla-reservas">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha reserva</th>
                <th>Horario</th>
                <th>Recurso</th>
                <th>Solicitante</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {reservasVisibles.length === 0 ? (
                <tr>
                  <td colSpan="7" className="sin-resultados">No se encontraron reservas</td>
                </tr>
              ) : reservasVisibles.map(reserva => (
                <tr key={reserva.id_reserva} className={`estado-${reserva.estado_id}`}>
                  <td>{reserva.id_reserva}</td>
                  <td>{new Date(reserva.fecha || reserva.hora_inicio).toLocaleDateString()}</td>
                  <td>
                    {new Date(reserva.hora_inicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    {' — '}
                    {new Date(reserva.hora_final).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </td>
                  <td>
                    {reserva.inmueble_nombre || reserva.espacio_nombre || '—'}
                    {reserva.cantidad_reserva ? ` (${reserva.cantidad_reserva} unidades)` : ''}
                  </td>
                  <td>{reserva.solicitante_nombre}</td>
                  <td>
                    <span className={`estado-badge estado-${reserva.estado_id}`}>{reserva.estado_nombre}</span>
                  </td>
                  <td>
                    <div className="acciones-buttons">
                      <button
                        className="btn-editar"
                        onClick={() => handleEditarClick(reserva)}
                        title="Editar"
                        type="button"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-cancelar"
                        onClick={() => handleEliminarReserva(reserva.id_reserva)}
                        title="Eliminar"
                        type="button"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>
      </div>

      {/* Modal de edición */}
      {editOpen && (
        <div className="modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
            <h3>Editar reserva #{editForm.id_reserva}</h3>

            {editError && <div className="modal-error" role="alert">{editError}</div>}

            <div className="form-grid">
              <label>
                Fecha inicio
                <input
                  type="date"
                  name="fecha_inicio"
                  value={editForm.fecha_inicio}
                  onChange={handleEditChange}
                />
              </label>

              <label>
                Hora inicio
                <input
                  type="time"
                  name="hora_inicio"
                  value={editForm.hora_inicio}
                  onChange={handleEditChange}
                />
              </label>

              <label>
                Fecha final
                <input
                  type="date"
                  name="fecha_final"
                  value={editForm.fecha_final}
                  onChange={handleEditChange}
                />
              </label>

              <label>
                Hora final
                <input
                  type="time"
                  name="hora_final"
                  value={editForm.hora_final}
                  onChange={handleEditChange}
                />
              </label>

              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  name="cantidad_reserva"
                  value={editForm.cantidad_reserva}
                  onChange={handleEditChange}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn-primario" type="button" onClick={handleGuardarEdicion}>
                Guardar
              </button>
              <button className="btn-secundario" type="button" onClick={() => setEditOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ListadoReservas;
