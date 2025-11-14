// src/routes/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Protege rutas según sesión y rol.
 *
 * Props:
 * - requireRole?: number | number[] | ((ctx:{user:any, hasRole:(id:number)=>boolean}) => boolean)
 * - fallback?: React.ReactNode  // qué renderizar si no tiene permiso (por defecto redirige a /login)
 */
export default function ProtectedRoute({ children, requireRole, fallback }) {
  const { user, access, loading, hasRole } = useAuth();
  const location = useLocation();

  // Mientras el contexto se hidrata
  if (loading) return null; // o un spinner si gustas

  // No autenticado: manda a login y recuerda a dónde quería ir
  if (!access || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Chequeo de rol/permisos si se indicó
  if (requireRole) {
    let allowed = false;

    if (typeof requireRole === 'function') {
      allowed = !!requireRole({ user, hasRole });
    } else if (Array.isArray(requireRole)) {
      allowed = requireRole.some((r) => hasRole(r));
    } else {
      allowed = hasRole(requireRole);
    }

    if (!allowed) {
      // Si te pasaron un fallback (p.ej. página 403), úsalo; si no, redirige
      return fallback ?? <Navigate to="/login" replace />;
    }
  }

  return children;
}
