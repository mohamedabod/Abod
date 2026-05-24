import React, { useState, useMemo } from 'react';
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
import {
  formatDate,
  formatDateTime,
  getPriorityColor,
  getPriorityText,
  getStatusText,
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
  { label: 'معلق', value: 'pending', icon: 'time-outline', color: '#FF6F00' },
  { label: 'قيد التنفيذ', value: 'in-progress', icon: 'construct-outline', color: '#1565C0' },
  { label: 'مكتمل', value: 'completed', icon: 'checkmark-circle-outline', color: '#2E7D32' },
  { label: 'ملغى', value: 'cancelled', icon: 'close-circle-outline', color: '#757575' },
];

const RequestDetailScreen = ({ route, navigation }) => {
  const { requestId } = route.params;
  const { state, actions } = useApp();
  const { requests, equipment, technicians } = state;

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const request = useMemo(
    () => requests.find((r) => r.id === requestId),
    [requests, requestId]
  );

  const relatedEquipment = useMemo(
    () => equipment.find((e) => e.id === request?.equipmentId),
    [equipment, request]
  );

  const assignedTechnician = useMemo(
    () => technicians.find((t) => t.id === request?.technicianId),
    [technicians, request]
  );

  const availableTechnicians = useMemo(
    () => technicians.filter((t) => t.status !== 'offline'),
    [technicians]
  );

  if (!request) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={60} color="#9E9E9E" />
          <Text style={styles.notFoundText}>الطلب غير موجود</Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backBtnText}>العودة</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleStatusChange = (newStatus) => {
    setShowStatusModal(false);
    if (newStatus === request.status) return;

    Alert.alert(
      'تغيير الحالة',
      `هل تريد تغيير حالة الطلب إلى "${getStatusText(newStatus)}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: () => {
            actions.updateRequest(request.id, { status: newStatus });
          },
        },
      ]
    );
  };

  const handleAssignTechnician = (techId) => {
    setShowAssignModal(false);
    const tech = technicians.find((t) => t.id === techId);
    if (!tech) return;

    actions.updateRequest(request.id, {
      technicianId: techId,
      status: request.status === 'pending' ? 'in-progress' : request.status,
    });
    actions.updateTechnician(techId, { status: 'busy' });
  };

  const handleDeleteRequest = () => {
    Alert.alert(
      'حذف الطلب',
      'هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            actions.deleteRequest(request.id);
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={handleDeleteRequest}>
              <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
            </TouchableOpacity>
            <StatusBadge status={request.status} size="medium" />
          </View>

          <Text style={styles.requestTitle}>{request.title}</Text>

          <View style={styles.priorityRow}>
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: getPriorityColor(request.priority) + '20' },
              ]}
            >
              <View
                style={[
                  styles.priorityDot,
                  { backgroundColor: getPriorityColor(request.priority) },
                ]}
              />
              <Text
                style={[
                  styles.priorityText,
                  { color: getPriorityColor(request.priority) },
                ]}
              >
                أولوية {getPriorityText(request.priority)}
              </Text>
            </View>
          </View>

          <Text style={styles.description}>{request.description}</Text>
        </View>

        {/* Request Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>تفاصيل الطلب</Text>
          <View style={styles.detailsCard}>
            <DetailRow
              icon="person-outline"
              label="طلب بواسطة"
              value={request.requestedBy}
            />
            <DetailRow
              icon="calendar-outline"
              label="تاريخ الإنشاء"
              value={formatDateTime(request.createdAt)}
            />
            <DetailRow
              icon="time-outline"
              label="آخر تحديث"
              value={formatDateTime(request.updatedAt)}
            />
            {request.completedAt && (
              <DetailRow
                icon="checkmark-circle-outline"
                label="تاريخ الإكمال"
                value={formatDateTime(request.completedAt)}
                valueColor={COLORS.success}
              />
            )}
          </View>
        </View>

        {/* Equipment Info */}
        {relatedEquipment && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>المعدة المعنية</Text>
            <TouchableOpacity
              style={styles.linkedCard}
              onPress={() =>
                navigation.navigate('EquipmentTab', {
                  screen: 'EquipmentDetail',
                  params: { equipmentId: relatedEquipment.id },
                })
              }
            >
              <View style={styles.linkedContent}>
                <Text style={styles.linkedSubtext}>{relatedEquipment.location}</Text>
                <Text style={styles.linkedTitle}>{relatedEquipment.name}</Text>
              </View>
              <View style={styles.linkedIcon}>
                <Ionicons name="construct-outline" size={24} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Technician Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TouchableOpacity
              style={styles.assignBtn}
              onPress={() => setShowAssignModal(true)}
            >
              <Text style={styles.assignBtnText}>
                {assignedTechnician ? 'تغيير' : 'إسناد'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>الفني المعين</Text>
          </View>

          {assignedTechnician ? (
            <TouchableOpacity
              style={styles.techCard}
              onPress={() =>
                navigation.navigate('TechniciansTab', {
                  screen: 'TechnicianDetail',
                  params: { technicianId: assignedTechnician.id },
                })
              }
            >
              <View style={styles.techContent}>
                <StatusBadge
                  status={assignedTechnician.status}
                  type="technician"
                  size="small"
                />
                <Text style={styles.techSpecialty}>{assignedTechnician.specialty}</Text>
                <Text style={styles.techName}>{assignedTechnician.name}</Text>
              </View>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{assignedTechnician.avatar}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.unassignedCard}
              onPress={() => setShowAssignModal(true)}
            >
              <Ionicons name="person-add-outline" size={24} color={COLORS.textSecondary} />
              <Text style={styles.unassignedText}>لم يتم إسناد فني بعد</Text>
              <Text style={styles.tapToAssign}>اضغط لإسناد فني</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
            onPress={() => setShowStatusModal(true)}
          >
            <Ionicons name="sync-outline" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>تحديث الحالة</Text>
          </TouchableOpacity>
        </View>
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
            <Text style={styles.modalTitle}>تغيير حالة الطلب</Text>
            {STATUS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.statusOption,
                  request.status === option.value && styles.statusOptionActive,
                ]}
                onPress={() => handleStatusChange(option.value)}
              >
                <View style={styles.statusOptionLeft}>
                  {request.status === option.value && (
                    <Ionicons name="checkmark" size={18} color={option.color} />
                  )}
                </View>
                <Text style={[styles.statusOptionText, { color: option.color }]}>
                  {option.label}
                </Text>
                <Ionicons name={option.icon} size={22} color={option.color} />
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

      {/* Assign Technician Modal */}
      <Modal
        visible={showAssignModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>إسناد فني</Text>
            {availableTechnicians.map((tech) => (
              <TouchableOpacity
                key={tech.id}
                style={[
                  styles.techOption,
                  request.technicianId === tech.id && styles.techOptionActive,
                ]}
                onPress={() => handleAssignTechnician(tech.id)}
              >
                <View style={styles.techOptionLeft}>
                  {request.technicianId === tech.id && (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  )}
                </View>
                <View style={styles.techOptionInfo}>
                  <Text style={styles.techOptionSpecialty}>{tech.specialty}</Text>
                  <Text style={styles.techOptionName}>{tech.name}</Text>
                </View>
                <View style={styles.smallAvatar}>
                  <Text style={styles.smallAvatarText}>{tech.avatar}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowAssignModal(false)}
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
      {value}
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
  scrollContent: { padding: 16, paddingBottom: 32 },
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
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'right',
    lineHeight: 26,
    marginBottom: 10,
  },
  priorityRow: { alignItems: 'flex-end', marginBottom: 12 },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityText: { fontSize: 13, fontWeight: '600' },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'right',
    lineHeight: 22,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
    marginTop: 4,
  },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  assignBtn: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  assignBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },

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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailLabelText: { fontSize: 13, color: COLORS.textSecondary },
  detailValue: { fontSize: 13, color: COLORS.text, fontWeight: '500', flex: 1, textAlign: 'left' },

  linkedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  linkedContent: { flex: 1 },
  linkedTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
  linkedSubtext: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'right', marginBottom: 2 },
  linkedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  techCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  techContent: { flex: 1, alignItems: 'flex-end', gap: 4 },
  techName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  techSpecialty: { fontSize: 12, color: COLORS.textSecondary },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  unassignedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  unassignedText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  tapToAssign: { fontSize: 12, color: COLORS.primary },

  actions: { marginTop: 8, gap: 10 },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 3,
  },
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
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
  statusOptionLeft: { width: 24 },
  statusOptionText: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'right' },

  techOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F5F7FA',
    gap: 10,
  },
  techOptionActive: { backgroundColor: '#E8F0FE' },
  techOptionLeft: { width: 24 },
  techOptionInfo: { flex: 1, alignItems: 'flex-end' },
  techOptionName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  techOptionSpecialty: { fontSize: 12, color: COLORS.textSecondary },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },

  cancelBtn: {
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
});

export default RequestDetailScreen;
