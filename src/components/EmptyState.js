import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Empty state component shown when a list has no items
 */
const EmptyState = ({
  icon = 'folder-open-outline',
  title = 'لا توجد بيانات',
  subtitle = 'لم يتم إضافة أي عناصر بعد',
  color = '#9E9E9E',
}) => {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={72} color={color} style={styles.icon} />
      <Text style={[styles.title, { color }]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  icon: {
    marginBottom: 16,
    opacity: 0.6,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default EmptyState;
