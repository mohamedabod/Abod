import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { dashboardAPI, workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function WrenchTimeScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState(30);

  const load = async () => {
    try {
      const kpi = await dashboardAPI.getKPIs();
      setData(kpi.data);
    } catch (e) { } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [period]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;

  const wrenchTimePct = data?.wrench_time_pct || 32;
  const travelPct = data?.travel_time_pct || 28;
  const waitPct = 100 - wrenchTimePct - travelPct;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <View style={styles.periodRow}>
        {[7, 30, 90].map(p => (
          <TouchableOpacity key={p} style={[styles.periodBtn, period === p && styles.periodActive]} onPress={() => setPeriod(p)}>
            <Text style={[styles.periodTxt, period === p && styles.periodTxtActive]}>{p} يوم</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.highlight}>
        <Text style={styles.highlightTitle}>Wrench Time الفعلي</Text>
        <Text style={styles.highlightVal}>{wrenchTimePct}%</Text>
        <Text style={styles.highlightSub}>من وقت الفني للإصلاح الفعلي</Text>
        <Text style={styles.benchmark}>المعيار العالمي: 25–35%</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>توزيع وقت الفنيين</Text>
        {[
          { label: 'إصلاح فعلي (Wrench Time)', pct: wrenchTimePct, color: '#2E7D32' },
          { label: 'تنقل للمعدة', pct: travelPct, color: '#FF6F00' },
          { label: 'انتظار (أذونات / قطع غيار)', pct: waitPct, color: '#C62828' },
        ].map(b => (
          <View key={b.label} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: b.color, fontWeight: 'bold' }}>{b.pct}%</Text>
              <Text style={{ fontSize: 13, color: C.text }}>{b.label}</Text>
            </View>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${b.pct}%`, backgroundColor: b.color }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 فرص تحسين الكفاءة</Text>
        {waitPct > 20 && <Text style={styles.tip}>⚠️ وقت الانتظار مرتفع — راجع عملية طلب قطع الغيار والتصاريح</Text>}
        {travelPct > 30 && <Text style={styles.tip}>⚠️ وقت التنقل مرتفع — فكر في إعادة توزيع الفنيين أو مخزن متنقل</Text>}
        {wrenchTimePct < 25 && <Text style={styles.tip}>⚠️ Wrench Time منخفض — ابحث عن المهام الإدارية اللي ممكن يتعملها التطبيق</Text>}
        {wrenchTimePct >= 35 && <Text style={styles.tip}>✅ Wrench Time ممتاز — أنتم فوق المعيار العالمي</Text>}
        <Text style={[styles.tip, { color: C.primary }]}>📊 لتسجيل أوقات الفنيين بدقة فعّل تتبع الموقع في شاشة الفنيين</Text>
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  periodRow: { flexDirection: 'row', margin: 14, gap: 8 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', backgroundColor: C.white },
  periodActive: { backgroundColor: C.primary, borderColor: C.primary },
  periodTxt: { fontSize: 13, color: C.sub },
  periodTxtActive: { color: '#fff', fontWeight: 'bold' },
  highlight: { backgroundColor: C.primary, margin: 14, marginTop: 0, borderRadius: 16, padding: 20, alignItems: 'center' },
  highlightTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  highlightVal: { color: '#fff', fontSize: 48, fontWeight: 'bold', marginVertical: 4 },
  highlightSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  benchmark: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 6 },
  card: { backgroundColor: C.white, marginHorizontal: 14, borderRadius: 14, padding: 16, elevation: 2, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 14 },
  barBg: { height: 10, backgroundColor: '#f0f0f0', borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  tipsCard: { backgroundColor: '#FFF8E1', marginHorizontal: 14, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#FFE082' },
  tipsTitle: { fontSize: 14, fontWeight: 'bold', color: '#F57F17', textAlign: 'right', marginBottom: 10 },
  tip: { fontSize: 13, color: C.text, textAlign: 'right', marginBottom: 8, lineHeight: 20 },
});
