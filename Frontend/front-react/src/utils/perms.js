// src/utils/perms.js
import { getJSON } from './api';

/** Guarda permisos en localStorage para uso rápido en el frontend */
function setPerms(perms) {
  try {
    localStorage.setItem('perms', JSON.stringify(Array.isArray(perms) ? perms : []));
  } catch {}
}
export function getPermsSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem('perms') || '[]'));
  } catch {
    return new Set();
  }
}

/** Devuelve true si el permiso existe (o si hay un wildcard '*') */
export function can(perm) {
  const set = getPermsSet();
  return set.has('*') || set.has(perm);
}

/** Inicializa permisos del usuario; si no hay por-usuario, cae a por-rol */
export async function initPerms({ userId, roleId }) {
  let perms = [];
  try {
    if (userId) {
      const r = await getJSON(`/api/permisos/usuario/${userId}`);
      if (Array.isArray(r?.permisos) && r.permisos.length > 0) perms = r.permisos;
    }
  } catch {}
  if (perms.length === 0 && roleId) {
    try {
      const r = await getJSON(`/api/permisos/rol/${roleId}`);
      if (Array.isArray(r?.permisos)) perms = r.permisos;
    } catch {}
  }
  setPerms(perms);
  return perms;
}
