import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  getStatusColor,
  getStatusText,
  getEquipmentStatusColor,
  getEquipmentStatusText,
  getTechnicianStatusColor,
  getTechnicianStatusText,
} from '../utils/helpers';

/**
 * Reusable status badge component
 * type: 'request' | 'equipment' | 'technician'
 * size: 'small' | 'medium' | 'large'
 */
const StatusBadge = ({ status, type = 'request', size = 'medium' }) => {
  const getColor = () => {
    switch (type) {
      case 'equipment':
        return getEquipmentStatusColor(status);
      case 'technician':
        return getTechnicianStatusColor(status);
      default:
        return getStatusColor(status);
    }
  };

  const getText = () => {
    switch (type) {
      case 'equipment':
        return getEquipmentStatusText(status);
      case 'technician':
        return getTechnicianStatusText(status);
      default:
        return getStatusText(status);
    }
  };

  const color = getColor();
  const text = getText();

  const sizeStyles = {
    small: { paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, borderRadius: 4 },
    medium: { paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, borderRadius: 6 },
    large: { paddingHorizontal: 14, paddingVertical: 6, fontSize: 14, borderRadius: 8 },
  };

  const s = sizeStyles[size] || sizeStyles.medium;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: color + '20',
          borderColor: color,
          paddingHorizontal: s.paddingHorizontal,
          paddingVertical: s.paddingVertical,
          borderRadius: s.borderRadius,
        },
      ]}
    >
      <Text style={[styles.text, { color: color, fontSize: s.fontSize }]}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default StatusBadge;
