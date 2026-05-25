import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import { workordersAPI } from '../../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const RISK_COLOR = { high: '#C62828', medium: '#FF6F00', low: '#2E7D32' };
const RISK_AR = { high: 'خطر عالي', medium: 'خطر متوسط', low: 'خطر منخفض' };

export default function PredictiveScreen() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/api/predictions');
      setPredictions(res.data);
    } catch (_) {} finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const createPreventiveWO = async (item) => {
    Alert.alert(
      'إنشاء أمر صيانة وقائية',
      `هل تريد إنشاء أمر صيانة وقائية لـ "${item.asset_name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'إنشاء', onPress: async () => {
          try {
            await workordersAPI.create({
              description: `[صيانة وقائية تنبؤية] ${item.asset_name} - ${item.reasoning}`,
              asset_id: item.asset_id,
              priority: item.risk_level === 'high' ? 'high' : 'medium',
              type: 'preventive',
            });
            Alert.alert('تم', 'تم إنشاء أمر الصيانة الوقائية');
          } catch (e) {
            Alert.alert('خطأ', e.response?.data?.error || e.message);
          }
        }}
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="trending-up" size={20} color="#fff" />
        <Text style={styles.headerTxt}>تنبؤ بالأعطال المحتملة</Text>
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> : (
        <FlatList
          data={predictions}
          keyExtractor={i => String(i.asset_id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { borderTopColor: RISK_COLOR[item.risk_level] }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.riskBadge, { backgroundColor: RISK_COLOR[item.risk_level] }]}>
                  <Text style={styles.riskTxt}>{RISK_AR[item.risk_level]}</Text>
                </View>
                <Text style={styles.assetName}>{item.asset_name}</Text>
              </View>
              {item.predicted_failure_date && (
                <Text style={styles.prediction}>⚡ توقع عطل محتمل: {item.predicted_failure_date}</Text>
              )}
              {item.confidence_pct && (
                <View style={styles.confRow}>
                  <View style={styles.confBarBg}>
                    <View style={[styles.confBarFill, { width: `${item.confidence_pct}%`, backgroundColor: RISK_COLOR[item.risk_level] }]} />
                  </View>
                  <Text style={styles.confTxt}>ثقة {item.confidence_pct}%</Text>
                </View>
              )}
              <Text style={styles.reasoning}>{item.reasoning}</Text>
              {item.risk_level !== 'low' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => createPreventiveWO(item)}>
                  <Ionicons name="construct" size={16} color="#fff" />
                  <Text style={styles.actionTxt}>إنشاء أمر صيانة وقائية</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="analytics-outline" size={56} color="#ccc" />
              <Text style={styles.emptyTxt}>لا توجد تنبؤات بعد — يحتاج النظام لبيانات كافية</Text>
              <Text style={styles.emptyHint}>يحتاج التنبؤ على الأقل 3 أشهر من بيانات الأعطال</Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14 },
  headerTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  card: { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, borderTopWidth: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  assetName: { fontSize: 14, fontWeight: 'bold', color: C.text, flex: 1, textAlign: 'right', marginLeft: 8 },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  riskTxt: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  prediction: { fontSize: 13, color: '#C62828', fontWeight: '600', textAlign: 'right', marginBottom: 8 },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  confBarBg: { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  confBarFill: { height: '100%', borderRadius: 3 },
  confTxt: { fontSize: 12, color: C.sub, minWidth: 60 },
  reasoning: { fontSize: 13, color: C.text, textAlign: 'right', lineHeight: 20, marginBottom: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', borderRadius: 10, padding: 12 },
  actionTxt: { color: '#fff', fontWeight: 'bold' },
  empty: { alignItems: 'center', padding: 50 },
  emptyTxt: { color: C.sub, fontSize: 14, marginTop: 12, textAlign: 'center' },
  emptyHint: { color: '#bbb', fontSize: 12, marginTop: 8, textAlign: 'center' },
});
