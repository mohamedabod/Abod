import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
  danger: '#D32F2F',
  success: '#2E7D32',
};

const STATUS_OPTIONS = [
  { label: 'متاح', value: 'available', color: COLORS.success },
  { label: 'مشغول', value: 'busy', color: COLORS.primary },
  { label: 'غير متصل', value: 'offline', color: '#757575' },
];

const SPECIALTIES = [
  'كهرباء وأنظمة التبريد',
  'ميكانيكا وصيانة المحركات',
  'سباكة وأنظمة المياه',
  'أجهزة إلكترونية وحاسوب',
  'تكييف وتهوية',
  'نجارة وأعمال مدنية',
  'صيانة عامة',
  'أتمتة وتحكم صناعي',
];

const NewTechnicianScreen = ({ navigation }) => {
  const { actions } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [status, setStatus] = useState('available');
  const [showSpecialties, setShowSpecialties] = useState(false);

  const isFormValid = name.trim() && phone.trim() && specialty.trim();

  const handleSubmit = () => {
    if (!isFormValid) {
      Alert.alert('بيانات ناقصة', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (phone.trim().length < 9) {
      Alert.alert('رقم هاتف غير صحيح', 'يرجى إدخال رقم هاتف صحيح');
      return;
    }

    actions.addTechnician({
      name: name.trim(),
      phone: phone.trim(),
      specialty: specialty.trim(),
      status,
    });

    Alert.alert('تم الحفظ', 'تم إضافة الفني بنجاح', [
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
        {/* Avatar Preview */}
        <View style={styles.avatarPreview}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {name.trim()
                ? name.trim().split(' ').slice(0, 2).map((w) => w[0]).join('')
                : '؟'}
            </Text>
          </View>
          <Text style={styles.avatarHint}>صورة الفني (أحرف الاسم)</Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>
            اسم الفني <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل الاسم الكامل"
            placeholderTextColor={COLORS.textSecondary}
            value={name}
            onChangeText={setName}
            textAlign="right"
            maxLength={60}
          />
        </View>

        {/* Phone */}
        <View style={styles.field}>
          <Text style={styles.label}>
            رقم الهاتف <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="05XXXXXXXX"
            placeholderTextColor={COLORS.textSecondary}
            value={phone}
            onChangeText={setPhone}
            textAlign="right"
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>

        {/* Specialty */}
        <View style={styles.field}>
          <Text style={styles.label}>
            التخصص <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل تخصص الفني"
            placeholderTextColor={COLORS.textSecondary}
            value={specialty}
            onChangeText={setSpecialty}
            textAlign="right"
          />
          {/* Quick Specialty Select */}
          <TouchableOpacity
            style={styles.showMore}
            onPress={() => setShowSpecialties(!showSpecialties)}
          >
            <Ionicons
              name={showSpecialties ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.primary}
            />
            <Text style={styles.showMoreText}>اختر من القائمة</Text>
          </TouchableOpacity>

          {showSpecialties && (
            <View style={styles.specialtiesList}>
              {SPECIALTIES.map((sp) => (
                <TouchableOpacity
                  key={sp}
                  style={[
                    styles.specialtyItem,
                    specialty === sp && styles.specialtyItemActive,
                  ]}
                  onPress={() => {
                    setSpecialty(sp);
                    setShowSpecialties(false);
                  }}
                >
                  <Text
                    style={[
                      styles.specialtyItemText,
                      specialty === sp && styles.specialtyItemTextActive,
                    ]}
                  >
                    {sp}
                  </Text>
                  {specialty === sp && (
                    <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Status */}
        <View style={styles.field}>
          <Text style={styles.label}>الحالة الابتدائية</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusBtn,
                  status === opt.value && {
                    backgroundColor: opt.color,
                    borderColor: opt.color,
                  },
                ]}
                onPress={() => setStatus(opt.value)}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: status === opt.value ? '#FFF' : opt.color },
                  ]}
                />
                <Text
                  style={[
                    styles.statusBtnText,
                    { color: status === opt.value ? '#FFF' : opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !isFormValid && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isFormValid}
        >
          <Ionicons name="person-add-outline" size={22} color="#FFF" />
          <Text style={styles.submitBtnText}>إضافة الفني</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  avatarPreview: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  avatarText: { color: '#FFF', fontSize: 26, fontWeight: 'bold' },
  avatarHint: { fontSize: 12, color: COLORS.textSecondary },

  field: { marginBottom: 18 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  required: { color: COLORS.danger },

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

  showMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  showMoreText: { fontSize: 12, color: COLORS.primary },

  specialtiesList: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  specialtyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  specialtyItemActive: { backgroundColor: '#E8F0FE' },
  specialtyItemText: { fontSize: 13, color: COLORS.text, textAlign: 'right', flex: 1 },
  specialtyItemTextActive: { color: COLORS.primary, fontWeight: '600' },

  statusRow: { flexDirection: 'row', gap: 10 },
  statusBtn: {
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
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBtnText: { fontSize: 12, fontWeight: '600' },

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
  },
  submitBtnDisabled: { backgroundColor: '#B0BEC5' },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

export default NewTechnicianScreen;
