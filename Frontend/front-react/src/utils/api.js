// src/utils/api.js

// === Base de la API: dev vs prod (iPad/otros equipos) ===
// - Si existe REACT_APP_API_URL, úsalo.
// - Si el front corre en :3000 (dev), usa http://localhost:5000.
// - En producción (build servido por el backend), usa mismo origen: ''.
const BASE_URL = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location && window.location.port === '3000') {
    return 'http://localhost:5000';
  }
  return ''; // mismo origen (backend sirve el front)
})();

console.log('🔧 API Base URL:', API_BASE_URL || '(same-origin)');

// === Token helper (opcional: se agrega Authorization si está disponible) ===
function getToken() {
  const keys = ['auth', 'user', 'authUser', 'token', 'jwt'];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const val = JSON.parse(raw);
      if (typeof val === 'string') return val;
      if (val?.access_token) return val.access_token;
      if (val?.token) return val.token;
      if (val?.jwt) return val.jwt;
    } catch {
      // si no es JSON, puede ser el token plano
      if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(raw)) return raw;
    }
  }
  return null;
}

// === Fetch con JSON, timeout y manejo de errores no-JSON ===
async function fetchJSON(url, options = {}) {
  const path = url.startsWith('/') ? url : `/${url}`;
  const fullUrl = `${API_BASE_URL}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Autorizar si hay token y no viene Authorization manual
  if (!headers.Authorization) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  // Timeout (15s) para evitar colgados en móviles
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  console.log(`📡 ${options.method || 'GET'} ${fullUrl}`);

  try {
    const resp = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);
    console.log(`📨 Response ${resp.status} from ${path}`);

    const ct = resp.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');

    if (!resp.ok) {
      const errPayload = isJson
        ? await resp.json().catch(() => null)
        : { message: await resp.text().catch(() => `HTTP ${resp.status}`) };

      const msg =
        errPayload?.error ||
        errPayload?.message ||
        `HTTP ${resp.status}: ${resp.statusText}`;

      console.error('❌ API Error:', msg, errPayload);
      throw new Error(msg);
    }

    return isJson ? resp.json() : resp.text();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('La solicitud se tardó demasiado (timeout).');
    }
    throw e;
  }
}

// === Atajos REST ===
export function getJSON(url, headers = {}) {
  return fetchJSON(url, { method: 'GET', headers });
}
export function postJSON(url, body = {}, headers = {}) {
  return fetchJSON(url, { method: 'POST', headers, body: JSON.stringify(body) });
}
export function putJSON(url, body = {}, headers = {}) {
  return fetchJSON(url, { method: 'PUT', headers, body: JSON.stringify(body) });
}
export function deleteJSON(url, headers = {}) {
  return fetchJSON(url, { method: 'DELETE', headers });
}
export function patchJSON(url, body = {}, headers = {}) {
  return fetchJSON(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
}
