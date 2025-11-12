// frontend/src/components/ListadoUsuarios.jsx
import React, { useState, useEffect } from 'react';
import { getJSON, deleteJSON, putJSON } from '../utils/api'; // ← usamos putJSON
import '../styles/ListadoUsuarios.css';

export default function ListadoUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const ESTADO = { ACTIVO: 1, INACTIVO: 7 };
  const ROLES = {
    1: 'Administrador',
    2: 'Gestor',
    3: 'Aprobador',
    5: 'Recepción',
    6: 'Usuario',
  };

  const isAdmin = (u) => Number(u?.u_rol_id_rolu) === 1;

  // —— lee id_estado o estado_id (tu SQL lo manda como estado_id)
  const isActivoSafe = (u) => {
    const n = Number(u?.id_estado ?? u?.estado_id);
    if (n === ESTADO.ACTIVO) return true;
    if (n === ESTADO.INACTIVO) return false;
    const nombre = String(u?.estado_nombre ?? '').toLowerCase().trim();
    if (nombre === 'activo') return true;
    if (nombre === 'inactivo') return false;
    return false;
  };

  const getEstadoBadge = (u) => {
    const activo = isActivoSafe(u);
    return activo
      ? <span className="badge badge-estado-activo">✓ Activo</span>
      : <span className="badge badge-estado-inactivo">✗ Inactivo</span>;
  };

  const getRolNombre = (rolId, rolNombreApi) => {
    if (rolNombreApi) return rolNombreApi;
    return ROLES[rolId] || `Rol #${rolId}`;
  };

  // Cargar
  useEffect(() => { cargarUsuarios(); }, []);
  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const data = await getJSON('/api/usuarios');
      setUsuarios(data.usuarios || []);
      setError('');
    } catch (err) {
      setError('Error al cargar usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Eliminar / Desactivar
  const handleEliminar = async (u) => {
    if (isAdmin(u)) {
      alert('No puedes desactivar/eliminar a un Administrador.');
      return;
    }
    if (!window.confirm('¿Eliminar este usuario?')) return;

    try {
      await deleteJSON(`/api/usuarios/${u.id_usuario}`);
      alert('Usuario eliminado exitosamente');
      cargarUsuarios();
    } catch (err) {
      alert('Error al desactivar usuario: ' + err.message);
    }
  };

  // Editar
  const openEdit = (u) => {
    const estadoInicial = String(u.id_estado ?? u.estado_id ?? '');
    setEditing({
      ...u,
      _isAdmin: isAdmin(u),
      edit_u_usuario: u.u_usuario || '',
      edit_id_estado: estadoInicial,                // "1" | "7"
      edit_u_rol_id_rolu: String(u.u_rol_id_rolu ?? ''), // "1" etc.
    });
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    if (editing._isAdmin) {
      alert('Los administradores no se pueden editar.');
      return;
    }
    const newUser = (editing.edit_u_usuario || '').trim();
    if (newUser.length < 3) {
      alert('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    const newEstado = Number(editing.edit_id_estado) || ESTADO.ACTIVO;
    let newRol = Number(editing.edit_u_rol_id_rolu) || 6;
    if (newRol === 1) {
      alert('No se permite asignar el rol Administrador.');
      return;
    }

    const body = {
      u_nombre: editing.u_nombre,
      u_apellido: editing.u_apellido,
      u_correo: editing.u_correo,
      u_rol_id_rolu: newRol,
      u_usuario: newUser,
      id_estado: newEstado,
    };

    try {
      setSaving(true);
      // ⬇️ ahora pega al backend correcto (http://localhost:5000)
      await putJSON(`/api/usuarios/${editing.id_usuario}`, body);
      closeEdit();
      await cargarUsuarios();
      alert('Usuario actualizado');
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtros
  const usuariosFiltrados = usuarios.filter((u) => {
    const q = busqueda.toLowerCase().trim();
    const cumpleBusqueda =
      q.length === 0 ||
      (u.u_usuario || '').toLowerCase().includes(q) ||
      (u.u_nombre || '').toLowerCase().includes(q) ||
      (u.u_apellido || '').toLowerCase().includes(q) ||
      (u.u_correo || '').toLowerCase().includes(q);

    const cumpleRol =
      filtroRol === 'todos' ||
      Number(u.u_rol_id_rolu) === parseInt(filtroRol, 10);

    const cumpleEstado =
      filtroEstado === 'todos' ||
      (filtroEstado === '1' && isActivoSafe(u)) ||
      (filtroEstado === '7' && !isActivoSafe(u));

    return cumpleBusqueda && cumpleRol && cumpleEstado;
  });

  if (loading) return <div className="loading">Cargando usuarios...</div>;

  return (
    <div className="tabla-container">
      <div className="tabla-header">
        <h2>👥 Listado de Usuarios</h2>
        <button className="btn btn-primary" onClick={cargarUsuarios}>🔄 Actualizar</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filtros-container">
        <input
          type="text"
          placeholder="🔍 Buscar por usuario, nombre, apellido o correo..."
          className="input-busqueda"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <select
          className="select-filtro"
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value)}
          title="Filtrar por rol"
        >
          <option value="todos">Todos los roles</option>
          <option value="1">Administrador</option>
          <option value="2">Gestor</option>
          <option value="3">Aprobador</option>
          <option value="5">Recepción</option>
          <option value="6">Usuario</option>
        </select>

        <select
          className="select-filtro"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          title="Filtrar por estado"
        >
          <option value="todos">Todos los estados</option>
          <option value="1">Activo</option>
          <option value="7">Inactivo</option>
        </select>
      </div>

      <div className="tabla-stats">
        <span>Total: {usuariosFiltrados.length} usuarios</span>
        <span>Activos: {usuariosFiltrados.filter(isActivoSafe).length}</span>
      </div>

      <div className="tabla-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Nombre Completo</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center">No se encontraron usuarios</td>
              </tr>
            ) : (
              usuariosFiltrados.map((u) => {
                const admin = isAdmin(u);
                return (
                  <tr key={u.id_usuario}>
                    <td>{u.id_usuario}</td>
                    <td><strong>{u.u_usuario}</strong></td>
                    <td>{`${u.u_nombre || ''} ${u.u_apellido || ''}`.trim() || 'N/A'}</td>
                    <td>{u.u_correo || 'N/A'}</td>
                    <td>
                      <span className={`badge badge-rol-${u.u_rol_id_rolu}`}>
                        {getRolNombre(u.u_rol_id_rolu, u.rol_nombre)}
                      </span>
                    </td>
                    <td>{getEstadoBadge(u)}</td>
                    <td>
                      <div className="acciones-btn">
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => openEdit(u)}
                          title={admin ? 'Los administradores no se pueden editar' : 'Editar'}
                          disabled={admin}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleEliminar(u)}
                          title={admin ? 'No se puede eliminar a un administrador' : 'Desactivar'}
                          disabled={admin}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="ls-modal-backdrop">
          <div className="ls-modal">
            <div className="ls-modal-header">
              <h3>Editar usuario #{editing.id_usuario}</h3>
              <button className="ls-modal-close" onClick={closeEdit}>✕</button>
            </div>
            <div className="ls-modal-body">
              {editing._isAdmin && (
                <p className="form-hint"><strong>Nota:</strong> Los administradores no se pueden editar.</p>
              )}

              <div className="ls-form-grid">
                <div className="ls-form-group">
                  <label className="form-label">Usuario</label>
                  <input
                    className="form-input"
                    value={editing.edit_u_usuario}
                    onChange={(e) => setEditing(s => ({ ...s, edit_u_usuario: e.target.value }))}
                    disabled={editing._isAdmin}
                    placeholder="usuario.sistema"
                  />
                </div>

                <div className="ls-form-group">
                  <label className="form-label">Estado</label>
                  <select
                    className="form-select"
                    value={editing.edit_id_estado}
                    onChange={(e) => setEditing(s => ({ ...s, edit_id_estado: e.target.value }))}
                    disabled={editing._isAdmin}
                  >
                    <option value="1">Activo</option>
                    <option value="7">Inactivo</option>
                  </select>
                </div>

                <div className="ls-form-group ls-form-group--full">
                  <label className="form-label">Rol</label>
                  <select
                    className="form-select"
                    value={editing.edit_u_rol_id_rolu}
                    onChange={(e) => setEditing(s => ({ ...s, edit_u_rol_id_rolu: e.target.value }))}
                    disabled={editing._isAdmin}
                  >
                    <option value="1" disabled>Administrador (bloqueado)</option>
                    <option value="2">Gestor</option>
                    <option value="3">Aprobador</option>
                    <option value="5">Recepción</option>
                    <option value="6">Usuario</option>
                  </select>
                  <div className="form-hint">No se permite asignar el rol Administrador.</div>
                </div>
              </div>
            </div>

            <div className="ls-modal-actions">
              <button className="ls-btn" onClick={closeEdit} disabled={saving}>Cancelar</button>
              <button className="ls-btn ok" onClick={saveEdit} disabled={saving || editing._isAdmin}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
