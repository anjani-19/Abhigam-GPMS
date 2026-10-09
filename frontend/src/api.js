import axios from 'axios';

const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
export const API_BASE = rawBase.endsWith('/api') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api`;

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
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
