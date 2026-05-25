import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { hrAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function LocationTrackingScreen() {
  const [tracking, setTracking] = useState(false);
  const [staff, setStaff] = useState([]);
  const [myLocation, setMyLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const locationSub = useRef(null);
  const intervalRef = useRef(null);

  useFocusEffect(useCallback(() => {
    hrAPI.getStaff().then(r => { setStaff(r.data); setLoading(false); }).catch(() => setLoading(false));
    AsyncStorage.getItem('location_tracking').then(v => { if (v === 'true') startTracking(); });
    return () => stopTracking();
  }, []));

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('تنبيه', 'يلزم السماح بالوصول للموقع');
      return;
    }
    setTracking(true);
    await AsyncStorage.setItem('location_tracking', 'true');

    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 20 },
      (loc) => {
        setMyLocation(loc.coords);
        sendLocation(loc.coords);
      }
    );
  };

  const stopTracking = async () => {
    locationSub.current?.remove();
    clearInterval(intervalRef.current);
    setTracking(false);
    await AsyncStorage.setItem('location_tracking', 'false');
  };

  const toggleTracking = () => tracking ? stopTracking() : startTracking();

  const sendLocation = async (coords) => {
    try {
      await api.post('/api/location/update', {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
      });
    } catch (_) {}
  };

  const StatusDot = ({ online }) => (
    <View style={[styles.dot, { backgroundColor: online ? '#4CAF50' : '#9E9E9E' }]} />
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={styles.myLocationCard}>
        <View style={styles.trackingRow}>
          <Switch value={tracking} onValueChange={toggleTracking} trackColor={{ true: '#2E7D32' }} />
          <Text style={styles.trackingLabel}>{tracking ? '📡 تتبع موقعك نشط' : 'تفعيل مشاركة موقعك'}</Text>
        </View>
        {myLocation && (
          <Text style={styles.coords}>
            📍 {myLocation.latitude.toFixed(5)}, {myLocation.longitude.toFixed(5)}
          </Text>
        )}
        <Text style={styles.trackingHint}>
          عند التفعيل، موقعك يُحدَّث كل 30 ثانية ويظهر للمهندس
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color={C.primary} />
        <Text style={styles.infoText}>
          موقع الفنيين يُستخدم لحساب وقت التنقل وتحليل Wrench Time. البيانات محفوظة فقط في نظام EmessA.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>الفنيون ({staff.length})</Text>

      {loading ? <ActivityIndicator color={C.primary} /> : staff.filter(s => s.role === 'technician').map(s => (
        <View key={s.id} style={styles.staffCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{s.name?.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.staffName}>{s.name}</Text>
            <Text style={styles.staffDept}>{s.department || 'غير محدد'} · {s.specialization || ''}</Text>
          </View>
          <StatusDot online={s.last_seen && (Date.now() - new Date(s.last_seen).getTime()) < 300000} />
        </View>
      ))}

      <View style={styles.usageCard}>
        <Text style={styles.usageTitle}>📊 استخدامات بيانات الموقع</Text>
        {[
          'حساب وقت التنقل بين المعدات',
          'تحديد أقرب فني للمعدة المعطلة',
          'تحليل Wrench Time الفعلي',
          'تقارير كفاءة الفنيين',
          'تحسين توزيع مهام الصيانة',
        ].map((u, i) => (
          <View key={i} style={styles.usageRow}>
            <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
            <Text style={styles.usageTxt}>{u}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  myLocationCard: { backgroundColor: C.white, borderRadius: 14, padding: 16, marginBottom: 12, elevation: 3 },
  trackingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  trackingLabel: { fontSize: 15, fontWeight: 'bold', color: C.text },
  coords: { fontSize: 12, color: C.sub, textAlign: 'right', marginBottom: 6 },
  trackingHint: { fontSize: 12, color: C.sub, textAlign: 'right' },
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, marginBottom: 14, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 12, color: '#1565C0', textAlign: 'right', lineHeight: 18 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 10 },
  staffCard: { backgroundColor: C.white, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + '22', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 16, fontWeight: 'bold', color: C.primary },
  staffName: { fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'right' },
  staffDept: { fontSize: 12, color: C.sub, textAlign: 'right' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  usageCard: { backgroundColor: '#E8F5E9', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#A5D6A7', marginTop: 6 },
  usageTitle: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32', textAlign: 'right', marginBottom: 10 },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'flex-end' },
  usageTxt: { fontSize: 13, color: C.text },
});
