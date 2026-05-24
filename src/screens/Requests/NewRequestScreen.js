import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { getPriorityColor, getPriorityText } from '../../utils/helpers';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
  danger: '#D32F2F',
};

const PRIORITIES = [
  { label: 'عالية', value: 'high', icon: 'arrow-up-circle', color: '#D32F2F' },
  { label: 'متوسطة', value: 'medium', icon: 'remove-circle', color: '#FF6F00' },
  { label: 'منخفضة', value: 'low', icon: 'arrow-down-circle', color: '#388E3C' },
];

const NewRequestScreen = ({ navigation }) => {
  const { state, actions } = useApp();
  const { equipment, technicians } = state;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [selectedTechnician, setSelectedTechnician] = useState(null);
  const [priority, setPriority] = useState('medium');
  const [requestedBy, setRequestedBy] = useState('');

  const [showEquipmentPicker, setShowEquipmentPicker] = useState(false);
  const [showTechPicker, setShowTechPicker] = useState(false);

  const isFormValid = title.trim() && description.trim() && selectedEquipment && requestedBy.trim();

  const handleSubmit = () => {
    if (!isFormValid) {
      Alert.alert('بيانات ناقصة', 'يرجى ملء جميع الحقول المطلوبة (العنوان، الوصف، المعدة، طالب الصيانة)');
      return;
    }

    const newRequest = actions.addRequest({
      title: title.trim(),
      description: description.trim(),
      equipmentId: selectedEquipment.id,
      technicianId: selectedTechnician?.id || null,
      priority,
      requestedBy: requestedBy.trim(),
    });

    if (newRequest && selectedTechnician) {
      actions.updateTechnician(selectedTechnician.id, { status: 'busy' });
    }

    Alert.alert('تم الحفظ', 'تم إنشاء طلب الصيانة بنجاح', [
      { text: 'حسناً', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>
            عنوان الطلب <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل عنوان الطلب"
            placeholderTextColor={COLORS.textSecondary}
            value={title}
            onChangeText={setTitle}
            textAlign="right"
            maxLength={120}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>
            وصف المشكلة <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="اشرح المشكلة بالتفصيل..."
            placeholderTextColor={COLORS.textSecondary}
            value={description}
            onChangeText={setDescription}
            textAlign="right"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        {/* Equipment Picker */}
        <View style={styles.field}>
          <Text style={styles.label}>
            المعدة <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.picker, !selectedEquipment && styles.pickerEmpty]}
            onPress={() => setShowEquipmentPicker(true)}
          >
            <Ionicons name="chevron-back-outline" size={18} color={COLORS.textSecondary} />
            <Text
              style={[styles.pickerText, !selectedEquipment && styles.pickerPlaceholder]}
              numberOfLines={1}
            >
              {selectedEquipment ? selectedEquipment.name : 'اختر المعدة...'}
            </Text>
            <Ionicons name="construct-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Priority */}
        <View style={styles.field}>
          <Text style={styles.label}>الأولوية</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.priorityBtn,
                  priority === p.value && {
                    backgroundColor: p.color,
                    borderColor: p.color,
                  },
                ]}
                onPress={() => setPriority(p.value)}
              >
                <Ionicons
                  name={p.icon}
                  size={18}
                  color={priority === p.value ? '#FFF' : p.color}
                />
                <Text
                  style={[
                    styles.priorityBtnText,
                    { color: priority === p.value ? '#FFF' : p.color },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Requested By */}
        <View style={styles.field}>
          <Text style={styles.label}>
            طالب الصيانة <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="اسم الشخص الطالب للصيانة"
            placeholderTextColor={COLORS.textSecondary}
            value={requestedBy}
            onChangeText={setRequestedBy}
            textAlign="right"
          />
        </View>

        {/* Technician Picker (optional) */}
        <View style={styles.field}>
          <Text style={styles.label}>الفني المُسند (اختياري)</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowTechPicker(true)}
          >
            <Ionicons name="chevron-back-outline" size={18} color={COLORS.textSecondary} />
            {selectedTechnician && (
              <TouchableOpacity
                onPress={() => setSelectedTechnician(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.danger} />
              </TouchableOpacity>
            )}
            <Text
              style={[styles.pickerText, !selectedTechnician && styles.pickerPlaceholder]}
              numberOfLines={1}
            >
              {selectedTechnician ? selectedTechnician.name : 'اختر فنياً (اختياري)...'}
            </Text>
            <Ionicons name="person-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, !isFormValid && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isFormValid}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color="#FFF" />
          <Text style={styles.submitBtnText}>إنشاء الطلب</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Equipment Modal */}
      <Modal
        visible={showEquipmentPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEquipmentPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>اختر المعدة</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {equipment.map((eq) => (
                <TouchableOpacity
                  key={eq.id}
                  style={[
                    styles.modalItem,
                    selectedEquipment?.id === eq.id && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setSelectedEquipment(eq);
                    setShowEquipmentPicker(false);
                  }}
                >
                  <View style={styles.modalItemLeft}>
                    {selectedEquipment?.id === eq.id && (
                      <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                    )}
                  </View>
                  <View style={styles.modalItemInfo}>
                    <Text style={styles.modalItemSubtitle}>{eq.location}</Text>
                    <Text style={styles.modalItemTitle}>{eq.name}</Text>
                  </View>
                  <View style={styles.modalItemIcon}>
                    <Ionicons name="construct-outline" size={20} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowEquipmentPicker(false)}
            >
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Technician Modal */}
      <Modal
        visible={showTechPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTechPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>اختر الفني</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {technicians.filter((t) => t.status !== 'offline').map((tech) => (
                <TouchableOpacity
                  key={tech.id}
                  style={[
                    styles.modalItem,
                    selectedTechnician?.id === tech.id && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setSelectedTechnician(tech);
                    setShowTechPicker(false);
                  }}
                >
                  <View style={styles.modalItemLeft}>
                    {selectedTechnician?.id === tech.id && (
                      <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                    )}
                  </View>
                  <View style={styles.modalItemInfo}>
                    <Text style={styles.modalItemSubtitle}>{tech.specialty}</Text>
                    <Text style={styles.modalItemTitle}>{tech.name}</Text>
                  </View>
                  <View style={styles.smallAvatar}>
                    <Text style={styles.smallAvatarText}>{tech.avatar}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowTechPicker(false)}
            >
              <Text style={styles.modalCancelText}>إلغاء</Text>
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
  content: { padding: 16, paddingBottom: 40 },

  field: { marginBottom: 18 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  required: { color: COLORS.danger },
  charCount: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'left', marginTop: 4 },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },

  picker: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerEmpty: { borderStyle: 'dashed' },
  pickerText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'right',
  },
  pickerPlaceholder: { color: COLORS.textSecondary },

  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  priorityBtnText: { fontSize: 13, fontWeight: '600' },

  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  submitBtnDisabled: { backgroundColor: '#B0BEC5' },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

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
    maxHeight: '75%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F5F7FA',
    gap: 10,
  },
  modalItemActive: { backgroundColor: '#E8F0FE' },
  modalItemLeft: { width: 24 },
  modalItemInfo: { flex: 1, alignItems: 'flex-end' },
  modalItemTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  modalItemSubtitle: { fontSize: 11, color: COLORS.textSecondary },
  modalItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  modalCancel: {
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600' },
});

export default NewRequestScreen;
