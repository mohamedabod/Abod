import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { dashboardAPI, pmAPI, inventoryAPI } from '../../services/api';

const C = {
  primary: '#1565C0',
  accent: '#FF6F00',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  sub: '#616161',
  success: '#2E7D32',
  danger: '#D32F2F',
  warning: '#FF6F00',
  border: '#E0E0E0',
};

const DashboardScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [upcomingPM, setUpcomingPM] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [sumRes, kpiRes, pmRes, stockRes] = await Promise.all([
        dashboardAPI.getSummary(),
        dashboardAPI.getKPIs(),
        pmAPI.getUpcoming(7),
        inventoryAPI.getLowStock(),
      ]);
      setSummary(sumRes.data);
      setKpis(kpiRes.data);
      setUpcomingPM(pmRes.data || []);
      setLowStock(stockRes.data || []);
    } catch (e) {
      setError('فشل تحميل البيانات. تحقق من الاتصال بالخادم.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, [fetchData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={56} color={C.sub} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchData(); }}>
          <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const wo = summary?.workorders || {};
  const pm = summary?.pm || {};

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={C.danger} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>مرحباً، {user?.name || 'المستخدم'}</Text>
          <Text style={styles.headerSub}>{user?.role || ''}</Text>
        </View>
        <View style={styles.headerLogo}>
          <Ionicons name="settings-outline" size={28} color={C.primary} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
      >
        {/* Alerts */}
        {pm.overdue_pm > 0 && (
          <View style={[styles.alert, { backgroundColor: C.danger + '15', borderColor: C.danger }]}>
            <Ionicons name="warning" size={18} color={C.danger} />
            <Text style={[styles.alertText, { color: C.danger }]}>
              {pm.overdue_pm} صيانة وقائية متأخرة
            </Text>
          </View>
        )}
        {lowStock.length > 0 && (
          <View style={[styles.alert, { backgroundColor: C.warning + '15', borderColor: C.warning }]}>
            <Ionicons name="alert-circle" size={18} color={C.warning} />
            <Text style={[styles.alertText, { color: C.warning }]}>
              {lowStock.length} صنف بمخزون منخفض
            </Text>
          </View>
        )}

        {/* WO Stat Cards */}
        <Text style={styles.sectionTitle}>أوامر العمل</Text>
        <View style={styles.row}>
          <StatCard label="مفتوح" value={wo.open ?? 0} color={C.primary} icon="folder-open-outline" />
          <StatCard label="جاري" value={wo.inprogress ?? 0} color={C.accent} icon="construct-outline" />
        </View>
        <View style={styles.row}>
          <StatCard label="مُنجز (الشهر)" value={wo.done_month ?? 0} color={C.success} icon="checkmark-circle-outline" />
          <StatCard label="متأخر" value={wo.overdue ?? 0} color={C.danger} icon="time-outline" />
        </View>

        {/* KPI Strip */}
        <Text style={styles.sectionTitle}>مؤشرات الأداء</Text>
        <View style={styles.kpiStrip}>
          <KpiItem label="الامتثال الوقائي" value={kpis ? `${kpis.pm_compliance ?? 0}%` : '--'} />
          <View style={styles.kpiSep} />
          <KpiItem label="متوسط وقت الإصلاح" value={kpis ? `${kpis.mttr_days ?? 0} يوم` : '--'} />
          <View style={styles.kpiSep} />
          <KpiItem label="مخزون منخفض" value={kpis ? `${kpis.low_stock ?? 0}` : '--'} />
        </View>

        {/* Upcoming PM */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>الصيانة القادمة</Text>
        </View>
        {upcomingPM.slice(0, 3).map((item, idx) => (
          <View key={item.id ?? idx} style={styles.pmCard}>
            <View style={styles.pmRight}>
              <Text style={styles.pmName} numberOfLines={1}>{item.name || item.task_name || 'صيانة وقائية'}</Text>
              <Text style={styles.pmMeta}>{item.asset_name || ''} • {item.due_date || ''}</Text>
            </View>
            <Ionicons name="calendar-outline" size={20} color={C.primary} />
          </View>
        ))}
        {upcomingPM.length === 0 && (
          <Text style={styles.emptyNote}>لا توجد صيانة وقائية قادمة</Text>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: C.primary }]}
            onPress={() => navigation.navigate('RequestsTab', { screen: 'NewRequest' })}
          >
            <Ionicons name="add-circle-outline" size={22} color="#FFF" />
            <Text style={styles.quickBtnText}>طلب جديد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: C.accent }]}
            onPress={() => navigation.navigate('EquipmentTab')}
          >
            <Ionicons name="cog-outline" size={22} color="#FFF" />
            <Text style={styles.quickBtnText}>المعدات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: '#546E7A' }]}
            onPress={() => navigation.navigate('ReportsTab')}
          >
            <Ionicons name="bar-chart-outline" size={22} color="#FFF" />
            <Text style={styles.quickBtnText}>التقارير</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const StatCard = ({ label, value, color, icon }) => (
  <View style={[styles.statCard, { borderTopColor: color }]}>
    <Ionicons name={icon} size={24} color={color} />
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const KpiItem = ({ label, value }) => (
  <View style={styles.kpiItem}>
    <Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: C.bg },
  loadingText: { fontSize: 15, color: C.sub },
  errorText: { fontSize: 15, color: C.danger, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  header: {
    backgroundColor: C.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    elevation: 2,
  },
  logoutBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: C.text },
  headerSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  headerLogo: { padding: 4 },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  alertText: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    textAlign: 'right',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderTopWidth: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  statValue: { fontSize: 28, fontWeight: 'bold', marginTop: 6 },
  statLabel: { fontSize: 12, color: C.sub, marginTop: 4, textAlign: 'center' },

  kpiStrip: {
    backgroundColor: C.card,
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  kpiItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  kpiValue: { fontSize: 18, fontWeight: 'bold', color: C.primary },
  kpiLabel: { fontSize: 10, color: C.sub, marginTop: 3, textAlign: 'center' },
  kpiSep: { width: 1, backgroundColor: C.border, marginVertical: 10 },

  pmCard: {
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  pmRight: { flex: 1, alignItems: 'flex-end', marginRight: 10 },
  pmName: { fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'right' },
  pmMeta: { fontSize: 12, color: C.sub, marginTop: 2, textAlign: 'right' },
  emptyNote: { fontSize: 13, color: C.sub, textAlign: 'center', paddingVertical: 12 },

  quickActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  quickBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  quickBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});

export default DashboardScreen;
