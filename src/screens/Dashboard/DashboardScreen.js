import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import StatsCard from '../../components/StatsCard';
import StatusBadge from '../../components/StatusBadge';
import {
  countByStatus,
  getRelativeTime,
  getPriorityColor,
  getPriorityText,
} from '../../utils/helpers';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  success: '#2E7D32',
  warning: '#FF6F00',
  danger: '#D32F2F',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
};

const DashboardScreen = ({ navigation }) => {
  const { state } = useApp();
  const { requests, technicians, equipment } = state;

  const stats = useMemo(() => countByStatus(requests), [requests]);

  const equipmentStats = useMemo(() => ({
    working: equipment.filter((e) => e.status === 'working').length,
    needsMaintenance: equipment.filter((e) => e.status === 'needs-maintenance').length,
    broken: equipment.filter((e) => e.status === 'broken').length,
  }), [equipment]);

  const availableTechnicians = useMemo(
    () => technicians.filter((t) => t.status === 'available').length,
    [technicians]
  );

  const recentRequests = useMemo(
    () => [...requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
    [requests]
  );

  const getEquipmentName = (equipmentId) => {
    const eq = equipment.find((e) => e.id === equipmentId);
    return eq ? eq.name : 'غير محدد';
  };

  const getTechnicianName = (techId) => {
    const tech = technicians.find((t) => t.id === techId);
    return tech ? tech.name : 'غير مُسند';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>نظام إدارة الصيانة</Text>
          <Text style={styles.headerSubtitle}>لوحة التحكم الرئيسية</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="settings-outline" size={28} color={COLORS.primary} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Section */}
        <Text style={styles.sectionTitle}>نظرة عامة على الطلبات</Text>

        <StatsCard
          title="إجمالي طلبات الصيانة"
          value={requests.length}
          icon="clipboard-outline"
          color={COLORS.primary}
          onPress={() => navigation.navigate('RequestsTab')}
        />

        <View style={styles.row}>
          <View style={styles.halfCard}>
            <StatsCard
              title="معلق"
              value={stats.pending}
              icon="time-outline"
              color={COLORS.warning}
            />
          </View>
          <View style={styles.halfCard}>
            <StatsCard
              title="قيد التنفيذ"
              value={stats.inProgress}
              icon="construct-outline"
              color={COLORS.primary}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfCard}>
            <StatsCard
              title="مكتمل"
              value={stats.completed}
              icon="checkmark-circle-outline"
              color={COLORS.success}
            />
          </View>
          <View style={styles.halfCard}>
            <StatsCard
              title="ملغى"
              value={stats.cancelled}
              icon="close-circle-outline"
              color="#9E9E9E"
            />
          </View>
        </View>

        {/* Equipment Summary */}
        <Text style={styles.sectionTitle}>حالة المعدات</Text>

        <View style={styles.equipmentRow}>
          <View style={[styles.equipCard, { borderColor: COLORS.success }]}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            <Text style={[styles.equipNumber, { color: COLORS.success }]}>
              {equipmentStats.working}
            </Text>
            <Text style={styles.equipLabel}>يعمل</Text>
          </View>
          <View style={[styles.equipCard, { borderColor: COLORS.warning }]}>
            <Ionicons name="warning" size={24} color={COLORS.warning} />
            <Text style={[styles.equipNumber, { color: COLORS.warning }]}>
              {equipmentStats.needsMaintenance}
            </Text>
            <Text style={styles.equipLabel}>يحتاج صيانة</Text>
          </View>
          <View style={[styles.equipCard, { borderColor: COLORS.danger }]}>
            <Ionicons name="close-circle" size={24} color={COLORS.danger} />
            <Text style={[styles.equipNumber, { color: COLORS.danger }]}>
              {equipmentStats.broken}
            </Text>
            <Text style={styles.equipLabel}>معطل</Text>
          </View>
        </View>

        {/* Technicians Summary */}
        <View style={styles.techSummary}>
          <Ionicons name="people-outline" size={20} color={COLORS.primary} />
          <Text style={styles.techSummaryText}>
            {availableTechnicians} فني متاح من أصل {technicians.length} فني
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('TechniciansTab')}>
            <Text style={styles.viewAll}>عرض الكل</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Requests */}
        <View style={styles.sectionHeader}>
          <TouchableOpacity onPress={() => navigation.navigate('RequestsTab')}>
            <Text style={styles.viewAll}>عرض الكل</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>آخر الطلبات</Text>
        </View>

        {recentRequests.map((request) => (
          <TouchableOpacity
            key={request.id}
            style={styles.requestCard}
            onPress={() =>
              navigation.navigate('RequestsTab', {
                screen: 'RequestDetail',
                params: { requestId: request.id },
              })
            }
            activeOpacity={0.8}
          >
            <View style={styles.requestHeader}>
              <StatusBadge status={request.status} size="small" />
              <View style={styles.requestPriority}>
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: getPriorityColor(request.priority) },
                  ]}
                />
                <Text style={styles.requestTitle} numberOfLines={1}>
                  {request.title}
                </Text>
              </View>
            </View>
            <View style={styles.requestMeta}>
              <Text style={styles.requestMetaText}>{getRelativeTime(request.createdAt)}</Text>
              <Text style={styles.requestMetaText} numberOfLines={1}>
                {getEquipmentName(request.equipmentId)}
              </Text>
            </View>
            <Text style={styles.requestTech}>
              الفني: {getTechnicianName(request.technicianId)}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: COLORS.primary }]}
            onPress={() =>
              navigation.navigate('RequestsTab', { screen: 'NewRequest' })
            }
          >
            <Ionicons name="add-circle-outline" size={24} color="#FFF" />
            <Text style={styles.quickActionText}>طلب صيانة جديد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: COLORS.accent }]}
            onPress={() =>
              navigation.navigate('TechniciansTab', { screen: 'NewTechnician' })
            }
          >
            <Ionicons name="person-add-outline" size={24} color="#FFF" />
            <Text style={styles.quickActionText}>إضافة فني</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },
  headerIcon: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  viewAll: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfCard: {
    flex: 1,
  },
  equipmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  equipCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  equipNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  equipLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  techSummary: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  techSummaryText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'right',
  },
  requestCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestPriority: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  requestTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
    flex: 1,
  },
  requestMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  requestMetaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  requestTech: {
    fontSize: 12,
    color: COLORS.primary,
    textAlign: 'right',
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  quickAction: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  quickActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default DashboardScreen;
