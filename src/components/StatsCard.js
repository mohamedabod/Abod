import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Reusable statistics card for dashboard
 */
const StatsCard = ({ title, value, icon, color = '#1565C0', onPress, subtitle }) => {
  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper
      style={[styles.card, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={28} color={color} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.value, { color: color }]}>{value}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  textContainer: {
    flex: 1,
  },
  value: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  title: {
    fontSize: 14,
    color: '#616161',
    textAlign: 'right',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'right',
    marginTop: 2,
  },
});

export default StatsCard;
