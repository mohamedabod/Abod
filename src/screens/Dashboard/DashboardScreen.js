import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { dashboardAPI, pmAPI, inventoryAPI } from '../../services/api';

const C = { primary: '#1565C0', accent: '#FF6F00', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [dash, setDash] = useState(null);
  const [kpi, setKpi] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const [d, k, u, l] = await Promise.all([
        dashboardAPI.getSummary(), dashboardAPI.getKPIs(),
        pmAPI.getUpcoming(7), inventoryAPI.getLowStock(),
      ]);
      setDash(d.data); setKpi(k.data); setUpcoming(u.data); setLowStock(l.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'خطأ في الاتصال');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;

  const wo = dash?.workorders || {};
  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <View style={styles.header}>
        <TouchableOpacity onPress={logout}><Ionicons name="log-out-outline" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={styles.greeting}>مرحباً، {user?.name}</Text>
          <Text style={styles.role}>{user?.role}</Text>
        </View>
        <Ionicons name="construct" size={32} color="#fff" />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={load}><Text style={styles.retryText}>إعادة</Text></TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>أوامر الشغل</Text>
      <View style={styles.grid}>
        {[
          { label: 'مفتوح', value: wo.open, icon: 'alert-circle', color: '#FF6F00' },
          { label: 'جاري', value: wo.inprogress, icon: 'time', color: '#1565C0' },
          { label: 'منجز / شهر', value: wo.done_month, icon: 'checkmark-circle', color: '#2E7D32' },
          { label: 'متأخر', value: wo.overdue, icon: 'warning', color: '#C62828' },
        ].map(s => (
          <View key={s.label} style={[styles.card, { borderTopColor: s.color }]}>
            <Ionicons name={s.icon} size={22} color={s.color} />
            <Text style={styles.cardVal}>{s.value ?? '—'}</Text>
            <Text style={styles.cardLbl}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.kpiRow}>
        {[
          { label: 'الصيانة الوقائية', value: `${kpi?.pm_compliance ?? '—'}%` },
          { label: 'MTTR (يوم)', value: kpi?.mttr_days ?? '—' },
          { label: 'مخزون منخفض', value: kpi?.low_stock ?? '—', alert: (kpi?.low_stock || 0) > 0 },
        ].map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={{ width: 1, backgroundColor: '#eee' }} />}
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiVal, k.alert && { color: '#C62828' }]}>{k.value}</Text>
              <Text style={styles.kpiLbl}>{k.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {upcoming.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>صيانة وقائية قادمة (7 أيام)</Text>
          {upcoming.slice(0, 3).map(p => (
            <View key={p.id} style={styles.pmRow}>
              <Ionicons name="calendar" size={16} color={C.primary} />
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.pmTitle}>{p.title}</Text>
                <Text style={styles.pmSub}>{p.asset_name} · {p.next_due}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {(dash?.pm?.overdue_pm || 0) > 0 && (
        <View style={styles.alert}>
          <Ionicons name="warning" size={18} color="#C62828" />
          <Text style={styles.alertText}>{dash.pm.overdue_pm} صيانة وقائية متأخرة</Text>
        </View>
      )}
      {lowStock.length > 0 && (
        <View style={[styles.alert, { backgroundColor: '#FFF3E0', borderColor: '#FF6F00' }]}>
          <Ionicons name="cube" size={18} color="#FF6F00" />
          <Text style={[styles.alertText, { color: '#E65100' }]}>{lowStock.length} صنف مخزون منخفض</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
      <View style={styles.actionsRow}>
        {[
          { label: 'طلب جديد', icon: 'add-circle', onPress: () => navigation.navigate('Requests', { screen: 'NewRequest' }) },
          { label: 'المعدات', icon: 'construct', onPress: () => navigation.navigate('Equipment') },
          { label: 'التقارير', icon: 'bar-chart', onPress: () => navigation.navigate('Reports') },
        ].map(a => (
          <TouchableOpacity key={a.label} style={styles.actionBtn} onPress={a.onPress}>
            <Ionicons name={a.icon} size={26} color={C.primary} />
            <Text style={styles.actionLbl}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50 },
  greeting: { fontSize: 17, fontWeight: 'bold', color: '#fff', textAlign: 'right' },
  role: { fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  errorBox: { margin: 12, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorText: { color: '#C62828', fontSize: 13, flex: 1 },
  retryText: { color: C.primary, fontWeight: 'bold', fontSize: 13, marginRight: 8 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: C.text, textAlign: 'right', margin: 14, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8 },
  card: { flex: 1, minWidth: '44%', backgroundColor: C.white, borderRadius: 12, padding: 14, alignItems: 'center', borderTopWidth: 4, elevation: 2 },
  cardVal: { fontSize: 26, fontWeight: 'bold', color: C.text, marginTop: 6 },
  cardLbl: { fontSize: 12, color: C.sub, marginTop: 4, textAlign: 'center' },
  kpiRow: { flexDirection: 'row', backgroundColor: C.white, marginHorizontal: 14, borderRadius: 12, padding: 14, marginTop: 8, elevation: 2 },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiVal: { fontSize: 20, fontWeight: 'bold', color: C.primary },
  kpiLbl: { fontSize: 11, color: C.sub, marginTop: 4, textAlign: 'center' },
  pmRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, marginHorizontal: 14, marginBottom: 6, borderRadius: 10, padding: 12 },
  pmTitle: { fontSize: 13, fontWeight: '600', color: C.text, textAlign: 'right' },
  pmSub: { fontSize: 12, color: C.sub, textAlign: 'right' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 10, borderWidth: 1, borderColor: '#EF9A9A' },
  alertText: { color: '#C62828', fontSize: 13, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', marginHorizontal: 14, gap: 8 },
  actionBtn: { flex: 1, alignItems: 'center', backgroundColor: C.white, borderRadius: 12, padding: 16, elevation: 2 },
  actionLbl: { fontSize: 12, color: C.text, marginTop: 6, textAlign: 'center' },
});
