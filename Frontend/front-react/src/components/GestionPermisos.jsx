// src/components/GestionPermisos.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/RegistrarPago.css';
import { getJSON, putJSON } from '../utils/api';

/* ====== Catálogo de módulos/recursos ======
   Estos IDs deben coincidir con lo que guarda tu backend.
*/
const MODULES = [
  {
    id: 'reservas',
    label: 'Reservas',
    children: [
      { id: 'reservas.crear', label: 'Crear reserva' },
      { id: 'reservas.listado', label: 'Ver listado' },
      { id: 'reservas.historial', label: 'Historial' },
      { id: 'reservas.calendario', label: 'Calendario' },
      { id: 'reservas.aprobacion', label: 'Aprobación (pend/ok/rech)' },
    ],
  },
  {
    id: 'espacios',
    label: 'Espacios y Muebles',
    children: [
      { id: 'espacios.crear-espacio', label: 'Crear espacio' },
      { id: 'espacios.crear-mueble', label: 'Crear mueble' },
      { id: 'espacios.listado-espacios', label: 'Listado de espacios' },
      { id: 'espacios.listado-muebles', label: 'Listado de muebles' },
      { id: 'espacios.disponibilidad', label: 'Disponibilidad' },
    ],
  },
  {
    id: 'pagos',
    label: 'Tarifas y Cobranzas',
    children: [
      { id: 'pagos.config', label: 'Configurar tarifas' },
      { id: 'pagos.registrar', label: 'Pagos realizados' },
      { id: 'pagos.historial', label: 'Historial de pagos' },
      { id: 'pagos.reporte', label: 'Reporte financiero' },
    ],
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    children: [
      { id: 'usuarios.listado', label: 'Listado' },
      { id: 'usuarios.crear', label: 'Crear usuario' },
      { id: 'usuarios.permisos', label: 'Gestionar permisos' },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes y Estadísticas',
    children: [
      { id: 'reportes.uso', label: 'Uso de espacios' },
      { id: 'reportes.usuarios', label: 'Usuarios' },
      { id: 'reportes.dashboard', label: 'Dashboard ejecutivo' },
    ],
  },
  {
    id: 'config',
    label: 'Configuración General',
    children: [
      { id: 'config.institucion', label: 'Datos institucionales' },
      { id: 'config.parametros', label: 'Parámetros' },
      { id: 'config.horarios', label: 'Horarios' },
      { id: 'config.seguridad', label: 'Seguridad' },
      { id: 'config.backup', label: 'Backup' },
    ],
  },
];

/* ===== Helpers ===== */
const flatIds = (tree) => {
  const out = [];
  for (const n of tree) {
    out.push(n.id);
    if (n.children) out.push(...flatIds(n.children));
  }
  return out;
};
const ALL_IDS = flatIds(MODULES);

// Filtra el árbol por término (en label o id)
function filterTree(nodes, term) {
  if (!term) return nodes;
  const t = term.toLowerCase();
  const walk = (arr) =>
    arr
      .map((n) => {
        const selfMatch =
          n.label.toLowerCase().includes(t) || n.id.toLowerCase().includes(t);
        if (n.children?.length) {
          const kids = walk(n.children).filter(Boolean);
          if (selfMatch || kids.length) return { ...n, children: kids };
          return null;
        }
        return selfMatch ? n : null;
      })
      .filter(Boolean);
  return walk(nodes);
}

function getUserFromLocalStorage() {
  try {
    const keys = ['auth', 'user', 'authUser'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const j = JSON.parse(raw);
      const user = j?.user || j?.usuario || j || null;
      if (user) return user;
    }
  } catch {}
  return null;
}

/* ========= Wrapper: decide qué renderizar SIN hooks condicionales ========= */
export default function GestionPermisos({ currentUser }) {
  const user = currentUser || getUserFromLocalStorage();
  const roleId = Number(user?.u_rol_id_rolu ?? user?.rol ?? user?.roleId) || null;
  const isAdmin = roleId === 1;

  if (!isAdmin) return <AccesoRestringido />;   // NO hay hooks aquí
  return <PermisosAdmin />;                     // Hooks viven dentro de este componente
}

/* ========= Vista acceso restringido (stateless) ========= */
function AccesoRestringido() {
  return (
    <div className="registrar-pago-container">
      <div className="pagina-header" style={{ marginBottom: 10 }}>
        <h2 className="titulo-pagina">🔑 Gestión de Permisos</h2>
      </div>
      <div
        className="cr-card"
        style={{
          padding: 16,
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: 12,
        }}
      >
        <div style={{ color: '#b45309', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 22 }}>⛔</span>
          <div>
            <strong>Acceso restringido.</strong>
            <div style={{ marginTop: 6 }}>
              Solo el rol <code>Administrador (id = 1)</code> puede administrar permisos.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========= Vista admin con TODOS los Hooks en tope ========= */
function PermisosAdmin() {
  const [tab, setTab] = useState('rol'); // 'rol' | 'usuario'
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [selRol, setSelRol] = useState('');
  const [selUsuario, setSelUsuario] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const [checked, setChecked] = useState(new Set());
  const [dirty, setDirty] = useState(false);
  const [heredaDeRol, setHeredaDeRol] = useState(false);

  const [search, setSearch] = useState('');
  const [expandAll, setExpandAll] = useState(true);

  const ignoreBeforeUnload = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (ignoreBeforeUnload.current) return;
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Cargar catálogos
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const rRoles = await getJSON('/api/usuarios/roles/lista').catch(() => ({ roles: [] }));
        setRoles(rRoles?.roles || []);
        const rUsers = await getJSON('/api/usuarios').catch(() => ({ usuarios: [] }));
        setUsuarios(rUsers?.usuarios || []);
        setBanner(null);
      } catch {
        setBanner({ type: 'error', text: 'No se pudieron cargar roles/usuarios' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Traer permisos actuales (rol/usuario)
  const cargarPermisos = async (tipo, id) => {
    if (!id) {
      setChecked(new Set());
      setHeredaDeRol(false);
      setDirty(false);
      return;
    }
    try {
      setLoading(true);
      const url = tipo === 'rol' ? `/api/permisos/rol/${id}` : `/api/permisos/usuario/${id}`;
      const data = await getJSON(url);
      const perms = Array.isArray(data?.permisos) ? data.permisos : [];
      const clean = perms.filter((p) => ALL_IDS.includes(p));
      setChecked(new Set(clean));
      setHeredaDeRol(Boolean(data?.heredaDeRol));
      setBanner(null);
      setDirty(false);
    } catch {
      setBanner({ type: 'error', text: 'No se pudieron cargar los permisos.' });
      setChecked(new Set());
      setHeredaDeRol(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'rol') cargarPermisos('rol', selRol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selRol]);

  useEffect(() => {
    if (tab === 'usuario') cargarPermisos('usuario', selUsuario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selUsuario]);

  // Mutadores
  const toggle = (id) => {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setDirty(true);
  };

  const setGroup = (node, value) => {
    const groupIds = flatIds([node]);
    setChecked((prev) => {
      const n = new Set(prev);
      for (const k of groupIds) value ? n.add(k) : n.delete(k);
      return n;
    });
    setDirty(true);
  };

  const setAll = (value, visibleOnlyIds) => {
    if (visibleOnlyIds?.length) {
      setChecked((prev) => {
        const n = new Set(prev);
        for (const id of visibleOnlyIds) value ? n.add(id) : n.delete(id);
        return n;
      });
    } else {
      setChecked(value ? new Set(ALL_IDS) : new Set());
    }
    setDirty(true);
  };

  // Guardar
  const guardar = async () => {
    try {
      setSaving(true);
      const payload = { permisos: Array.from(checked) };

      if (tab === 'rol') {
        if (!selRol) return setBanner({ type: 'error', text: 'Selecciona un rol.' });
        await putJSON(`/api/permisos/rol/${selRol}`, payload);
        setBanner({ type: 'ok', text: 'Permisos de rol guardados.' });
      } else {
        if (!selUsuario) return setBanner({ type: 'error', text: 'Selecciona un usuario.' });
        await putJSON(`/api/permisos/usuario/${selUsuario}`, payload);
        setBanner({ type: 'ok', text: 'Permisos del usuario guardados.' });
      }
      setDirty(false);
    } catch (e) {
      setBanner({ type: 'error', text: `No se pudo guardar: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  // Filtro/árbol
  const filteredTree = useMemo(() => filterTree(MODULES, search), [search]);
  const VISIBLE_IDS = useMemo(() => flatIds(filteredTree), [filteredTree]);

  const Tree = ({ nodes, level = 0 }) => (
    <ul className="perm-tree" style={{ display: 'block' }}>
      {nodes.map((n) => {
        const hasChildren = Array.isArray(n.children) && n.children.length > 0;
        const groupIds = flatIds([n]);
        const groupAllOn = groupIds.every((id) => checked.has(id));
        const groupSomeOn = !groupAllOn && groupIds.some((id) => checked.has(id));

        return (
          <li key={n.id} className="perm-item">
            <div className="perm-row">
              {hasChildren ? (
                <input
                  type="checkbox"
                  checked={groupAllOn}
                  ref={(el) => { if (el) el.indeterminate = groupSomeOn; }}
                  onChange={(e) => setGroup(n, e.target.checked)}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={checked.has(n.id)}
                  onChange={() => toggle(n.id)}
                />
              )}
              <span className="perm-label">{n.label}</span>
              <code className="perm-code">{n.id}</code>
            </div>
            {hasChildren && <Tree nodes={n.children} level={level + 1} />}
          </li>
        );
      })}
    </ul>
  );

  const totalSeleccionados = checked.size;
  const totalDisponibles = ALL_IDS.length;
  const totalVisibles = VISIBLE_IDS.length;
  const visiblesSeleccionados = Array.from(checked).filter((id) => VISIBLE_IDS.includes(id)).length;

  const safeSetTab = (next) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas continuar y descartarlos?')) return;
    setTab(next);
    setSearch('');
    setChecked(new Set());
    setHeredaDeRol(false);
    setBanner(null);
    setDirty(false);
  };

  const safeSetSel = (setter) => (e) => {
    const v = e.target.value;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas continuar y descartarlos?')) {
      e.target.value = tab === 'rol' ? selRol : selUsuario;
      return;
    }
    setter(v);
    setSearch('');
    setBanner(null);
  };

  // ===== UI =====
  return (
    <div className="registrar-pago-container">
      <div className="pagina-header" style={{ marginBottom: 10 }}>
        <h2 className="titulo-pagina">🔑 Gestión de Permisos</h2>
        <p className="descripcion-pagina">Solo el Administrador puede administrar permisos.</p>
      </div>

      {banner && (
        <div
          className="mensaje"
          style={{
            marginBottom: 12,
            background: banner.type === 'error' ? '#fdecea' : '#e7f6ee',
            color: banner.type === 'error' ? '#b42318' : '#027a48',
            border: '1px solid',
            borderColor: banner.type === 'error' ? '#f5c2c7' : '#a6e3c5',
            padding: '10px 12px',
            borderRadius: 10,
          }}
        >
          {banner.text}
        </div>
      )}

      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className={`btn-registrar-pago ${tab === 'rol' ? 'ok' : ''}`} onClick={() => safeSetTab('rol')}>Por Rol</button>
        <button className={`btn-registrar-pago ${tab === 'usuario' ? 'ok' : ''}`} onClick={() => safeSetTab('usuario')}>Por Usuario</button>
      </div>

      <div className="filtros-reporte" style={{ gridTemplateColumns: '1fr auto auto' }}>
        {tab === 'rol' ? (
          <>
            <select value={selRol} onChange={safeSetSel(setSelRol)}>
              <option value="">— Selecciona un rol —</option>
              {roles.map((r) => (
                <option key={r.id_rolu} value={r.id_rolu}>
                  {r.ur_nombre || `Rol #${r.id_rolu}`}
                </option>
              ))}
            </select>
            <button className="btn-registrar-pago" onClick={() => cargarPermisos('rol', selRol)} disabled={!selRol}>
              Cargar
            </button>
          </>
        ) : (
          <>
            <select value={selUsuario} onChange={safeSetSel(setSelUsuario)}>
              <option value="">— Selecciona un usuario —</option>
              {usuarios.map((u) => (
                <option key={u.id_usuario} value={u.id_usuario}>
                  {u.u_usuario} — {u.u_nombre || ''} {u.u_apellido || ''}
                </option>
              ))}
            </select>
            <button className="btn-registrar-pago" onClick={() => cargarPermisos('usuario', selUsuario)} disabled={!selUsuario}>
              Cargar
            </button>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <input
            type="text"
            placeholder="🔎 Buscar permiso (id o nombre)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <button className="btn-registrar-pago" onClick={() => setAll(true, VISIBLE_IDS)} disabled={loading || (!selRol && !selUsuario)}>Marcar todo</button>
          <button className="btn-registrar-pago" onClick={() => setAll(false, VISIBLE_IDS)} disabled={loading || (!selRol && !selUsuario)}>Desmarcar todo</button>
          <button className="btn-registrar-pago" onClick={() => setExpandAll((v) => !v)} disabled={filteredTree.length === 0}>
            {expandAll ? 'Colapsar' : 'Expandir'}
          </button>
        </div>
      </div>

      {(tab === 'usuario' && heredaDeRol) && (
        <div
          className="mensaje"
          style={{
            marginBottom: 10,
            background: '#eff6ff',
            color: '#1e40af',
            border: '1px solid #bfdbfe',
            padding: '10px 12px',
            borderRadius: 10,
          }}
        >
          ℹ️ Este usuario hereda permisos de su rol. Los cambios aquí <strong>sobrescriben</strong> esa herencia.
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, color: '#64748b', marginBottom: 8, flexWrap: 'wrap' }}>
        <span><strong>Seleccionados:</strong> {totalSeleccionados} / {totalDisponibles}</span>
        {search && <span><strong>Visibles (filtro):</strong> {visiblesSeleccionados} / {totalVisibles}</span>}
        {dirty && <span style={{ color: '#b45309' }}>✎ Cambios sin guardar</span>}
      </div>

      <div className="cr-card" style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>Cargando…</div>
        ) : (tab === 'rol' && !selRol) || (tab === 'usuario' && !selUsuario) ? (
          <div style={{ color: '#64748b' }}>Selecciona {tab === 'rol' ? 'un rol' : 'un usuario'} para editar permisos.</div>
        ) : filteredTree.length === 0 ? (
          <div style={{ color: '#64748b' }}>No hay coincidencias para “{search}”.</div>
        ) : (
          <Tree nodes={filteredTree} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
        <button
          className="btn-registrar-pago"
          onClick={() => {
            if (!dirty || window.confirm('Descartar cambios sin guardar?')) {
              setSearch('');
              setChecked(new Set());
              setDirty(false);
              setBanner(null);
            }
          }}
        >
          Cancelar
        </button>
        <button
          className="btn-registrar-pago ok"
          onClick={guardar}
          disabled={saving || loading || (tab === 'rol' ? !selRol : !selUsuario)}
        >
          {saving ? 'Guardando…' : 'Guardar permisos'}
        </button>
      </div>

      <style>{`
        .perm-tree { list-style: none; margin: 0; padding-left: 16px; }
        .perm-item { margin: 6px 0; }
        .perm-row { display: flex; align-items: center; gap: 10px; }
        .perm-label { font-weight: 600; }
        .perm-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px; opacity: .6; background:#f8fafc; padding:2px 6px; border-radius:8px;
          border:1px solid #e5e7eb;
        }
      `}</style>
    </div>
  );
}
