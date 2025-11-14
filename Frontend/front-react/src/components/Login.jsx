// src/components/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Login.css';
import { postJSON } from '../utils/api';

export default function Login({ onSuccess }) {
  const navigate = useNavigate();
  const { login } = useAuth();

  // === Modo: login normal vs cambio de contraseña ===
  const [isResetMode, setIsResetMode] = useState(false);

  // === Estado login normal ===
  const [usuario, setUsuario] = useState('');
  const [contrasenia, setContrasenia] = useState('');
  const [verPass, setVerPass] = useState(false);

  // === Estado cambio de contraseña (solo admin) ===
  const [resetUsuario, setResetUsuario] = useState('');
  const [resetNueva, setResetNueva] = useState('');
  const [resetConfirma, setResetConfirma] = useState('');
  const [adminPwd, setAdminPwd] = useState('');

  // === Mensajes y loading compartidos ===
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // ---- LOGIN NORMAL ----
  async function handleSubmit(e) {
    e.preventDefault();
    if (isResetMode) return;

    setError('');
    setOkMsg('');
    setLoading(true);
    try {
      await login({ usuario: usuario.trim(), contrasenia });
      if (onSuccess) onSuccess();
      else navigate('/dashboard');
    } catch (err) {
      setError(err?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
      // por seguridad, limpia el campo de contraseña
      setContrasenia('');
    }
  }

  // ---- CAMBIO DE CONTRASEÑA (ADMIN) ----
  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');
    setOkMsg('');

    if (!resetUsuario.trim() || !resetNueva || !resetConfirma || !adminPwd) {
      setError('Todos los campos son obligatorios');
      return;
    }
    if (resetNueva !== resetConfirma) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }
    if (resetNueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      setLoading(true);
      const data = await postJSON('/api/auth/admin-reset-password', {
        targetUsuario: resetUsuario.trim(),
        nuevaContrasenia: resetNueva,
        adminContrasenia: adminPwd,
      });

      setOkMsg(data?.mensaje || 'Contraseña actualizada correctamente');
      // limpiar campos sensibles
      setResetNueva('');
      setResetConfirma('');
      setAdminPwd('');
    } catch (err) {
      setError(err?.message || 'No se pudo cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  // ---- Cambiar entre modos ----
  const toggleMode = () => {
    if (loading) return; // evita cambios de modo mientras procesa
    setIsResetMode((m) => !m);
    setError('');
    setOkMsg('');
    // limpiar formularios al cambiar de modo
    setUsuario('');
    setContrasenia('');
    setResetUsuario('');
    setResetNueva('');
    setResetConfirma('');
    setAdminPwd('');
  };

  const loginDisabled = loading || !usuario.trim() || !contrasenia;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-header">
          <h2>{isResetMode ? 'Cambiar contraseña (solo admin)' : 'Iniciar sesión'}</h2>
          <p className="muted">Sistema de Gestión San José Pinula</p>
        </div>

        {error && (
          <div className="login-alert" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        {okMsg && (
          <div
            className="login-alert"
            style={{ backgroundColor: '#dcfce7', color: '#166534' }}
            role="status"
            aria-live="polite"
          >
            {okMsg}
          </div>
        )}

        {/* ==== FORMULARIO LOGIN NORMAL ==== */}
        {!isResetMode && (
          <form onSubmit={handleSubmit} className="login-form">
            <label className="lbl">Usuario</label>
            <input
              className="inp"
              placeholder="usuario.sistema"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
            />

            <label className="lbl">Contraseña</label>
            <div className="pass-row">
              <input
                className="inp"
                type={verPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={contrasenia}
                onChange={(e) => setContrasenia(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="btn-eye"
                onClick={() => setVerPass((v) => !v)}
                aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {verPass ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>

            <button className="btn-login" type="submit" disabled={loginDisabled}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        )}

        {/* ==== FORMULARIO CAMBIO CONTRASEÑA (ADMIN) ==== */}
        {isResetMode && (
          <form onSubmit={handleResetPassword} className="login-form">
            <label className="lbl">Usuario a cambiar</label>
            <input
              className="inp"
              placeholder="usuario_del_sistema"
              value={resetUsuario}
              onChange={(e) => setResetUsuario(e.target.value)}
              required
              minLength={3}
            />

            <label className="lbl">Nueva contraseña</label>
            <input
              className="inp"
              type="password"
              placeholder="Nueva contraseña"
              value={resetNueva}
              onChange={(e) => setResetNueva(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />

            <label className="lbl">Confirmar nueva contraseña</label>
            <input
              className="inp"
              type="password"
              placeholder="Repite la nueva contraseña"
              value={resetConfirma}
              onChange={(e) => setResetConfirma(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />

            <label className="lbl">Contraseña del administrador</label>
            <input
              className="inp"
              type="password"
              placeholder="Contraseña del admin"
              value={adminPwd}
              onChange={(e) => setAdminPwd(e.target.value)}
              required
              autoComplete="current-password"
            />

            <button className="btn-login" type="submit" disabled={loading}>
              {loading ? 'Procesando…' : 'Cambiar contraseña'}
            </button>

            <p className="demo-tip">
              Solo usuarios con acceso a la contraseña del administrador pueden realizar este cambio.
            </p>
          </form>
        )}

        {/* Toggle entre modos */}
        <button
          type="button"
          className="btn-link-switch"
          onClick={toggleMode}
          style={{
            marginTop: '16px',
            background: 'none',
            border: 'none',
            color: '#2563eb',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontSize: '14px',
          }}
        >
          {isResetMode
            ? '← Volver a iniciar sesión'
            : 'Cambiar contraseña de un usuario (solo admin)'}
        </button>
      </div>
    </div>
  );
}
