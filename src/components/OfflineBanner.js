import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../context/NetworkContext';

export default function OfflineBanner() {
  const { isOnline, syncing, pendingCount, runSync } = useNetwork();
  if (isOnline && !syncing) return null;
  return (
    <View style={[styles.banner, isOnline && styles.syncing]}>
      {syncing
        ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.txt}>جاري المزامنة...</Text></>
        : <>
            <Ionicons name="cloud-offline" size={16} color="#fff" />
            <Text style={styles.txt}>أنت غير متصل — البيانات محفوظة محلياً{pendingCount > 0 ? ` (${pendingCount} معلق)` : ''}</Text>
            <TouchableOpacity onPress={runSync}><Text style={styles.retry}>مزامنة</Text></TouchableOpacity>
          </>
      }
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#C62828', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14 },
  syncing: { backgroundColor: '#1565C0' },
  txt: { color: '#fff', fontSize: 12, flex: 1 },
  retry: { color: '#FFD54F', fontSize: 12, fontWeight: 'bold' },
});
