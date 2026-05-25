import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({ timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const baseURL = await AsyncStorage.getItem('server_url') || 'http://localhost:5000';
  const token = await AsyncStorage.getItem('auth_token');
  config.baseURL = baseURL;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
  changePassword: (current, next) => api.post('/api/auth/change-password', { current, next }),
};

export const dashboardAPI = {
  getSummary: () => api.get('/api/dashboard'),
  getKPIs: () => api.get('/api/kpis'),
};

export const workordersAPI = {
  getAll: (params) => api.get('/api/workorders', { params }),
  getOne: (id) => api.get(`/api/workorders/${id}`),
  create: (data) => api.post('/api/workorders', data),
  update: (id, data) => api.put(`/api/workorders/${id}`, data),
  updateStatus: (id, status, message) =>
    api.patch(`/api/workorders/${id}/status`, { status, message }),
  delete: (id) => api.delete(`/api/workorders/${id}`),
  getStats: () => api.get('/api/workorders/stats/summary'),
};

export const assetsAPI = {
  getAll: (params) => api.get('/api/assets', { params }),
  getOne: (id) => api.get(`/api/assets/${id}`),
  create: (data) => api.post('/api/assets', data),
  update: (id, data) => api.put(`/api/assets/${id}`, data),
  delete: (id) => api.delete(`/api/assets/${id}`),
};

export const pmAPI = {
  getAll: () => api.get('/api/pm'),
  getOverdue: () => api.get('/api/pm/overdue'),
  getUpcoming: (days = 7) => api.get('/api/pm/upcoming', { params: { days } }),
  complete: (id, data) => api.patch(`/api/pm/${id}/complete`, data),
};

export const inventoryAPI = {
  getAll: () => api.get('/api/inventory'),
  getLowStock: () => api.get('/api/inventory/low-stock'),
  adjustQty: (id, delta, reason) =>
    api.patch(`/api/inventory/${id}/qty`, { delta, reason }),
};

export const hrAPI = {
  getStaff: (params) => api.get('/api/hr/staff', { params }),
  createStaff: (data) => api.post('/api/hr/staff', data),
  updateStaff: (id, data) => api.put(`/api/hr/staff/${id}`, data),
  deleteStaff: (id) => api.delete(`/api/hr/staff/${id}`),
  getSummary: () => api.get('/api/hr/summary'),
};

export const serverAPI = {
  getInfo: async (baseURL) => {
    const res = await axios.get(`${baseURL}/api/server-info`, { timeout: 5000 });
    return res;
  },
};

export default api;

export const chatAPI = {
  getRooms: () => api.get('/api/chat/rooms'),
  createRoom: (data) => api.post('/api/chat/rooms', data),
  getMessages: (roomId) => api.get(`/api/chat/rooms/${roomId}/messages`),
  sendMessage: (data) => api.post('/api/chat/messages', data),
  sendVoice: (formData) => api.post('/api/chat/voice', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const reportsAPI = {
  getFailurePatterns: (params) => api.get('/api/reports/failure-patterns', { params }),
  getWrenchTime: (params) => api.get('/api/reports/wrench-time', { params }),
  getOEE: (params) => api.get('/api/reports/oee', { params }),
};

export const predictiveAPI = {
  getPredictions: () => api.get('/api/predictions'),
};

export const locationAPI = {
  updateLocation: (data) => api.post('/api/location/update', data),
  getCurrentLocations: () => api.get('/api/location/current'),
  getHistory: (techId, params) => api.get(`/api/location/history/${techId}`, { params }),
};

export const aiAPI = {
  diagnose: (data) => api.post('/api/ai/diagnose', data),
};
