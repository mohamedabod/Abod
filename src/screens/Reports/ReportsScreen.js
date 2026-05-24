import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { dashboardAPI, workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', accent: '#FF6F00', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function ReportsScreen() {
  const [kpi, setKpi] = useState(null);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const [k, d] = await Promise.all([dashboardAPI.getKPIs(), dashboardAPI.getSummary()]);
      setKpi(k.data);
      setDash(d.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  if (error) return (
    <View style={styles.center}>
      <Text style={{ color: '#C62828', marginBottom: 12 }}>⚠️ {error}</Text>
      <TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة المحاولة</Text></TouchableOpacity>
    </View>
  );

  const wo = dash?.workorders || {};
  const pm = dash?.pm || {};

  const KpiCard = ({ icon, label, value, unit, color, sub }) => (
    <View style={[styles.kpiCard, { borderTopColor: color }]}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.kpiVal, { color }]}>{value ?? '—'}{unit || ''}</Text>
      <Text style={styles.kpiLbl}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );

  const StatRow = ({ label, value, color }) => (
    <View style={styles.statRow}>
      <Text style={[styles.statVal, color && { color }]}>{value ?? '—'}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

      <Text style={styles.sectionTitle}>مؤشرات الأداء الرئيسية</Text>
      <View style={styles.kpiGrid}>
        <KpiCard icon="shield-checkmark" label="الالتزام بالصيانة الوقائية" value={kpi?.pm_compliance} unit="%" color="#2E7D32" />
        <KpiCard icon="time" label="متوسط وقت الإصلاح" value={kpi?.mttr_days} unit=" يوم" color="#1565C0" sub="MTTR" />
        <KpiCard icon="cube" label="أصناف مخزون منخفضة" value={kpi?.low_stock} color={kpi?.low_stock > 0 ? '#C62828' : '#2E7D32'} />
        <KpiCard icon="trending-up" label="توافر المعدات" value={kpi?.availability} unit="%" color="#FF6F00" />
      </View>

      <Text style={styles.sectionTitle}>إحصائيات أوامر الشغل</Text>
      <View style={styles.card}>
        <StatRow label="إجمالي هذا الشهر" value={wo.total_month} />
        <StatRow label="مفتوح حالياً" value={wo.open} color="#FF6F00" />
        <StatRow label="جاري التنفيذ" value={wo.inprogress} color="#1565C0" />
        <StatRow label="منجز هذا الشهر" value={wo.done_month} color="#2E7D32" />
        <StatRow label="متأخر" value={wo.overdue} color="#C62828" />
        <StatRow label="ملغي" value={wo.cancelled} color="#999" />
      </View>

      <Text style={styles.sectionTitle}>الصيانة الوقائية</Text>
      <View style={styles.card}>
        <StatRow label="إجمالي الخطط" value={pm.total_pm} />
        <StatRow label="نشط" value={pm.active_pm} color="#2E7D32" />
        <StatRow label="متأخر" value={pm.overdue_pm} color="#C62828" />
      </View>

      {kpi?.by_priority && (
        <>
          <Text style={styles.sectionTitle}>توزيع أوامر الشغل حسب الأولوية</Text>
          <View style={styles.card}>
            {[
              { label: 'عالي', key: 'high', color: '#C62828' },
              { label: 'متوسط', key: 'medium', color: '#FF6F00' },
              { label: 'منخفض', key: 'low', color: '#2E7D32' },
            ].map(p => {
              const val = kpi.by_priority[p.key] || 0;
              const total = (kpi.by_priority.high || 0) + (kpi.by_priority.medium || 0) + (kpi.by_priority.low || 0);
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <View key={p.key} style={{ marginBottom: 12 }}>
                  <View style={styles.barHeader}>
                    <Text style={{ fontSize: 13, color: C.sub }}>{pct}%</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: p.color }}>{p.label} ({val})</Text>
                  </View>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: p.color }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: C.text, textAlign: 'right', margin: 14, marginBottom: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8 },
  kpiCard: { flex: 1, minWidth: '44%', backgroundColor: C.white, borderRadius: 12, padding: 16, alignItems: 'center', borderTopWidth: 4, elevation: 2 },
  kpiVal: { fontSize: 24, fontWeight: 'bold', marginTop: 8 },
  kpiLbl: { fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 4 },
  kpiSub: { fontSize: 10, color: '#999', marginTop: 2 },
  card: { backgroundColor: C.white, marginHorizontal: 14, borderRadius: 14, padding: 16, elevation: 2 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  statLbl: { fontSize: 14, color: C.sub },
  statVal: { fontSize: 18, fontWeight: 'bold', color: C.text },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barBg: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});
