// Client-side API Client with Token Refresh Interceptor
const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const BACKEND_URL ='https://connectsphere-backend-6leh.onrender.com';

const getFullPath = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${BACKEND_URL}${path}`;
};

let inMemoryToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null) => {
  inMemoryToken = token;
};

export const getAccessToken = () => {
  return inMemoryToken;
};

// Internal function to handle token refreshing
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(getFullPath('/api/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data = await response.json();
      const newAccessToken = data.accessToken;
      setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (err) {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface RequestOptions extends RequestInit {
  json?: any;
}

export async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  
  if (options.json) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.json);
  }

  // Inject Bearer token if present
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  options.headers = headers;
  // Ensure cookies are sent (needed for refreshToken cookie)
  options.credentials = 'include';

  let response = await fetch(getFullPath(path), options);

  // If unauthorized, token might have expired. Try to refresh.
  if (response.status === 401 && !path.endsWith('/auth/refresh') && !path.endsWith('/auth/login')) {
    const newAccessToken = await refreshAccessToken();
    
    if (newAccessToken) {
      // Retry request with new token
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set('Authorization', `Bearer ${newAccessToken}`);
      options.headers = retryHeaders;
      response = await fetch(getFullPath(path), options);
    } else {
      // Trigger global logout event or redirect to login
      window.dispatchEvent(new Event('auth-failed'));
    }
  }

  return response;
}

export const api = {
  get: (path: string, options?: RequestOptions) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path: string, body?: any, options?: RequestOptions) => apiRequest(path, { ...options, method: 'POST', json: body }),
  put: (path: string, body?: any, options?: RequestOptions) => apiRequest(path, { ...options, method: 'PUT', json: body }),
  delete: (path: string, options?: RequestOptions) => apiRequest(path, { ...options, method: 'DELETE' })
};
