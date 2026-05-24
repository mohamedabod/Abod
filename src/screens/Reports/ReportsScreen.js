import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { countByStatus, getRequestsForTechnician } from '../../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  success: '#2E7D32',
  danger: '#D32F2F',
  warning: '#FF6F00',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
};

const STATUS_COLORS = {
  pending: '#FF6F00',
  'in-progress': '#1565C0',
  completed: '#2E7D32',
  cancelled: '#757575',
};

const STATUS_LABELS = {
  pending: 'معلق',
  'in-progress': 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

// Simple bar chart component (no external charting library needed)
const SimpleBarChart = ({ data, maxValue, colorFn, labelFn }) => {
  const chartWidth = SCREEN_WIDTH - 64;
  const barMaxHeight = 120;

  return (
    <View style={chartStyles.container}>
      {data.map((item, index) => {
        const barHeight = maxValue > 0 ? (item.value / maxValue) * barMaxHeight : 0;
        const color = colorFn ? colorFn(item.key) : COLORS.primary;
        return (
          <View key={index} style={chartStyles.barGroup}>
            <Text style={chartStyles.barValue}>{item.value}</Text>
            <View style={[chartStyles.bar, { height: Math.max(barHeight, 4), backgroundColor: color }]} />
            <Text style={chartStyles.barLabel}>{labelFn ? labelFn(item.key) : item.key}</Text>
          </View>
        );
      })}
    </View>
  );
};

const chartStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 160,
    paddingBottom: 30,
    paddingTop: 20,
  },
  barGroup: { alignItems: 'center', flex: 1 },
  bar: { width: 32, borderRadius: 4, minHeight: 4 },
  barValue: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  barLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
});

// Horizontal progress bar
const ProgressBar = ({ value, max, color, label, count }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={pbStyles.row}>
      <Text style={pbStyles.count}>{count}</Text>
      <View style={pbStyles.barContainer}>
        <View style={[pbStyles.bar, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={pbStyles.label}>{label}</Text>
    </View>
  );
};

const pbStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  label: { fontSize: 12, color: COLORS.text, width: 80, textAlign: 'right', fontWeight: '500' },
  barContainer: {
    flex: 1,
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: 5, minWidth: 4 },
  count: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, width: 24, textAlign: 'center' },
});

const ReportsScreen = () => {
  const { state } = useApp();
  const { requests, technicians, equipment } = state;

  const stats = useMemo(() => countByStatus(requests), [requests]);

  const totalRequests = requests.length;

  // Priority breakdown
  const priorityStats = useMemo(() => ({
    high: requests.filter((r) => r.priority === 'high').length,
    medium: requests.filter((r) => r.priority === 'medium').length,
    low: requests.filter((r) => r.priority === 'low').length,
  }), [requests]);

  // Equipment stats
  const equipStats = useMemo(() => ({
    working: equipment.filter((e) => e.status === 'working').length,
    needs: equipment.filter((e) => e.status === 'needs-maintenance').length,
    broken: equipment.filter((e) => e.status === 'broken').length,
  }), [equipment]);

  // Technician performance
  const techPerformance = useMemo(() => {
    return technicians
      .map((t) => {
        const techReqs = getRequestsForTechnician(requests, t.id);
        const completed = techReqs.filter((r) => r.status === 'completed').length;
        const active = techReqs.filter(
          (r) => r.status === 'in-progress' || r.status === 'pending'
        ).length;
        return { ...t, completed, active, total: techReqs.length };
      })
      .filter((t) => t.total > 0)
      .sort((a, b) => b.completed - a.completed);
  }, [technicians, requests]);

  // Monthly trend (last 6 months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleDateString('ar-EG', { month: 'short' });
      const count = requests.filter((r) => {
        const rd = new Date(r.createdAt);
        return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
      }).length;
      months.push({ key: monthName, value: count });
    }
    return months;
  }, [requests]);

  const maxMonthly = Math.max(...monthlyData.map((m) => m.value), 1);

  const statusBarData = [
    { key: 'pending', value: stats.pending },
    { key: 'in-progress', value: stats.inProgress },
    { key: 'completed', value: stats.completed },
    { key: 'cancelled', value: stats.cancelled },
  ];

  const maxStatus = Math.max(...statusBarData.map((s) => s.value), 1);

  const completionRate = totalRequests > 0
    ? Math.round((stats.completed / totalRequests) * 100)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="bar-chart-outline" size={24} color={COLORS.primary} />
        <Text style={styles.headerTitle}>التقارير والإحصائيات</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI Cards */}
        <Text style={styles.sectionTitle}>مؤشرات الأداء الرئيسية</Text>
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { borderTopColor: COLORS.primary }]}>
            <Ionicons name="clipboard-outline" size={24} color={COLORS.primary} />
            <Text style={[styles.kpiValue, { color: COLORS.primary }]}>{totalRequests}</Text>
            <Text style={styles.kpiLabel}>إجمالي الطلبات</Text>
          </View>
          <View style={[styles.kpiCard, { borderTopColor: COLORS.success }]}>
            <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.success} />
            <Text style={[styles.kpiValue, { color: COLORS.success }]}>{completionRate}%</Text>
            <Text style={styles.kpiLabel}>معدل الإنجاز</Text>
          </View>
        </View>
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { borderTopColor: COLORS.accent }]}>
            <Ionicons name="people-outline" size={24} color={COLORS.accent} />
            <Text style={[styles.kpiValue, { color: COLORS.accent }]}>
              {technicians.filter((t) => t.status === 'available').length}
            </Text>
            <Text style={styles.kpiLabel}>فنيون متاحون</Text>
          </View>
          <View style={[styles.kpiCard, { borderTopColor: COLORS.danger }]}>
            <Ionicons name="warning-outline" size={24} color={COLORS.danger} />
            <Text style={[styles.kpiValue, { color: COLORS.danger }]}>
              {equipStats.broken + equipStats.needs}
            </Text>
            <Text style={styles.kpiLabel}>معدات تحتاج تدخل</Text>
          </View>
        </View>

        {/* Requests by Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>الطلبات حسب الحالة</Text>
          <SimpleBarChart
            data={statusBarData}
            maxValue={maxStatus}
            colorFn={(key) => STATUS_COLORS[key]}
            labelFn={(key) => STATUS_LABELS[key]}
          />
          <View style={styles.progressSection}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <ProgressBar
                key={key}
                value={
                  key === 'pending' ? stats.pending :
                  key === 'in-progress' ? stats.inProgress :
                  key === 'completed' ? stats.completed :
                  stats.cancelled
                }
                max={totalRequests || 1}
                color={STATUS_COLORS[key]}
                label={label}
                count={
                  key === 'pending' ? stats.pending :
                  key === 'in-progress' ? stats.inProgress :
                  key === 'completed' ? stats.completed :
                  stats.cancelled
                }
              />
            ))}
          </View>
        </View>

        {/* Monthly Trend */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>الطلبات الشهرية (آخر 6 أشهر)</Text>
          <SimpleBarChart
            data={monthlyData}
            maxValue={maxMonthly}
            colorFn={() => COLORS.primary}
          />
        </View>

        {/* Priority Distribution */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>توزيع الأولويات</Text>
          <View style={styles.progressSection}>
            <ProgressBar
              value={priorityStats.high}
              max={totalRequests || 1}
              color="#D32F2F"
              label="عالية"
              count={priorityStats.high}
            />
            <ProgressBar
              value={priorityStats.medium}
              max={totalRequests || 1}
              color="#FF6F00"
              label="متوسطة"
              count={priorityStats.medium}
            />
            <ProgressBar
              value={priorityStats.low}
              max={totalRequests || 1}
              color="#388E3C"
              label="منخفضة"
              count={priorityStats.low}
            />
          </View>
        </View>

        {/* Equipment Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>حالة المعدات ({equipment.length} معدة)</Text>
          <View style={styles.equipGrid}>
            <View style={[styles.equipItem, { backgroundColor: COLORS.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
              <Text style={[styles.equipCount, { color: COLORS.success }]}>{equipStats.working}</Text>
              <Text style={styles.equipLabel}>تعمل بكفاءة</Text>
            </View>
            <View style={[styles.equipItem, { backgroundColor: COLORS.warning + '15' }]}>
              <Ionicons name="warning" size={32} color={COLORS.warning} />
              <Text style={[styles.equipCount, { color: COLORS.warning }]}>{equipStats.needs}</Text>
              <Text style={styles.equipLabel}>تحتاج صيانة</Text>
            </View>
            <View style={[styles.equipItem, { backgroundColor: COLORS.danger + '15' }]}>
              <Ionicons name="close-circle" size={32} color={COLORS.danger} />
              <Text style={[styles.equipCount, { color: COLORS.danger }]}>{equipStats.broken}</Text>
              <Text style={styles.equipLabel}>معطلة</Text>
            </View>
          </View>

          {equipment.length > 0 && (
            <View style={styles.operationalRate}>
              <View style={styles.operationalBar}>
                <View
                  style={[
                    styles.operationalFill,
                    { width: `${(equipStats.working / equipment.length) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.operationalText}>
                معدل التشغيل:{' '}
                {Math.round((equipStats.working / equipment.length) * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* Technician Performance */}
        {techPerformance.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>أداء الفنيين</Text>
            {techPerformance.map((tech, index) => (
              <View key={tech.id} style={styles.techRow}>
                <View style={styles.techRank}>
                  <Text style={styles.techRankText}>#{index + 1}</Text>
                </View>
                <View style={[styles.smallAvatar, {
                  backgroundColor:
                    tech.status === 'available' ? COLORS.success :
                    tech.status === 'busy' ? COLORS.primary : '#757575'
                }]}>
                  <Text style={styles.smallAvatarText}>{tech.avatar}</Text>
                </View>
                <View style={styles.techInfo}>
                  <Text style={styles.techName} numberOfLines={1}>{tech.name}</Text>
                  <View style={styles.techStats}>
                    <View style={styles.techStat}>
                      <Text style={[styles.techStatValue, { color: COLORS.success }]}>
                        {tech.completed}
                      </Text>
                      <Text style={styles.techStatLabel}>مكتمل</Text>
                    </View>
                    <View style={styles.techStat}>
                      <Text style={[styles.techStatValue, { color: COLORS.primary }]}>
                        {tech.active}
                      </Text>
                      <Text style={styles.techStatLabel}>نشط</Text>
                    </View>
                    <View style={styles.techStat}>
                      <Text style={styles.techStatValue}>{tech.total}</Text>
                      <Text style={styles.techStatLabel}>مجموع</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Summary footer */}
        <View style={styles.summaryCard}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
          <Text style={styles.summaryText}>
            آخر تحديث: الآن | البيانات محفوظة محلياً على الجهاز
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 2,
    justifyContent: 'flex-end',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 12,
  },

  kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  kpiValue: { fontSize: 28, fontWeight: 'bold' },
  kpiLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingBottom: 10,
  },
  progressSection: { marginTop: 8 },

  equipGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  equipItem: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  equipCount: { fontSize: 22, fontWeight: 'bold' },
  equipLabel: { fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  operationalRate: { gap: 6 },
  operationalBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  operationalFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 4,
    minWidth: 4,
  },
  operationalText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'right' },

  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 10,
  },
  techRank: {
    width: 24,
    alignItems: 'center',
  },
  techRankText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  techInfo: { flex: 1 },
  techName: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 4 },
  techStats: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  techStat: { alignItems: 'center' },
  techStatValue: { fontSize: 15, fontWeight: 'bold', color: COLORS.text },
  techStatLabel: { fontSize: 10, color: COLORS.textSecondary },

  summaryCard: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '20',
  },
  summaryText: { flex: 1, fontSize: 12, color: COLORS.primary, textAlign: 'right' },
});

export default ReportsScreen;
