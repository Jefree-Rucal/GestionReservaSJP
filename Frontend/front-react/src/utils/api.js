// src/utils/api.js

// Cambia este puerto al puerto de tu backend (ej: 3001, 4000, 5000, etc.)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

console.log('🔧 API Base URL:', API_BASE_URL);

/**
 * Función helper para hacer peticiones JSON
 */
async function fetchJSON(url, options = {}) {
  const fullUrl = `${API_BASE_URL}${url}`;
  console.log(`📡 ${options.method || 'GET'} ${fullUrl}`);
  
  // Log del body si existe
  if (options.body) {
    console.log('📦 Body:', options.body);
  }
  
  const response = await fetch(fullUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  console.log(`📨 Response ${response.status} from ${url}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ 
      message: `Error ${response.status}: ${response.statusText}` 
    }));
    console.error('❌ API Error:', error);
    throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * GET request
 */
export async function getJSON(url, headers = {}) {
  return fetchJSON(url, {
    method: 'GET',
    headers,
  });
}

/**
 * POST request
 */
export async function postJSON(url, body = {}, headers = {}) {
  return fetchJSON(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * PUT request
 */
export async function putJSON(url, body = {}, headers = {}) {
  return fetchJSON(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request
 */
export async function deleteJSON(url, headers = {}) {
  return fetchJSON(url, {
    method: 'DELETE',
    headers,
  });
}

/**
 * PATCH request
 */
export async function patchJSON(url, body = {}, headers = {}) {
  return fetchJSON(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}