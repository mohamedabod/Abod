import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import {
  getEquipmentStatusColor,
  getRequestsForEquipment,
  formatDate,
  getRelativeTime,
} from '../../utils/helpers';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  success: '#2E7D32',
  danger: '#D32F2F',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
};

const EQUIPMENT_STATUS_OPTIONS = [
  { label: 'يعمل', value: 'working', color: '#2E7D32' },
  { label: 'يحتاج صيانة', value: 'needs-maintenance', color: '#FF6F00' },
  { label: 'معطل', value: 'broken', color: '#D32F2F' },
];

const EquipmentDetailScreen = ({ route, navigation }) => {
  const { equipmentId } = route.params;
  const { state, actions } = useApp();
  const { equipment, requests, technicians } = state;
  const [showStatusModal, setShowStatusModal] = useState(false);

  const item = useMemo(
    () => equipment.find((e) => e.id === equipmentId),
    [equipment, equipmentId]
  );

  const equipRequests = useMemo(
    () =>
      getRequestsForEquipment(requests, equipmentId).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      ),
    [requests, equipmentId]
  );

  const activeRequests = useMemo(
    () => equipRequests.filter((r) => r.status === 'pending' || r.status === 'in-progress'),
    [equipRequests]
  );

  const completedRequests = useMemo(
    () => equipRequests.filter((r) => r.status === 'completed'),
    [equipRequests]
  );

  const getTechName = (techId) => {
    if (!techId) return 'غير مُسند';
    const tech = technicians.find((t) => t.id === techId);
    return tech ? tech.name : 'غير محدد';
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={60} color="#9E9E9E" />
          <Text style={styles.notFoundText}>المعدة غير موجودة</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>العودة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getEquipmentStatusColor(item.status);

  const handleStatusChange = (newStatus) => {
    setShowStatusModal(false);
    if (newStatus === item.status) return;
    actions.updateEquipment(equipmentId, { status: newStatus });
  };

  const handleDelete = () => {
    if (activeRequests.length > 0) {
      Alert.alert(
        'لا يمكن الحذف',
        'لا يمكن حذف المعدة لأن لها طلبات صيانة نشطة. أكمل أو ألغِ الطلبات أولاً.'
      );
      return;
    }

    Alert.alert(
      'حذف المعدة',
      `هل أنت متأكد من حذف "${item.name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            actions.deleteEquipment(equipmentId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={[styles.headerCard, { borderTopColor: statusColor }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() => setShowStatusModal(true)}
            >
              <StatusBadge status={item.status} type="equipment" size="medium" />
              <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.equipIcon}>
            <Ionicons name="cog" size={40} color={statusColor} />
          </View>

          <Text style={styles.equipName}>{item.name}</Text>
          <Text style={styles.equipModel}>{item.model}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.primary }]}>
                {activeRequests.length}
              </Text>
              <Text style={styles.statLabel}>طلب نشط</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.success }]}>
                {completedRequests.length}
              </Text>
              <Text style={styles.statLabel}>صيانة مكتملة</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{equipRequests.length}</Text>
              <Text style={styles.statLabel}>إجمالي</Text>
            </View>
          </View>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>تفاصيل المعدة</Text>
          <View style={styles.detailsCard}>
            <DetailRow
              icon="barcode-outline"
              label="الرقم التسلسلي"
              value={item.serialNumber}
            />
            <DetailRow
              icon="location-outline"
              label="الموقع"
              value={item.location}
            />
            {item.purchaseDate && (
              <DetailRow
                icon="bag-outline"
                label="تاريخ الشراء"
                value={formatDate(item.purchaseDate)}
              />
            )}
            {item.lastMaintenanceDate && (
              <DetailRow
                icon="time-outline"
                label="آخر صيانة"
                value={formatDate(item.lastMaintenanceDate)}
                valueColor={COLORS.success}
              />
            )}
          </View>
        </View>

        {/* Active Requests */}
        {activeRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>طلبات الصيانة النشطة ({activeRequests.length})</Text>
            {activeRequests.map((req) => (
              <TouchableOpacity
                key={req.id}
                style={styles.reqCard}
                onPress={() =>
                  navigation.navigate('RequestsTab', {
                    screen: 'RequestDetail',
                    params: { requestId: req.id },
                  })
                }
              >
                <View style={styles.reqHeader}>
                  <StatusBadge status={req.status} size="small" />
                  <Text style={styles.reqTitle} numberOfLines={1}>
                    {req.title}
                  </Text>
                </View>
                <Text style={styles.reqTech}>الفني: {getTechName(req.technicianId)}</Text>
                <Text style={styles.reqDate}>{getRelativeTime(req.createdAt)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Maintenance History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            سجل الصيانة ({completedRequests.length})
          </Text>
          {completedRequests.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="لا يوجد سجل صيانة"
              subtitle="لم تُكمل أي صيانة لهذه المعدة بعد"
              color="#BDBDBD"
            />
          ) : (
            completedRequests.map((req) => (
              <TouchableOpacity
                key={req.id}
                style={[styles.reqCard, styles.reqCardCompleted]}
                onPress={() =>
                  navigation.navigate('RequestsTab', {
                    screen: 'RequestDetail',
                    params: { requestId: req.id },
                  })
                }
              >
                <View style={styles.reqHeader}>
                  <StatusBadge status={req.status} size="small" />
                  <Text style={styles.reqTitle} numberOfLines={1}>
                    {req.title}
                  </Text>
                </View>
                <Text style={styles.reqTech}>الفني: {getTechName(req.technicianId)}</Text>
                {req.completedAt && (
                  <Text style={styles.reqDate}>
                    اكتمل: {formatDate(req.completedAt)}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Action */}
        <TouchableOpacity
          style={styles.newRequestBtn}
          onPress={() =>
            navigation.navigate('RequestsTab', { screen: 'NewRequest' })
          }
        >
          <Ionicons name="add-circle-outline" size={20} color="#FFF" />
          <Text style={styles.newRequestBtnText}>إنشاء طلب صيانة جديد</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Status Modal */}
      <Modal
        visible={showStatusModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>تغيير حالة المعدة</Text>
            {EQUIPMENT_STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusOpt,
                  item.status === opt.value && styles.statusOptActive,
                ]}
                onPress={() => handleStatusChange(opt.value)}
              >
                <View style={styles.optLeft}>
                  {item.status === opt.value && (
                    <Ionicons name="checkmark" size={18} color={opt.color} />
                  )}
                </View>
                <Text style={[styles.optText, { color: opt.color }]}>{opt.label}</Text>
                <View style={[styles.optDot, { backgroundColor: opt.color }]} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowStatusModal(false)}
            >
              <Text style={styles.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const DetailRow = ({ icon, label, value, valueColor }) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>
      {value || 'غير محدد'}
    </Text>
    <View style={styles.detailLabel}>
      <Text style={styles.detailLabelText}>{label}</Text>
      <Ionicons name={icon} size={15} color="#9E9E9E" />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  notFound: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  notFoundText: { fontSize: 18, color: '#9E9E9E' },
  backBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: { color: '#FFF', fontWeight: '600' },

  headerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderTopWidth: 4,
    alignItems: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  statusButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  equipIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  equipName: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  equipModel: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16 },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statSep: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    gap: 14,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailLabelText: { fontSize: 13, color: COLORS.textSecondary },
  detailValue: { fontSize: 13, color: COLORS.text, fontWeight: '500', flex: 1, textAlign: 'left' },

  reqCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  reqCardCompleted: { borderLeftColor: COLORS.success },
  reqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  reqTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  reqTech: { fontSize: 12, color: COLORS.primary, textAlign: 'right', marginBottom: 2 },
  reqDate: { fontSize: 11, color: COLORS.textSecondary },

  newRequestBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    elevation: 3,
  },
  newRequestBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  statusOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F5F7FA',
    gap: 10,
  },
  statusOptActive: { backgroundColor: '#E8F0FE' },
  optLeft: { width: 24 },
  optText: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  optDot: { width: 12, height: 12, borderRadius: 6 },
  cancelBtn: {
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
});

export default EquipmentDetailScreen;
