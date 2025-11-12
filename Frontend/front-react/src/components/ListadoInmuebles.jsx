import React, { useEffect, useMemo, useState, useCallback } from 'react';
import '../styles/ListadoInmuebles.css';

const TIPO_OPTIONS = ['Mobiliario', 'Electrónica', 'Herramienta', 'Maquinaria'];
const MAP_TIPO_NUM = { '1': 'Mobiliario', '2': 'Electrónica', '3': 'Herramienta', '4': 'Maquinaria' };
const ESTADO_OPTIONS = [
  { value: 1, label: 'Activo' },
  { value: 7, label: 'Inactivo' },
];

const parseJSONorThrowText = async (response) => {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await response.json();
  const txt = await response.text();
  throw new Error(`Respuesta no-JSON (${response.status}): ${txt.slice(0, 200)}`);
};

const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeInmueble = (raw) => {
  let tipo = raw?.tipo ?? raw?.i_tipo ?? '';
  if (/^\d+$/.test(String(tipo))) tipo = MAP_TIPO_NUM[String(tipo)] ?? '';
  return {
    id: raw?.id ?? raw?.id_inmueble,
    nombre: raw?.nombre ?? raw?.i_nombre ?? '—',
    tipo: tipo || '',
    ubicacion: raw?.ubicacion ?? raw?.i_ubicacion ?? '',
    cantidad_total: Number(raw?.cantidad_total ?? raw?.i_cantidad_total ?? 0),
    estado_id: Number(raw?.estado_id ?? raw?.i_estado_id_estadoi ?? raw?.i_estado_id_estador ?? 1),
  };
};

// Clases de color para chips según tipo
const chipClassFor = (tipo) => {
  const t = norm(tipo);
  if (t === 'mobiliario') return 'li-chip li-chip--mobiliario';
  if (t === 'electrónica' || t === 'electronica') return 'li-chip li-chip--electronica';
  if (t === 'herramienta') return 'li-chip li-chip--herramienta';
  if (t === 'maquinaria') return 'li-chip li-chip--maquinaria';
  return 'li-chip li-chip--default';
};

export default function ListadoInmuebles() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  // Modal de edición
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    nombre: '',
    tipo: '',
    ubicacion: '',
    cantidad_total: '',
    estado_id: 1,
  });

  // Modal de confirmación de eliminación
  const [confirmDel, setConfirmDel] = useState({ open: false, id: null, nombre: '' });

  const showMsg = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch('http://localhost:5000/api/catalogos/inmuebles');
      const d = await parseJSONorThrowText(r);
      const arr = Array.isArray(d) ? d.map(normalizeInmueble) : [];
      setItems(arr);
    } catch (e) {
      console.error(e);
      showMsg('❌ Error al cargar inmuebles');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Abrir modal de edición con datos
  const openEditModal = (it) => {
    setEditingId(it.id);
    setEditForm({
      nombre: it.nombre || '',
      tipo: it.tipo || '',
      ubicacion: it.ubicacion || '',
      cantidad_total: String(it.cantidad_total ?? ''),
      estado_id: it.estado_id ?? 1,
    });
    setShowEditModal(true);
  };

  // Cerrar modal edición
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingId(null);
  };

  // Cerrar con ESC (para ambos modales)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showEditModal) closeEditModal();
        if (confirmDel.open) setConfirmDel({ open: false, id: null, nombre: '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showEditModal, confirmDel.open]);

  // Guardar cambios (edición)
  const saveEdit = async () => {
    try {
      // Validaciones rápidas
      if (!editForm.nombre.trim()) return showMsg('❌ El nombre es obligatorio');
      if (!editForm.tipo.trim()) return showMsg('❌ El tipo es obligatorio');
      if (!editForm.ubicacion.trim()) return showMsg('❌ La ubicación es obligatoria');
      const qty = Number(editForm.cantidad_total);
      if (!Number.isFinite(qty) || qty < 0) return showMsg('❌ La cantidad debe ser un número ≥ 0');

      const body = {
        nombre: editForm.nombre.trim(),
        tipo: editForm.tipo.trim(),
        ubicacion: editForm.ubicacion.trim(),
        cantidad_total: qty,
        estado_id: Number(editForm.estado_id),
      };
      const r = await fetch(`http://localhost:5000/api/catalogos/inmuebles/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await parseJSONorThrowText(r);
      if (!r.ok) throw new Error(d?.error || 'Error al guardar');

      // **CAMBIO AQUI:** Vuelve a cargar la lista completa después de guardar
      await load();
      
      showMsg('✅ Mueble actualizado');
      closeEditModal();
    } catch (e) {
      console.error(e);
      showMsg(`❌ No se pudo guardar: ${e.message}`);
    }
  };

  // ==== Confirmación de eliminación (modal) ====
  const openAskDel = (it) => setConfirmDel({ open: true, id: it.id, nombre: it.nombre || '' });
  const closeAskDel = () => setConfirmDel({ open: false, id: null, nombre: '' });

  const confirmDelete = async () => {
    if (!confirmDel.id) return;
    try {
      const r = await fetch(`http://localhost:5000/api/catalogos/inmuebles/${confirmDel.id}`, { method: 'DELETE' });
      const d = await parseJSONorThrowText(r).catch(() => ({}));
      if (r.status === 409) {
        showMsg(d?.error || '❌ No se puede eliminar: tiene reservas asociadas.');
        return;
      }
      if (!r.ok) throw new Error(d?.error || 'Error al eliminar');

      setItems((prev) => prev.filter((x) => x.id !== confirmDel.id));
      showMsg('🗑️ Mueble eliminado');
    } catch (e) {
      console.error(e);
      showMsg(`❌ Error al eliminar: ${e.message}`);
    } finally {
      closeAskDel();
    }
  };

  // Filtros + paginación
  const filtered = useMemo(() => {
    let arr = [...items];
    if (q.trim()) {
      const nq = norm(q);
      arr = arr.filter((it) => norm(it.nombre).includes(nq) || norm(it.ubicacion).includes(nq));
    }
    if (tipoFilter) arr = arr.filter((it) => norm(it.tipo) === norm(tipoFilter));
    return arr;
  }, [items, q, tipoFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const start = (pageSafe - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="li-container">
      <h2 className="li-title">🛋️ Muebles</h2>

      {msg && <div className={`li-msg ${msg.startsWith('✅') || msg.startsWith('🗑️') ? 'ok' : 'err'}`}>{msg}</div>}

      <div className="li-filters">
        <input
          className="li-input"
          placeholder="Buscar por nombre o ubicación…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select
          className="li-select"
          value={tipoFilter}
          onChange={(e) => { setTipoFilter(e.target.value); setPage(1); }}
        >
          <option value="">Todos los tipos</option>
          {TIPO_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className="li-btn" onClick={load}>↻ Recargar</button>
      </div>

      <div className="li-tablewrap">
        {loading ? (
          <div className="li-loading">Cargando…</div>
        ) : (
          <table className="li-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Ubicación</th>
                <th>Cantidad</th>
                <th>Estado</th>
                <th style={{ width: 160 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan="7" className="li-empty">Sin resultados</td>
                </tr>
              ) : (
                visible.map((it) => (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.nombre}</td>
                    <td><span className={chipClassFor(it.tipo)}>{it.tipo || '—'}</span></td>
                    <td>{it.ubicacion || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{it.cantidad_total}</td>
                    <td>
                      <span className={`li-badge ${it.estado_id === 1 ? 'ok' : 'off'}`}>
                        {it.estado_id === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="li-actions">
                        <button className="li-btn warn" onClick={() => openEditModal(it)}>✏️ Editar</button>
                        <button className="li-btn danger" onClick={() => openAskDel(it)}>🗑️ Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="li-pager">
        <span>
          Página {pageSafe} de {totalPages} — {total} registro(s)
        </span>
        <div className="li-pager-controls">
          <button className="li-btn" disabled={pageSafe <= 1} onClick={() => setPage(1)}>⏮️</button>
          <button className="li-btn" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>◀️</button>
          <button className="li-btn" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>▶️</button>
          <button className="li-btn" disabled={pageSafe >= totalPages} onClick={() => setPage(totalPages)}>⏭️</button>
        </div>
      </div>

      {/* ===== Modal de edición ===== */}
      {showEditModal && (
        <div
          className="li-modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e)=>{ if(e.target.classList.contains('li-modal-overlay')) closeEditModal(); }}
        >
          <div className="li-modal" onMouseDown={(e)=>e.stopPropagation()}>
            <div className="li-modal-header">
              <h3>Editar Mueble</h3>
              <button className="li-modal-close" aria-label="Cerrar" onClick={closeEditModal}>×</button>
            </div>
            <div className="li-modal-body">
              <label className="li-field">
                <span>Nombre</span>
                <input
                  className="li-input"
                  value={editForm.nombre}
                  onChange={(e) => setEditForm((p) => ({ ...p, nombre: e.target.value }))}
                  autoFocus
                />
              </label>

              <label className="li-field">
                <span>Tipo</span>
                <select
                  className="li-select"
                  value={editForm.tipo}
                  onChange={(e) => setEditForm((p) => ({ ...p, tipo: e.target.value }))}
                >
                  <option value="">Seleccione…</option>
                  {TIPO_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="li-field">
                <span>Ubicación</span>
                <input
                  className="li-input"
                  value={editForm.ubicacion}
                  onChange={(e) => setEditForm((p) => ({ ...p, ubicacion: e.target.value }))}
                />
              </label>

              <label className="li-field">
                <span>Cantidad total</span>
                <input
                  className="li-input"
                  type="number"
                  min="0"
                  value={editForm.cantidad_total}
                  onChange={(e) => setEditForm((p) => ({ ...p, cantidad_total: e.target.value.replace(/[^\d]/g, '') }))}
                />
              </label>

              <label className="li-field">
                <span>Estado</span>
                <select
                  className="li-select"
                  value={editForm.estado_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, estado_id: Number(e.target.value) }))}
                >
                  {ESTADO_OPTIONS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="li-modal-actions">
              <button className="li-btn" onClick={closeEditModal}>Cancelar</button>
              <button className="li-btn ok" onClick={saveEdit}>💾 Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Confirmar Eliminación ===== */}
      {confirmDel.open && (
        <div
          className="li-modal-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e)=>{ if(e.target.classList.contains('li-modal-overlay')) closeAskDel(); }}
        >
          <div className="li-modal li-modal--sm" onMouseDown={(e)=>e.stopPropagation()}>
            <div className="li-modal-header">
              <h3>Confirmar eliminación</h3>
              <button className="li-modal-close" aria-label="Cerrar" onClick={closeAskDel}>×</button>
            </div>
            <div className="li-modal-body" style={{gridTemplateColumns:'1fr'}}>
              <p>
                ¿Eliminar el mueble <strong>{confirmDel.nombre || `#${confirmDel.id}`}</strong>?
                <br />
                <small>Esta acción no se puede deshacer.</small>
              </p>
            </div>
            <div className="li-modal-actions">
              <button className="li-btn" onClick={closeAskDel}>Cancelar</button>
              <button className="li-btn danger" onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}