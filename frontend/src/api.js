import axios from 'axios';

export const getApiBase = () => {
  return (typeof window !== 'undefined' && localStorage.getItem('gpms_server_url')) ||
    import.meta.env.VITE_API_BASE_URL ||
    'http://localhost:8000/api';
};

export const API_BASE = getApiBase();

const api = axios.create({
  baseURL: getApiBase(),
});

api.interceptors.request.use((config) => {
  config.baseURL = getApiBase();
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
      if (!authPaths.some(p => window.location.pathname.startsWith(p))) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('name');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
