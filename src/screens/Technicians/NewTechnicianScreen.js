import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { hrAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const ROLES = ['technician', 'manager', 'viewer', 'admin'];
const ROLE_AR = { technician: 'فني صيانة', manager: 'مشرف', viewer: 'مراقب', admin: 'مدير' };

export default function NewTechnicianScreen({ navigation }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'technician', phone: '', department: '', specialization: '', employee_id: '' });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return Alert.alert('تنبيه', 'الاسم مطلوب');
    if (!form.email.trim()) return Alert.alert('تنبيه', 'البريد الإلكتروني مطلوب');
    if (!form.password.trim() || form.password.length < 6) return Alert.alert('تنبيه', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    setLoading(true);
    try {
      await hrAPI.createStaff(form);
      Alert.alert('تم', 'تمت إضافة الموظف بنجاح', [{ text: 'حسناً', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>الاسم الكامل *</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={v => set('name', v)} placeholder="اسم الموظف" textAlign="right" />

      <Text style={styles.label}>البريد الإلكتروني *</Text>
      <TextInput style={styles.input} value={form.email} onChangeText={v => set('email', v)} placeholder="example@company.com" keyboardType="email-address" autoCapitalize="none" textAlign="right" />

      <Text style={styles.label}>كلمة المرور *</Text>
      <TextInput style={styles.input} value={form.password} onChangeText={v => set('password', v)} placeholder="6 أحرف على الأقل" secureTextEntry textAlign="right" />

      <Text style={styles.label}>الصلاحية</Text>
      <View style={styles.chips}>
        {ROLES.map(r => (
          <TouchableOpacity key={r} style={[styles.chip, form.role === r && styles.chipActive]} onPress={() => set('role', r)}>
            <Text style={[styles.chipTxt, form.role === r && styles.chipTxtActive]}>{ROLE_AR[r]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>الهاتف</Text>
      <TextInput style={styles.input} value={form.phone} onChangeText={v => set('phone', v)} placeholder="رقم الهاتف" keyboardType="phone-pad" textAlign="right" />

      <Text style={styles.label}>القسم</Text>
      <TextInput style={styles.input} value={form.department} onChangeText={v => set('department', v)} placeholder="قسم الصيانة" textAlign="right" />

      <Text style={styles.label}>التخصص</Text>
      <TextInput style={styles.input} value={form.specialization} onChangeText={v => set('specialization', v)} placeholder="كهرباء / ميكانيكا / ..." textAlign="right" />

      <Text style={styles.label}>الرقم الوظيفي</Text>
      <TextInput style={styles.input} value={form.employee_id} onChangeText={v => set('employee_id', v)} placeholder="EMP-001" textAlign="right" />

      <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>إضافة الموظف</Text>}
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
