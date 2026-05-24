import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { assetsAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const CATEGORIES = ['mechanical', 'electrical', 'hvac', 'plumbing', 'it', 'vehicle', 'other'];
const CAT_AR = { mechanical: 'ميكانيكي', electrical: 'كهربائي', hvac: 'تكييف', plumbing: 'سباكة', it: 'تقنية معلومات', vehicle: 'مركبة', other: 'أخرى' };

export default function NewEquipmentScreen({ navigation }) {
  const [form, setForm] = useState({ name: '', category: 'mechanical', location: '', model: '', serial_number: '', manufacturer: '', notes: '' });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return Alert.alert('تنبيه', 'اسم المعدة مطلوب');
    setLoading(true);
    try {
      await assetsAPI.create(form);
      Alert.alert('تم', 'تمت إضافة المعدة بنجاح', [{ text: 'حسناً', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>اسم المعدة *</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={v => set('name', v)} placeholder="مثال: مضخة الحريق" textAlign="right" />

      <Text style={styles.label}>الفئة</Text>
      <View style={styles.chips}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c} style={[styles.chip, form.category === c && styles.chipActive]} onPress={() => set('category', c)}>
            <Text style={[styles.chipTxt, form.category === c && styles.chipTxtActive]}>{CAT_AR[c]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>الموقع</Text>
      <TextInput style={styles.input} value={form.location} onChangeText={v => set('location', v)} placeholder="القسم / المبنى" textAlign="right" />

      <Text style={styles.label}>الموديل</Text>
      <TextInput style={styles.input} value={form.model} onChangeText={v => set('model', v)} placeholder="Model number" textAlign="right" />

      <Text style={styles.label}>الرقم التسلسلي</Text>
      <TextInput style={styles.input} value={form.serial_number} onChangeText={v => set('serial_number', v)} placeholder="Serial number" textAlign="right" />

      <Text style={styles.label}>الشركة المصنعة</Text>
      <TextInput style={styles.input} value={form.manufacturer} onChangeText={v => set('manufacturer', v)} placeholder="Manufacturer" textAlign="right" />

      <Text style={styles.label}>ملاحظات</Text>
      <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={form.notes} onChangeText={v => set('notes', v)} multiline placeholder="ملاحظات إضافية..." textAlign="right" />

      <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>إضافة المعدة</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  label: { fontSize: 13, fontWeight: '600', color: C.sub, textAlign: 'right', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt: { fontSize: 12, color: C.sub },
  chipTxtActive: { color: '#fff', fontWeight: 'bold' },
  btn: { backgroundColor: C.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
