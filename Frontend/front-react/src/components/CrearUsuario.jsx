// src/components/CrearUsuario.jsx
import React, { useEffect, useState } from 'react';
import { getJSON, postJSON } from '../utils/api';
import '../styles/CrearUsuario.css';

export default function CrearUsuario() {
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const FALLBACK_ROLES = [
    { id_rolu: 1, ur_nombre: 'Administrador' },
    { id_rolu: 2, ur_nombre: 'Gestor' },
    { id_rolu: 3, ur_nombre: 'Aprobador' },
    { id_rolu: 5, ur_nombre: 'Recepción' },
    { id_rolu: 6, ur_nombre: 'Usuario' },
  ];

  const [formData, setFormData] = useState({
    usuario: '',
    nombre: '',
    apellido: '',
    correo: '',
    contrasenia: '',
    confirmarContrasenia: '',
    rol: '6',      // ← Usuario por defecto (coherente con tu backend)
    estado: '1',   // ← 1 = Activo (7 = Inactivo)
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [mostrarContrasenia, setMostrarContrasenia] = useState(false);

  // Cargar roles desde el backend (con fallback)
  useEffect(() => {
    (async () => {
      try {
        setLoadingRoles(true);
        const data = await getJSON('/api/usuarios/roles/lista');
        const list = Array.isArray(data?.roles) ? data.roles : [];
        const finalList = list.length ? list : FALLBACK_ROLES;
        setRoles(finalList);

        // Ajusta el rol seleccionado si el actual no existe en la lista
        const existe = finalList.some(r => String(r.id_rolu) === String(formData.rol));
        if (!existe) {
          setFormData(prev => ({ ...prev, rol: String(finalList[0]?.id_rolu || '6') }));
        }
      } catch {
        setRoles(FALLBACK_ROLES);
        if (!FALLBACK_ROLES.some(r => String(r.id_rolu) === String(formData.rol))) {
          setFormData(prev => ({ ...prev, rol: String(FALLBACK_ROLES[0].id_rolu) }));
        }
      } finally {
        setLoadingRoles(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const validarFormulario = () => {
    if (!formData.usuario.trim()) {
      setError('El nombre de usuario es requerido');
      return false;
    }
    if (formData.usuario.length < 3) {
      setError('El usuario debe tener al menos 3 caracteres');
      return false;
    }
    if (!formData.nombre.trim()) {
      setError('El nombre es requerido');
      return false;
    }
    if (!formData.contrasenia) {
      setError('La contraseña es requerida');
      return false;
    }
    if (formData.contrasenia.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return false;
    }
    if (formData.contrasenia !== formData.confirmarContrasenia) {
      setError('Las contraseñas no coinciden');
      return false;
    }
    if (formData.correo && !formData.correo.includes('@')) {
      setError('El correo electrónico no es válido');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setExito('');

    if (!validarFormulario()) return;

    try {
      setLoading(true);
      const payload = {
        usuario: formData.usuario.trim(),
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        correo: formData.correo.trim() || null,
        contrasenia: formData.contrasenia,
        rol: parseInt(formData.rol, 10),
        estado: parseInt(formData.estado, 10), // 1 o 7
      };

      await postJSON('/api/usuarios', payload);

      setExito('✅ Usuario creado exitosamente');

      // Limpiar formulario
      setFormData({
        usuario: '',
        nombre: '',
        apellido: '',
        correo: '',
        contrasenia: '',
        confirmarContrasenia: '',
        rol: roles.length ? String(roles[0].id_rolu) : '6',
        estado: '1',
      });

      setTimeout(() => setExito(''), 3000);
    } catch (err) {
      setError('❌ Error al crear usuario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLimpiar = () => {
    setFormData({
      usuario: '',
      nombre: '',
      apellido: '',
      correo: '',
      contrasenia: '',
      confirmarContrasenia: '',
      rol: roles.length ? String(roles[0].id_rolu) : '6',
      estado: '1',
    });
    setError('');
    setExito('');
  };

  return (
    <div className="formulario-container">
      <div className="formulario-header">
        <h2>➕ Crear Nuevo Usuario</h2>
        <p className="subtitulo">Ingresa los datos del nuevo usuario del sistema</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {exito && <div className="alert alert-success">{exito}</div>}

      <form onSubmit={handleSubmit} className="formulario">
        <div className="form-grid">
          {/* Usuario */}
          <div className="form-group">
            <label className="form-label required">👤 Nombre de Usuario</label>
            <input
              type="text"
              name="usuario"
              className="form-input"
              placeholder="Ej: jperez"
              value={formData.usuario}
              onChange={handleChange}
              required
            />
            <small className="form-hint">Mínimo 3 caracteres, sin espacios</small>
          </div>

          {/* Rol (dinámico) */}
          <div className="form-group">
            <label className="form-label required">🔑 Rol del Usuario</label>
            <select
              name="rol"
              className="form-select"
              value={formData.rol}
              onChange={handleChange}
              required
              disabled={loadingRoles}
            >
              {loadingRoles ? (
                <option value="">Cargando roles…</option>
              ) : (
                roles.map(r => (
                  <option key={r.id_rolu} value={String(r.id_rolu)}>
                    {r.ur_nombre || `Rol #${r.id_rolu}`}
                  </option>
                ))
              )}
            </select>
            <small className="form-hint">
            </small>
          </div>

          {/* Estado */}
          <div className="form-group">
            <label className="form-label required">📌 Estado</label>
            <select
              name="estado"
              className="form-select"
              value={formData.estado}
              onChange={handleChange}
              required
            >
              <option value="1">Activo</option>
              <option value="7">Inactivo</option>
            </select>
          </div>

          {/* Nombre */}
          <div className="form-group">
            <label className="form-label required">📝 Nombre</label>
            <input
              type="text"
              name="nombre"
              className="form-input"
              placeholder="Ej: Juan"
              value={formData.nombre}
              onChange={handleChange}
              required
            />
          </div>

          {/* Apellido */}
          <div className="form-group">
            <label className="form-label">📝 Apellido</label>
            <input
              type="text"
              name="apellido"
              className="form-input"
              placeholder="Ej: Pérez"
              value={formData.apellido}
              onChange={handleChange}
            />
          </div>

          {/* Correo */}
          <div className="form-group form-group-full">
            <label className="form-label">📧 Correo Electrónico</label>
            <input
              type="email"
              name="correo"
              className="form-input"
              placeholder="usuario@ejemplo.com"
              value={formData.correo}
              onChange={handleChange}
            />
          </div>

          {/* Contraseña */}
          <div className="form-group">
            <label className="form-label required">🔒 Contraseña</label>
            <div className="input-with-button">
              <input
                type={mostrarContrasenia ? 'text' : 'password'}
                name="contrasenia"
                className="form-input"
                placeholder="••••••••"
                value={formData.contrasenia}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setMostrarContrasenia(!mostrarContrasenia)}
              >
                {mostrarContrasenia ? '' : '👁️'}
              </button>
            </div>
            <small className="form-hint">Mínimo 6 caracteres</small>
          </div>

          {/* Confirmar Contraseña */}
          <div className="form-group">
            <label className="form-label required">🔒 Confirmar Contraseña</label>
            <input
              type={mostrarContrasenia ? 'text' : 'password'}
              name="confirmarContrasenia"
              className="form-input"
              placeholder="••••••••"
              value={formData.confirmarContrasenia}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '⏳ Creando...' : '✅ Crear Usuario'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLimpiar}
            disabled={loading}
          >
            🗑️ Limpiar
          </button>
        </div>
      </form>

      <div className="info-box">
        <h3>ℹ️ Información sobre Roles</h3>
        <ul>
          <li><strong>Administrador:</strong> Acceso total al sistema</li>
          <li><strong>Gestor:</strong> Gestiona reservas y espacios</li>
          <li><strong>Aprobador:</strong> Revisa y aprueba/rechaza solicitudes</li>
          <li><strong>Recepción:</strong> Apoya registros y consultas</li>
          <li><strong>Usuario:</strong> Acceso limitado a consultas</li>
        </ul>
      </div>
    </div>
  );
}
