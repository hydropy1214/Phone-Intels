import axios from 'axios';

export function setAdminSecret(secret: string) {
  axios.defaults.headers.common['X-Admin-Secret'] = secret;
  localStorage.setItem('admin_secret', secret);
}

export function clearAdminSecret() {
  delete axios.defaults.headers.common['X-Admin-Secret'];
  localStorage.removeItem('admin_secret');
  localStorage.removeItem('api_key');
  delete axios.defaults.headers.common['X-API-Key'];
}

export function getStoredSecret(): string | null {
  return localStorage.getItem('admin_secret');
}

export function setApiKey(key: string) {
  axios.defaults.headers.common['X-API-Key'] = key;
  localStorage.setItem('api_key', key);
}

export function getApiKey(): string | null {
  return localStorage.getItem('api_key');
}

export function getApiBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/$/, '') + '/api';
}

// Intercept fetch — inject credentials AND watch for 401 on API paths
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const isSameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
  const isApiPath = url.includes('/api/');

  if (isSameOrigin && isApiPath) {
    const secret = getStoredSecret();
    const apiKey = getApiKey();

    const headers = new Headers(init?.headers);
    if (input instanceof Request) {
      input.headers.forEach((value, key) => {
        if (!headers.has(key)) headers.set(key, value);
      });
    }

    if (secret) headers.set('X-Admin-Secret', secret);
    if (apiKey) headers.set('X-API-Key', apiKey);

    const response = await originalFetch(input, { ...init, headers });

    // Auto-logout when any admin API call returns 401 (stale / wrong secret)
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }

    return response;
  }

  return originalFetch(input, init);
};
