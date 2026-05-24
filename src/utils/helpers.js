/**
 * Helper utility functions for the maintenance app
 */

/**
 * Format a date to Arabic locale string
 */
export const formatDate = (date) => {
  if (!date) return 'غير محدد';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'غير محدد';
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Format date with time
 */
export const formatDateTime = (date) => {
  if (!date) return 'غير محدد';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'غير محدد';
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Get color based on priority
 */
export const getPriorityColor = (priority) => {
  switch (priority) {
    case 'high':
      return '#D32F2F';
    case 'medium':
      return '#FF6F00';
    case 'low':
      return '#388E3C';
    default:
      return '#757575';
  }
};

/**
 * Get Arabic text for priority
 */
export const getPriorityText = (priority) => {
  switch (priority) {
    case 'high':
      return 'عالية';
    case 'medium':
      return 'متوسطة';
    case 'low':
      return 'منخفضة';
    default:
      return 'غير محدد';
  }
};

/**
 * Get color based on request status
 */
export const getStatusColor = (status) => {
  switch (status) {
    case 'pending':
      return '#FF6F00';
    case 'in-progress':
      return '#1565C0';
    case 'completed':
      return '#2E7D32';
    case 'cancelled':
      return '#757575';
    default:
      return '#757575';
  }
};

/**
 * Get Arabic text for request status
 */
export const getStatusText = (status) => {
  switch (status) {
    case 'pending':
      return 'معلق';
    case 'in-progress':
      return 'قيد التنفيذ';
    case 'completed':
      return 'مكتمل';
    case 'cancelled':
      return 'ملغى';
    default:
      return 'غير محدد';
  }
};

/**
 * Get color based on equipment status
 */
export const getEquipmentStatusColor = (status) => {
  switch (status) {
    case 'working':
      return '#2E7D32';
    case 'needs-maintenance':
      return '#FF6F00';
    case 'broken':
      return '#D32F2F';
    default:
      return '#757575';
  }
};

/**
 * Get Arabic text for equipment status
 */
export const getEquipmentStatusText = (status) => {
  switch (status) {
    case 'working':
      return 'يعمل';
    case 'needs-maintenance':
      return 'يحتاج صيانة';
    case 'broken':
      return 'معطل';
    default:
      return 'غير محدد';
  }
};

/**
 * Get color based on technician status
 */
export const getTechnicianStatusColor = (status) => {
  switch (status) {
    case 'available':
      return '#2E7D32';
    case 'busy':
      return '#1565C0';
    case 'offline':
      return '#757575';
    default:
      return '#757575';
  }
};

/**
 * Get Arabic text for technician status
 */
export const getTechnicianStatusText = (status) => {
  switch (status) {
    case 'available':
      return 'متاح';
    case 'busy':
      return 'مشغول';
    case 'offline':
      return 'غير متصل';
    default:
      return 'غير محدد';
  }
};

/**
 * Generate avatar initials from name
 */
export const getInitials = (name) => {
  if (!name) return '?';
  const words = name.trim().split(' ');
  if (words.length === 1) return words[0].charAt(0);
  return words[0].charAt(0) + words[words.length - 1].charAt(0);
};

/**
 * Generate a simple unique ID (without uuid package dependency)
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Get relative time in Arabic
 */
export const getRelativeTime = (date) => {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 30) return `منذ ${diffDays} يوم`;
  return formatDate(date);
};

/**
 * Count requests by status
 */
export const countByStatus = (requests) => {
  return {
    pending: requests.filter((r) => r.status === 'pending').length,
    inProgress: requests.filter((r) => r.status === 'in-progress').length,
    completed: requests.filter((r) => r.status === 'completed').length,
    cancelled: requests.filter((r) => r.status === 'cancelled').length,
  };
};

/**
 * Get requests for a specific technician
 */
export const getRequestsForTechnician = (requests, technicianId) => {
  return requests.filter((r) => r.technicianId === technicianId);
};

/**
 * Get requests for a specific equipment
 */
export const getRequestsForEquipment = (requests, equipmentId) => {
  return requests.filter((r) => r.equipmentId === equipmentId);
};
