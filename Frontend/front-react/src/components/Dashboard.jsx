// src/components/Dashboard.jsx
import '../styles/Dashboard.css';
import React, { useState, useEffect, useRef } from 'react';
import bannerMunicipal from '../Imagenes/LogoSJP.jpg';

/* Vistas existentes */
import CrearReserva from './CrearReserva';
import CrearInmueble from './CrearInmueble';
import CrearEspacio from './CrearEspacio';
import ListadoReservas from './ListadoReservas';
import HistorialReservas from './HistorialReservas';
import ListadoInmuebles from './ListadoInmuebles';
import ListadoEspacios from './ListadoEspacios';
import CalendarioReservas from './CalendarioReservas';
import ConfigurarTarifas from './ConfigurarTarifas';
import AprobacionListado from './AprobacionListado';
import AprobacionEstadisticas from './AprobacionEstadisticas';
import VistaDisponibilidad from './VistaDisponibilidad';
import ReporteUso from './ReporteUso';
import ReporteUsuarios from './ReporteUsuarios';
import DashboardEjecutivo from './DashboardEjecutivo';

/* NUEVAS VISTAS DE PAGOS */
import RegistrarPago from './RegistrarPago';
import HistorialPagos from './HistorialPagos';
import ReporteFinanciero from './ReporteFinanciero';

/* === NUEVAS VISTAS DE USUARIOS === */
import ListadoUsuarios from './ListadoUsuarios';
import CrearUsuario from './CrearUsuario';
import GestionPermisos from './GestionPermisos';

import { getJSON } from '../utils/api';

/* =========================
   Helpers Auth/Permisos
   ========================= */
function getCurrentUser() {
  try {
    const keys = ['auth', 'user', 'authUser'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const j = JSON.parse(raw);
      const u = j?.user || j?.usuario || j || null;
      if (u) return u;
    }
  } catch {}
  return null;
}

function NoPermiso() {
  return (
    <div
      style={{
        padding: 24,
        border: '1px solid #fee2e2',
        background: '#fef2f2',
        color: '#b91c1c',
        borderRadius: 12,
      }}
    >
      ❌ No tienes permiso para acceder a esta sección.
    </div>
  );
}

function Dashboard() {
  /* ======= Estado UI general ======= */
  const [openMenu, setOpenMenu] = useState(null);
  const [activeView, setActiveView] = useState(null);
  const [notificaciones, setNotificaciones] = useState([]);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [mostrarMenuUsuario, setMostrarMenuUsuario] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // 🟢 NUEVO: estado para menú lateral en móvil
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const sidebarRef = useRef();
  const notificacionesRef = useRef();
  const usuarioRef = useRef();

  /* ======= Estado Auth/Permisos ======= */
  const [me, setMe] = useState(() => getCurrentUser());
  const [perms, setPerms] = useState(new Set());
  const isAdmin = Number(me?.u_rol_id_rolu ?? me?.rol ?? me?.roleId) === 1;

  useEffect(() => {
    // Cargar permisos del usuario logueado
    const id = me?.id_usuario || me?.id || null;
    if (!id) return;

    (async () => {
      try {
        const data = await getJSON(`/api/permisos/usuario/${id}`);
        const arr = Array.isArray(data?.permisos) ? data.permisos : [];
        setPerms(new Set(arr));
      } catch (e) {
        console.warn('No se pudieron cargar permisos del usuario actual', e);
        setPerms(new Set());
      }
    })();
  }, [me]);

  const can = (perm) => {
    if (isAdmin) return true; // Admin tiene todo
    if (!perm) return true; // si no se exige permiso
    return perms.has(perm);
  };

  const go = (view, requiredPerm) => {
    if (!can(requiredPerm)) {
      alert('❌ No tienes permiso para acceder a esta opción.');
      return;
    }
    setActiveView(view);
    // 🟢 Al navegar, en móvil cerramos el sidebar
    setIsSidebarOpen(false);
  };

  /* ======= Notificaciones (demo) ======= */
  useEffect(() => {
    const notificacionesSimuladas = [
      {
        id: 1,
        tipo: 'reserva',
        mensaje: 'Nueva reserva pendiente de aprobación',
        fecha: new Date(),
        leida: false,
      },
      {
        id: 2,
        tipo: 'mantenimiento',
        mensaje: 'Mantenimiento programado mañana',
        fecha: new Date(),
        leida: false,
      },
    ];
    setNotificaciones(notificacionesSimuladas);
  }, []);

  const toggleMenu = (menuId) =>
    setOpenMenu(openMenu === menuId ? null : menuId);
  const toggleNotificaciones = () =>
    setMostrarNotificaciones(!mostrarNotificaciones);
  const toggleMenuUsuario = () =>
    setMostrarMenuUsuario(!mostrarMenuUsuario);

  const handleClickOutside = (e) => {
    if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
      setOpenMenu(null);
      // 🟢 Si se hace click fuera en móvil, cerramos sidebar
      setIsSidebarOpen(false);
    }
    if (
      notificacionesRef.current &&
      !notificacionesRef.current.contains(e.target)
    )
      setMostrarNotificaciones(false);
    if (usuarioRef.current && !usuarioRef.current.contains(e.target))
      setMostrarMenuUsuario(false);
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const notificacionesNoLeidas = notificaciones.filter(
    (n) => !n.leida
  ).length;

  /* ======= Cerrar sesión (con redirección a /login) ======= */
  const cerrarSesion = async () => {
    try {
      const token =
        localStorage.getItem('token') ||
        JSON.parse(localStorage.getItem('auth') || '{}')?.token;
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      ['auth', 'user', 'authUser', 'token', 'jwt'].forEach((k) =>
        localStorage.removeItem(k)
      );
      sessionStorage.clear();

      setMostrarMenuUsuario(false);
      setActiveView(null);
      setOpenMenu(null);
      setMe(null);
      setPerms(new Set());

      window.location.replace('/login');
    }
  };

  const verPerfil = () => {
    setActiveView('perfilUsuario');
    setMostrarMenuUsuario(false);
  };

  const abrirConfiguracionUsuario = () => {
    setActiveView('configUsuario');
    setMostrarMenuUsuario(false);
  };

  const displayName =
    me?.u_usuario ||
    me?.u_nombre ||
    me?.username ||
    me?.nombre_usuario ||
    me?.nombre ||
    me?.name ||
    me?.email ||
    'Usuario';

  const displayRole = isAdmin ? 'Administrador' : me?.rol_nombre || 'Usuario';

  return (
    <div className="app">
      {/* ===== MODAL CERRAR SESIÓN ===== */}
      {showLogoutConfirm && (
        <div className="modal-logout-backdrop">
          <div className="modal-logout">
            <h3>¿Cerrar sesión?</h3>
            <p>
              Se cerrará tu sesión actual en el sistema y tendrás que volver a
              iniciar sesión.
            </p>
            <div className="modal-logout__actions">
              <button
                type="button"
                className="btn-modal btn-modal-cancel"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-modal btn-modal-logout"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  cerrarSesion();
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="topbar">
        {/* 🟢 Botón hamburguesa (solo se ve en móvil vía CSS) */}
        <button
          className="btn-menu-mobile"
          type="button"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
        >
          ☰
        </button>

        <h1
          className="titulo-barra"
          onClick={() => {
            setActiveView(null);
            setOpenMenu(null);
          }}
          style={{ cursor: 'pointer' }}
        >
          Gestión y Reserva San José Pinula
        </h1>

        <div className="topbar-spacer" />

        <div className="topbar-usuario-izquierdo">
          <button
            className="btn-usuario-izquierdo"
            onClick={toggleMenuUsuario}
          >
            🤵 {displayName} — {displayRole}
          </button>
        </div>

        {mostrarMenuUsuario && (
          <div className="panel-usuario-izquierdo" ref={usuarioRef}>
            <div className="panel-header-usuario">
              <div>
                <h3>👤 {displayName}</h3>
                <p className="panel-usuario-rol">{displayRole}</p>
              </div>
              <button
                className="btn-cerrar-panel-usuario"
                onClick={() => setMostrarMenuUsuario(false)}
              >
                ×
              </button>
            </div>

            <div className="lista-opciones-usuario">
              <div className="opcion-usuario" onClick={verPerfil}>
                <span>👤</span>
                <span>Ver Perfil</span>
              </div>
              <div
                className="opcion-usuario"
                onClick={() => setShowLogoutConfirm(true)}
              >
                <span>🚪</span>
                <span>Cerrar Sesión</span>
              </div>
            </div>
          </div>
        )}

        <div className="topbar-notificaciones" ref={notificacionesRef}>
          <button
            className="btn-notificaciones"
            onClick={toggleNotificaciones}
          >
            🔔
            {notificacionesNoLeidas > 0 && (
              <span className="badge-notificaciones">
                {notificacionesNoLeidas}
              </span>
            )}
          </button>

          {mostrarNotificaciones && (
            <div className="panel-notificaciones">
              <div className="panel-header">
                <h3>🔔 Notificaciones</h3>
                <button
                  className="btn-cerrar-panel"
                  onClick={() => setMostrarNotificaciones(false)}
                >
                  ×
                </button>
              </div>
              <div className="lista-notificaciones">
                {notificaciones.length === 0 ? (
                  <p className="sin-notificaciones">
                    No hay notificaciones
                  </p>
                ) : (
                  notificaciones.map((n) => (
                    <div
                      key={n.id}
                      className={`notificacion-item ${
                        n.leida ? '' : 'no-leida'
                      }`}
                    >
                      <div className="notificacion-contenido">
                        <p>{n.mensaje}</p>
                        <small>
                          {new Date(n.fecha).toLocaleString()}
                        </small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <img
          src={bannerMunicipal}
          alt="Escudo San José Pinula"
          className="dashboard-logo"
        />
      </header>

      <div className="dashboard">
        {/* 🟢 Capa oscura detrás del sidebar en móvil */}
        <div
          className={`sidebar-overlay ${
            isSidebarOpen ? 'sidebar-overlay--visible' : ''
          }`}
          onClick={() => setIsSidebarOpen(false)}
        />

        <aside
          className={`sidebar ${
            isSidebarOpen ? 'sidebar--open' : ''
          }`}
          ref={sidebarRef}
        >
          <ul>
            {/* ===== Reservas ===== */}
            <li
              className="menu-item"
              onClick={() => toggleMenu('reservas')}
            >
              📝 Reservas
              {openMenu === 'reservas' && (
                <ul className="submenu">
                  {can('reservas.crear') && (
                    <li
                      onClick={() =>
                        go('crearReserva', 'reservas.crear')
                      }
                    >
                      ➕ Crear Nueva
                    </li>
                  )}
                  {can('reservas.listado') && (
                    <li
                      onClick={() =>
                        go('listadoReservas', 'reservas.listado')
                      }
                    >
                      📋 Ver Todas
                    </li>
                  )}
                  {can('reservas.historial') && (
                    <li
                      onClick={() =>
                        go('historial', 'reservas.historial')
                      }
                    >
                      📚 Historial
                    </li>
                  )}
                  {can('reservas.calendario') && (
                    <li
                      onClick={() =>
                        go(
                          'calendarioReservas',
                          'reservas.calendario'
                        )
                      }
                    >
                      📅 Calendario
                    </li>
                  )}
                </ul>
              )}
            </li>

            {/* ===== Espacios y Muebles ===== */}
            <li
              className="menu-item"
              onClick={() => toggleMenu('espacios')}
            >
              🧱 Espacios y Muebles
              {openMenu === 'espacios' && (
                <ul className="submenu">
                  {can('espacios.crear-mueble') && (
                    <li
                      onClick={() =>
                        go(
                          'crearInmueble',
                          'espacios.crear-mueble'
                        )
                      }
                    >
                      ➕ Crear Mueble
                    </li>
                  )}
                  {can('espacios.crear-espacio') && (
                    <li
                      onClick={() =>
                        go(
                          'crearEspacio',
                          'espacios.crear-espacio'
                        )
                      }
                    >
                      ➕ Crear Espacio
                    </li>
                  )}
                  {can('espacios.listado-muebles') && (
                    <li
                      onClick={() =>
                        go(
                          'listadoInmuebles',
                          'espacios.listado-muebles'
                        )
                      }
                    >
                      🏢 Muebles
                    </li>
                  )}
                  {can('espacios.listado-espacios') && (
                    <li
                      onClick={() =>
                        go(
                          'listadoEspacios',
                          'espacios.listado-espacios'
                        )
                      }
                    >
                      🏛️ Espacios Públicos
                    </li>
                  )}
                  {can('espacios.disponibilidad') && (
                    <li
                      onClick={() =>
                        go(
                          'disponibilidad',
                          'espacios.disponibilidad'
                        )
                      }
                    >
                      📈 Disponibilidad
                    </li>
                  )}
                </ul>
              )}
            </li>

            {/* ===== Usuarios ===== */}
            <li
              className="menu-item"
              onClick={() => toggleMenu('usuarios')}
            >
              👥 Usuarios
              {openMenu === 'usuarios' && (
                <ul className="submenu">
                  {can('usuarios.listado') && (
                    <li
                      onClick={() =>
                        go('listadoUsuarios', 'usuarios.listado')
                      }
                    >
                      📋 Listado
                    </li>
                  )}
                  {can('usuarios.crear') && (
                    <li
                      onClick={() =>
                        go('crearUsuario', 'usuarios.crear')
                      }
                    >
                      ➕ Agregar Usuario
                    </li>
                  )}
                  {isAdmin && (
                    <li
                      onClick={() =>
                        go('permisos', null /* admin-only */)
                      }
                    >
                      🔑 Permisos
                    </li>
                  )}
                </ul>
              )}
            </li>

            {/* ===== Aprobación y Control ===== */}
            <li
              className="menu-item"
              onClick={() => toggleMenu('aprobacion')}
            >
              ✅ Aprobación y Control
              {openMenu === 'aprobacion' && (
                <ul className="submenu">
                  {can('reservas.aprobacion') && (
                    <>
                      <li
                        onClick={() =>
                          go(
                            'solicitudesPendientes',
                            'reservas.aprobacion'
                          )
                        }
                      >
                        ⏳ Pendientes
                      </li>
                      <li
                        onClick={() =>
                          go(
                            'solicitudesAprobadas',
                            'reservas.aprobacion'
                          )
                        }
                      >
                        ✅ Aprobadas
                      </li>
                      <li
                        onClick={() =>
                          go(
                            'solicitudesRechazadas',
                            'reservas.aprobacion'
                          )
                        }
                      >
                        ❌ Rechazadas
                      </li>
                      <li
                        onClick={() =>
                          go(
                            'estadisticasAprobacion',
                            'reservas.aprobacion'
                          )
                        }
                      >
                        📊 Estadísticas
                      </li>
                    </>
                  )}
                </ul>
              )}
            </li>

            {/* ===== Tarifas y Cobranzas ===== */}
            <li
              className="menu-item"
              onClick={() => toggleMenu('pagos')}
            >
              💰 Tarifas y Cobranzas
              {openMenu === 'pagos' && (
                <ul className="submenu">
                  {can('pagos.config') && (
                    <li
                      onClick={() =>
                        go('configurarTarifas', 'pagos.config')
                      }
                    >
                      ⚙️ Configurar Tarifas
                    </li>
                  )}
                  {can('pagos.registrar') && (
                    <li
                      onClick={() =>
                        go('registrarPago', 'pagos.registrar')
                      }
                    >
                      💳 Pagos Realizados
                    </li>
                  )}
                  {can('pagos.historial') && (
                    <li
                      onClick={() =>
                        go('historialPagos', 'pagos.historial')
                      }
                    >
                      📚 Historial de Pagos
                    </li>
                  )}
                  {can('pagos.reporte') && (
                    <li
                      onClick={() =>
                        go('reporteFinanciero', 'pagos.reporte')
                      }
                    >
                      📈 Reporte Financiero
                    </li>
                  )}
                </ul>
              )}
            </li>

            {/* ===== Reportes ===== */}
            <li
              className="menu-item"
              onClick={() => toggleMenu('reportes')}
            >
              📊 Reportes y Estadísticas
              {openMenu === 'reportes' && (
                <ul className="submenu">
                  {can('reportes.uso') && (
                    <li
                      onClick={() =>
                        go('reporteUso', 'reportes.uso')
                      }
                    >
                      📈 Uso de Espacios
                    </li>
                  )}
                  {can('reportes.usuarios') && (
                    <li
                      onClick={() =>
                        go('reporteUsuarios', 'reportes.usuarios')
                      }
                    >
                      👥 Usuarios
                    </li>
                  )}
                  {can('reportes.dashboard') && (
                    <li
                      onClick={() =>
                        go(
                          'dashboardEjecutivo',
                          'reportes.dashboard'
                        )
                      }
                    >
                      📉 Dashboard
                    </li>
                  )}
                </ul>
              )}
            </li>
          </ul>
        </aside>

        <main className="main-content">
          {/* ===== Reservas y espacios ===== */}
          {activeView === 'crearReserva' &&
            (can('reservas.crear') ? (
              <CrearReserva />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'crearInmueble' &&
            (can('espacios.crear-mueble') ? (
              <CrearInmueble />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'crearEspacio' &&
            (can('espacios.crear-espacio') ? (
              <CrearEspacio />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'listadoReservas' &&
            (can('reservas.listado') ? (
              <ListadoReservas />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'historial' &&
            (can('reservas.historial') ? (
              <HistorialReservas />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'listadoInmuebles' &&
            (can('espacios.listado-muebles') ? (
              <ListadoInmuebles />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'listadoEspacios' &&
            (can('espacios.listado-espacios') ? (
              <ListadoEspacios />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'calendarioReservas' &&
            (can('reservas.calendario') ? (
              <CalendarioReservas />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'disponibilidad' &&
            (can('espacios.disponibilidad') ? (
              <VistaDisponibilidad />
            ) : (
              <NoPermiso />
            ))}

          {/* ===== Aprobación y Control ===== */}
          {activeView === 'solicitudesPendientes' &&
            (can('reservas.aprobacion') ? (
              <AprobacionListado modo="pendientes" />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'solicitudesAprobadas' &&
            (can('reservas.aprobacion') ? (
              <AprobacionListado modo="aprobadas" />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'solicitudesRechazadas' &&
            (can('reservas.aprobacion') ? (
              <AprobacionListado modo="rechazadas" />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'estadisticasAprobacion' &&
            (can('reservas.aprobacion') ? (
              <AprobacionEstadisticas />
            ) : (
              <NoPermiso />
            ))}

          {/* ===== Cobranza ===== */}
          {activeView === 'configurarTarifas' &&
            (can('pagos.config') ? (
              <ConfigurarTarifas />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'registrarPago' &&
            (can('pagos.registrar') ? (
              <RegistrarPago />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'historialPagos' &&
            (can('pagos.historial') ? (
              <HistorialPagos />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'reporteFinanciero' &&
            (can('pagos.reporte') ? (
              <ReporteFinanciero />
            ) : (
              <NoPermiso />
            ))}

          {/* ===== Usuarios ===== */}
          {activeView === 'listadoUsuarios' &&
            (can('usuarios.listado') ? (
              <ListadoUsuarios />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'crearUsuario' &&
            (can('usuarios.crear') ? (
              <CrearUsuario />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'permisos' &&
            (isAdmin ? <GestionPermisos /> : <NoPermiso />)}

          {/* ===== Reportes ===== */}
          {activeView === 'reporteUso' &&
            (can('reportes.uso') ? (
              <ReporteUso />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'reporteUsuarios' &&
            (can('reportes.usuarios') ? (
              <ReporteUsuarios />
            ) : (
              <NoPermiso />
            ))}
          {activeView === 'dashboardEjecutivo' &&
            (can('reportes.dashboard') ? (
              <DashboardEjecutivo />
            ) : (
              <NoPermiso />
            ))}

          {/* ===== Perfil de Usuario ===== */}
          {activeView === 'perfilUsuario' && (
            <section className="vista-perfil-usuario">
              <h2>👤 Perfil del Usuario</h2>
              <div className="tarjeta-perfil">
                <p>
                  <strong>Nombre de usuario:</strong> {displayName}
                </p>
                <p>
                  <strong>Rol:</strong> {displayRole}
                </p>
                {me?.u_correo && (
                  <p>
                    <strong>Correo:</strong> {me.u_correo}
                  </p>
                )}
                {me?.u_telefono && (
                  <p>
                    <strong>Teléfono:</strong> {me.u_telefono}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ===== Configuración de Usuario ===== */}
          {activeView === 'configUsuario' && (
            <section className="vista-config-usuario">
              <h2>⚙️ Configuración de la Cuenta</h2>
              <p>
                (por ejemplo, cambiar contraseña, idioma, tema, etc.).
              </p>
              <p>
                Por ahora es una vista informativa; luego puedes convertirla
                en un formulario editable.
              </p>
            </section>
          )}

          {/* ===== Bienvenida ===== */}
          {!activeView && (
            <div className="bienvenida">
              <h2>
                🌟 Bienvenido al sistema de gestión de San José Pinula
              </h2>
              <p>Selecciona una opción del menú para comenzar.</p>

              <div className="acceso-rapido">
                <h3>⚡ Acceso Rápido</h3>
                <div className="botones-rapidos">
                  {can('reservas.crear') && (
                    <button
                      className="btn-rapido"
                      onClick={() =>
                        go('crearReserva', 'reservas.crear')
                      }
                    >
                      📝 Nueva Reserva
                    </button>
                  )}
                  {can('reservas.listado') && (
                    <button
                      className="btn-rapido"
                      onClick={() =>
                        go(
                          'listadoReservas',
                          'reservas.listado'
                        )
                      }
                    >
                      📋 Ver Reservas
                    </button>
                  )}
                  {can('pagos.registrar') && (
                    <button
                      className="btn-rapido"
                      onClick={() =>
                        go('registrarPago', 'pagos.registrar')
                      }
                    >
                      💳 Pagos
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
