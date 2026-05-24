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
  getTechnicianStatusColor,
  getTechnicianStatusText,
  getRequestsForTechnician,
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

const STATUS_OPTIONS = [
  { label: 'متاح', value: 'available', color: '#2E7D32' },
  { label: 'مشغول', value: 'busy', color: '#1565C0' },
  { label: 'غير متصل', value: 'offline', color: '#757575' },
];

const TechnicianDetailScreen = ({ route, navigation }) => {
  const { technicianId } = route.params;
  const { state, actions } = useApp();
  const { technicians, requests, equipment } = state;
  const [showStatusModal, setShowStatusModal] = useState(false);

  const technician = useMemo(
    () => technicians.find((t) => t.id === technicianId),
    [technicians, technicianId]
  );

  const techRequests = useMemo(
    () =>
      getRequestsForTechnician(requests, technicianId).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      ),
    [requests, technicianId]
  );

  const activeRequests = useMemo(
    () => techRequests.filter((r) => r.status === 'in-progress' || r.status === 'pending'),
    [techRequests]
  );

  const completedRequests = useMemo(
    () => techRequests.filter((r) => r.status === 'completed'),
    [techRequests]
  );

  const getEquipmentName = (equipmentId) => {
    const eq = equipment.find((e) => e.id === equipmentId);
    return eq ? eq.name : 'غير محدد';
  };

  if (!technician) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={60} color="#9E9E9E" />
          <Text style={styles.notFoundText}>الفني غير موجود</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>العودة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleStatusChange = (newStatus) => {
    setShowStatusModal(false);
    if (newStatus === technician.status) return;
    actions.updateTechnician(technicianId, { status: newStatus });
  };

  const handleDelete = () => {
    if (activeRequests.length > 0) {
      Alert.alert(
        'لا يمكن الحذف',
        'لا يمكن حذف الفني لأن لديه مهام نشطة. قم بإلغاء أو إكمال مهامه أولاً.'
      );
      return;
    }

    Alert.alert(
      'حذف الفني',
      `هل أنت متأكد من حذف "${technician.name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            actions.deleteTechnician(technicianId);
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
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <TouchableOpacity onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editStatus}
              onPress={() => setShowStatusModal(true)}
            >
              <StatusBadge status={technician.status} type="technician" size="medium" />
              <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.profileCenter}>
            <View
              style={[
                styles.bigAvatar,
                { backgroundColor: getTechnicianStatusColor(technician.status) },
              ]}
            >
              <Text style={styles.bigAvatarText}>{technician.avatar}</Text>
            </View>
            <Text style={styles.techName}>{technician.name}</Text>
            <Text style={styles.techSpecialty}>{technician.specialty}</Text>
          </View>

          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{completedRequests.length}</Text>
              <Text style={styles.profileStatLabel}>مهمة مكتملة</Text>
            </View>
            <View style={styles.profileStatSep} />
            <View style={styles.profileStat}>
              <Text style={[styles.profileStatValue, { color: COLORS.primary }]}>
                {activeRequests.length}
              </Text>
              <Text style={styles.profileStatLabel}>مهمة نشطة</Text>
            </View>
            <View style={styles.profileStatSep} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{techRequests.length}</Text>
              <Text style={styles.profileStatLabel}>إجمالي</Text>
            </View>
          </View>
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>معلومات الاتصال</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{technician.phone}</Text>
              <View style={styles.infoLabel}>
                <Ionicons name="call-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoLabelText}>رقم الهاتف</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{technician.specialty}</Text>
              <View style={styles.infoLabel}>
                <Ionicons name="construct-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoLabelText}>التخصص</Text>
              </View>
            </View>
            {technician.createdAt && (
              <View style={styles.infoRow}>
                <Text style={styles.infoValue}>{formatDate(technician.createdAt)}</Text>
                <View style={styles.infoLabel}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabelText}>تاريخ الانضمام</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Active Requests */}
        {activeRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              المهام النشطة ({activeRequests.length})
            </Text>
            {activeRequests.map((req) => (
              <TouchableOpacity
                key={req.id}
                style={styles.requestCard}
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
                <Text style={styles.reqEquipment} numberOfLines={1}>
                  {getEquipmentName(req.equipmentId)}
                </Text>
                <Text style={styles.reqDate}>{getRelativeTime(req.createdAt)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Completed Requests */}
        {completedRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              المهام المكتملة ({completedRequests.length})
            </Text>
            {completedRequests.slice(0, 5).map((req) => (
              <TouchableOpacity
                key={req.id}
                style={[styles.requestCard, styles.requestCardCompleted]}
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
                <Text style={styles.reqEquipment} numberOfLines={1}>
                  {getEquipmentName(req.equipmentId)}
                </Text>
                <Text style={styles.reqDate}>{formatDate(req.completedAt)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {techRequests.length === 0 && (
          <EmptyState
            icon="clipboard-outline"
            title="لا توجد مهام"
            subtitle="لم يتم إسناد أي مهام لهذا الفني بعد"
          />
        )}
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
            <Text style={styles.modalTitle}>تغيير الحالة</Text>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusOption,
                  technician.status === opt.value && styles.statusOptionActive,
                ]}
                onPress={() => handleStatusChange(opt.value)}
              >
                <View style={styles.optLeft}>
                  {technician.status === opt.value && (
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

  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  profileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  profileCenter: { alignItems: 'center', marginBottom: 16 },
  bigAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  bigAvatarText: { color: '#FFF', fontSize: 26, fontWeight: 'bold' },
  techName: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  techSpecialty: { fontSize: 14, color: COLORS.textSecondary },
  profileStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 14,
  },
  profileStat: { flex: 1, alignItems: 'center' },
  profileStatValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  profileStatLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  profileStatSep: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  infoCard: {
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
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoLabelText: { fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, color: COLORS.text, fontWeight: '500', flex: 1, textAlign: 'left' },

  requestCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  requestCardCompleted: { borderLeftColor: '#2E7D32' },
  reqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  reqTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  reqEquipment: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'right', marginBottom: 4 },
  reqDate: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'left' },

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
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F5F7FA',
    gap: 10,
  },
  statusOptionActive: { backgroundColor: '#E8F0FE' },
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

export default TechnicianDetailScreen;
