// src/routes/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requireRole }) {
  const { user, access, loading, hasRole } = useAuth();

  if (loading) return null; // o un spinner si quieres
  if (!access || !user) return <Navigate to="/login" replace />;

  if (requireRole && !hasRole(requireRole)) {
    // si quieres podrías mandar a /login o mostrar 403
    return <Navigate to="/login" replace />;
  }

  return children;
}
