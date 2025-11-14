// src/components/ListadoEspacios.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/ListadoEspacios.css';

/* ===== Base URL dinámica (sin localhost) ===== */
const BASE_URL = (() => {
  const env = (process.env.REACT_APP_API_URL || '').trim();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location;
    if (port === '3000') return `${protocol}//${hostname}:5000`; // dev CRA → API :5000
    return origin.replace(/\/$/, ''); // prod: mismo host
  }
  return 'http://localhost:5000';
})();
const api = (path) => `${BASE_URL}${path}`;

const getToken = () => {
  const keys = ['auth', 'user', 'authUser'];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      if (parsed.access_token) return parsed.access_token;
      if (parsed.token) return parsed.token;
      if (parsed.jwt) return parsed.jwt;
      if (parsed?.user?.token) return parsed.user.token;
    } catch {}
  }
  return localStorage.getItem('token') || localStorage.getItem('jwt') || null;
};
const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/* === Constantes === */
const ESTADOS = {
  1: { label: 'Activo', className: 'ls-badge ok' },
  7: { label: 'Inactivo', className: 'ls-badge off' }, // 7 = Inactivo
};

const TIPOS_ESPACIO = [
  'Espacios Recreativos',
  'Espacios Comunales',
  'Áreas Verdes',
  'Instalaciones Educativas',
  'Espacios para Eventos',
];

const slug = (s) =>
  (s || 'otro')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/* === Componente === */
function ListadoEspacios() {
  const [espacios, setEspacios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [filtros, setFiltros] = useState({ q: '', tipo: 'Todos', estado: 'Todos' });

  /* Modal confirmar eliminación */
  const [confirmDel, setConfirmDel] = useState({ open: false, id: null, nombre: '' });

  /* Modal edición */
  const [editModal, setEditModal] = useState({
    open: false,
    id: null,
    form: { nombre: '', tipo: '', ubicacion: '', estado_id: '1' },
  });

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await fetch(api('/api/catalogos/espacios'), {
        headers: { ...authHeaders() },
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const err = ct.includes('application/json') ? await res.json() : {};
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      const data = ct.includes('application/json') ? await res.json() : [];
      setEspacios(Array.isArray(data) ? data : []);
      setMsg('');
    } catch (e) {
      setMsg('❌ Error cargando espacios');
      setEspacios([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const tipos = useMemo(() => {
    const t = Array.from(new Set(espacios.map(e => e.tipo).filter(Boolean)));
    return t.length ? ['Todos', ...t] : ['Todos'];
  }, [espacios]);

  const filtrados = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    return espacios.filter(e => {
      const byQ =
        !q ||
        `${e.id}`.includes(q) ||
        (e.nombre || '').toLowerCase().includes(q) ||
        (e.ubicacion || '').toLowerCase().includes(q) ||
        (e.tipo || '').toLowerCase().includes(q);
      const byTipo = filtros.tipo === 'Todos' || e.tipo === filtros.tipo;
      const byEstado = filtros.estado === 'Todos' || String(e.estado_id) === String(filtros.estado);
      return byQ && byTipo && byEstado;
    });
  }, [espacios, filtros]);

  /* ====== Confirmación de eliminación (modal) ====== */
  const openAskDel = (espacio) => {
    setConfirmDel({ open: true, id: espacio.id, nombre: espacio.nombre || '' });
  };
  const closeAskDel = () => setConfirmDel({ open: false, id: null, nombre: '' });

  const confirmDelete = async () => {
    if (!confirmDel.id) return;
    try {
      const res = await fetch(api(`/api/catalogos/espacios/${confirmDel.id}`), {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const data = ct.includes('application/json') ? await res.json() : {};
        setMsg('❌ ' + (data?.error || 'No se pudo eliminar'));
      } else {
        setMsg('✅ Espacio eliminado');
        cargar();
      }
    } catch {
      setMsg('❌ Error de conexión al eliminar');
    } finally {
      closeAskDel();
    }
  };

  /* cerrar con ESC para ambos modales */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (confirmDel.open) closeAskDel();
        if (editModal.open) setEditModal(m => ({ ...m, open: false }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDel.open, editModal.open]);

  /* ====== Edición (modal) ====== */
  const openEdit = (e) => {
    setEditModal({
      open: true,
      id: e.id,
      form: {
        nombre: e.nombre || '',
        tipo: e.tipo || '',
        ubicacion: e.ubicacion || '',
        estado_id: String(e.estado_id || '1'),
      },
    });
  };
  const closeEdit = () =>
    setEditModal({
      open: false,
      id: null,
      form: { nombre: '', tipo: '', ubicacion: '', estado_id: '1' },
    });

  const onEditChange = (ev) => {
    const { name, value } = ev.target;
    if (name === 'nombre' || name === 'ubicacion') {
      const limpio = value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 .,#()/_-]/g, '');
      setEditModal(m => ({ ...m, form: { ...m.form, [name]: limpio } }));
      return;
    }
    setEditModal(m => ({ ...m, form: { ...m.form, [name]: value } }));
  };

  const submitEdit = async (ev) => {
    ev.preventDefault();
    const f = editModal.form;
    if (!f.nombre || !f.tipo || !f.ubicacion) {
      setMsg('❌ Completa nombre, tipo y ubicación');
      return;
    }
    try {
      const res = await fetch(api(`/api/catalogos/espacios/${editModal.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          nombre: f.nombre.trim(),
          tipo: f.tipo,
          ubicacion: f.ubicacion.trim(),
          estado_id: Number(f.estado_id),
        }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const data = ct.includes('application/json') ? await res.json() : {};
        setMsg('❌ ' + (data?.error || 'No se pudo actualizar'));
      } else {
        setMsg('✅ Espacio actualizado');
        closeEdit();
        cargar();
      }
    } catch {
      setMsg('❌ Error de conexión al actualizar');
    }
  };

  return (
    <div className="ls-container">
      <h2 className="ls-title">🏛️ Espacios Públicos</h2>

      {msg && <div className={`ls-msg ${msg.startsWith('✅') ? 'ok' : 'err'}`}>{msg}</div>}

      <div className="ls-filtros">
        <div className="ls-fg">
          <label>Buscar</label>
          <input
            className="ls-input"
            placeholder="Nombre, ubicación o ID…"
            value={filtros.q}
            onChange={(e) => setFiltros((p) => ({ ...p, q: e.target.value }))}
          />
        </div>

        <div className="ls-fg">
          <label>Tipo</label>
          <select
            className="ls-select"
            value={filtros.tipo}
            onChange={(e) => setFiltros((p) => ({ ...p, tipo: e.target.value }))}
          >
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="ls-fg">
          <label>Estado</label>
          <select
            className="ls-select"
            value={filtros.estado}
            onChange={(e) => setFiltros((p) => ({ ...p, estado: e.target.value }))}
          >
            <option value="Todos">Todos</option>
            <option value="1">Activo</option>
            <option value="7">Inactivo</option>
          </select>
        </div>

        <div className="ls-actions ls-actions--toolbar">
          <button className="ls-btn" onClick={cargar}>Recargar</button>
          <button
            className="ls-btn warn"
            onClick={() => setFiltros({ q: '', tipo: 'Todos', estado: 'Todos' })}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="ls-tablewrap">
        <table className="ls-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th className="ls-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="ls-empty">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan="6" className="ls-empty">No hay espacios</td></tr>
            ) : (
              filtrados.map((e) => {
                const estado = ESTADOS[e.estado_id] || ESTADOS[1];
                const tipoClass = 'tipo-' + slug(e.tipo);
                return (
                  <tr key={e.id}>
                    <td>#{e.id}</td>
                    <td>{e.nombre}</td>
                    <td><span className={`ls-chip ${tipoClass}`}>{e.tipo || '—'}</span></td>
                    <td>{e.ubicacion || '—'}</td>
                    <td><span className={estado.className}>{estado.label}</span></td>
                    <td className="ls-right">
                      <div className="ls-actions">
                        <button className="ls-btn warn" title="Editar" onClick={() => openEdit(e)}>✏️</button>
                        <button className="ls-btn danger" title="Eliminar" onClick={() => openAskDel(e)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Modal Confirmar eliminación ===== */}
      {confirmDel.open && (
        <div className="ls-modal-backdrop" onClick={closeAskDel} role="presentation">
          <div
            className="ls-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ls-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ls-modal-header">
              <h3 id="ls-modal-title">Confirmar eliminación</h3>
              <button className="ls-modal-close" onClick={closeAskDel} aria-label="Cerrar">×</button>
            </header>
            <div className="ls-modal-body">
              <p>
                ¿Eliminar el espacio <strong>{confirmDel.nombre || `#${confirmDel.id}`}</strong>?<br/>
                <small>Esta acción no se puede deshacer.</small>
              </p>
            </div>
            <div className="ls-modal-actions">
              <button className="ls-btn" onClick={closeAskDel}>Cancelar</button>
              <button className="ls-btn danger" onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Editar ===== */}
      {editModal.open && (
        <div className="ls-modal-backdrop" onClick={closeEdit} role="presentation">
          <div
            className="ls-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ls-modal-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ls-modal-header">
              <h3 id="ls-modal-edit-title">Editar espacio</h3>
              <button className="ls-modal-close" onClick={closeEdit} aria-label="Cerrar">×</button>
            </header>
            <form className="ls-modal-form" onSubmit={submitEdit}>
              <div className="ls-form-grid">
                <div className="ls-form-group">
                  <label>Nombre</label>
                  <input
                    name="nombre"
                    value={editModal.form.nombre}
                    onChange={onEditChange}
                    required
                    minLength={3}
                    maxLength={100}
                  />
                </div>

                <div className="ls-form-group">
                  <label>Tipo</label>
                  <select
                    name="tipo"
                    value={editModal.form.tipo}
                    onChange={onEditChange}
                    required
                  >
                    <option value="">-- Selecciona --</option>
                    {TIPOS_ESPACIO.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="ls-form-group ls-form-group--full">
                  <label>Ubicación</label>
                  <input
                    name="ubicacion"
                    value={editModal.form.ubicacion}
                    onChange={onEditChange}
                    required
                    minLength={3}
                    maxLength={120}
                  />
                </div>

                <div className="ls-form-group">
                  <label>Estado</label>
                  <select
                    name="estado_id"
                    value={editModal.form.estado_id}
                    onChange={onEditChange}
                  >
                    <option value="1">Activo</option>
                    <option value="7">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="ls-modal-actions">
                <button type="button" className="ls-btn" onClick={closeEdit}>Cancelar</button>
                <button type="submit" className="ls-btn ok">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListadoEspacios;
