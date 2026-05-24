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
  warning: '#FF6F00',
};

const STATUS_OPTIONS = [
  { label: 'يعمل', value: 'working', color: COLORS.success, icon: 'checkmark-circle-outline' },
  { label: 'يحتاج صيانة', value: 'needs-maintenance', color: COLORS.warning, icon: 'warning-outline' },
  { label: 'معطل', value: 'broken', color: COLORS.danger, icon: 'close-circle-outline' },
];

const COMMON_LOCATIONS = [
  'المبنى الرئيسي - الطابق الأرضي',
  'المبنى الرئيسي - الطابق الأول',
  'المبنى الرئيسي - الطابق الثاني',
  'المستودع الرئيسي',
  'ورشة الإنتاج',
  'غرفة الكهرباء',
  'غرفة المولدات',
  'غرفة الضخ',
  'الساحة الخارجية',
];

const NewEquipmentScreen = ({ navigation }) => {
  const { actions } = useApp();

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('working');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const isFormValid = name.trim() && model.trim() && serialNumber.trim() && location.trim();

  const handleSubmit = () => {
    if (!isFormValid) {
      Alert.alert('بيانات ناقصة', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    actions.addEquipment({
      name: name.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      location: location.trim(),
      status,
      lastMaintenanceDate: null,
      purchaseDate: null,
    });

    Alert.alert('تم الحفظ', 'تم إضافة المعدة بنجاح', [
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
        {/* Status selection first */}
        <View style={styles.field}>
          <Text style={styles.label}>حالة المعدة</Text>
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
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={status === opt.value ? '#FFF' : opt.color}
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

        {/* Equipment Name */}
        <View style={styles.field}>
          <Text style={styles.label}>
            اسم المعدة <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: مكيف مركزي - المبنى الرئيسي"
            placeholderTextColor={COLORS.textSecondary}
            value={name}
            onChangeText={setName}
            textAlign="right"
            maxLength={100}
          />
        </View>

        {/* Model */}
        <View style={styles.field}>
          <Text style={styles.label}>
            الموديل / الماركة <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: Carrier 50XC"
            placeholderTextColor={COLORS.textSecondary}
            value={model}
            onChangeText={setModel}
            textAlign="right"
            maxLength={80}
          />
        </View>

        {/* Serial Number */}
        <View style={styles.field}>
          <Text style={styles.label}>
            الرقم التسلسلي <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: CAR-2021-001"
            placeholderTextColor={COLORS.textSecondary}
            value={serialNumber}
            onChangeText={setSerialNumber}
            textAlign="right"
            maxLength={50}
            autoCapitalize="characters"
          />
        </View>

        {/* Location */}
        <View style={styles.field}>
          <Text style={styles.label}>
            الموقع <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل موقع المعدة"
            placeholderTextColor={COLORS.textSecondary}
            value={location}
            onChangeText={setLocation}
            textAlign="right"
            maxLength={100}
          />
          <TouchableOpacity
            style={styles.showMore}
            onPress={() => setShowLocationSuggestions(!showLocationSuggestions)}
          >
            <Ionicons
              name={showLocationSuggestions ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.primary}
            />
            <Text style={styles.showMoreText}>اختر من المواقع الشائعة</Text>
          </TouchableOpacity>

          {showLocationSuggestions && (
            <View style={styles.suggestionsList}>
              {COMMON_LOCATIONS.map((loc) => (
                <TouchableOpacity
                  key={loc}
                  style={[
                    styles.suggestionItem,
                    location === loc && styles.suggestionItemActive,
                  ]}
                  onPress={() => {
                    setLocation(loc);
                    setShowLocationSuggestions(false);
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={location === loc ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text
                    style={[
                      styles.suggestionText,
                      location === loc && styles.suggestionTextActive,
                    ]}
                  >
                    {loc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            يمكنك تحديث تاريخ الشراء وتاريخ آخر صيانة من صفحة تفاصيل المعدة بعد الإضافة.
          </Text>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !isFormValid && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isFormValid}
        >
          <Ionicons name="add-circle-outline" size={22} color="#FFF" />
          <Text style={styles.submitBtnText}>إضافة المعدة</Text>
        </TouchableOpacity>
      </ScrollView>
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

  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  statusBtnText: { fontSize: 11, fontWeight: '600' },

  showMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  showMoreText: { fontSize: 12, color: COLORS.primary },

  suggestionsList: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionItemActive: { backgroundColor: '#E8F0FE' },
  suggestionText: { fontSize: 13, color: COLORS.text, flex: 1, textAlign: 'right' },
  suggestionTextActive: { color: COLORS.primary, fontWeight: '600' },

  infoBanner: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    textAlign: 'right',
    lineHeight: 18,
  },

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

export default NewEquipmentScreen;
