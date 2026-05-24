import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const ROLE_AR = { admin: 'مدير النظام', manager: 'مشرف', technician: 'فني صيانة', viewer: 'مراقب' };

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changing, setChanging] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const changePassword = async () => {
    if (!current.trim() || !next.trim()) return Alert.alert('تنبيه', 'أدخل كلمة المرور الحالية والجديدة');
    if (next.length < 6) return Alert.alert('تنبيه', 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    if (next !== confirm) return Alert.alert('تنبيه', 'كلمة المرور الجديدة غير متطابقة');
    setChanging(true);
    try {
      await authAPI.changePassword(current, next);
      Alert.alert('تم', 'تم تغيير كلمة المرور بنجاح');
      setCurrent(''); setNext(''); setConfirm('');
      setShowForm(false);
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setChanging(false); }
  };

  const confirmLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{user?.name?.charAt(0) || '?'}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>{ROLE_AR[user?.role] || user?.role}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>بيانات الحساب</Text>
        {[
          { icon: 'mail', label: 'البريد الإلكتروني', value: user?.email },
          { icon: 'person', label: 'الاسم', value: user?.name },
          { icon: 'shield', label: 'الصلاحية', value: ROLE_AR[user?.role] || user?.role },
        ].map(f => f.value ? (
          <View key={f.label} style={styles.field}>
            <Text style={styles.fieldVal}>{f.value}</Text>
            <View style={styles.fieldLabel}>
              <Ionicons name={f.icon} size={15} color={C.primary} />
              <Text style={styles.fieldLbl}>{f.label}</Text>
            </View>
          </View>
        ) : null)}
      </View>

      <View style={styles.card}>
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowForm(!showForm)}>
          <Ionicons name={showForm ? 'chevron-up' : 'chevron-down'} size={20} color={C.primary} />
          <Text style={styles.cardTitle}>تغيير كلمة المرور</Text>
        </TouchableOpacity>

        {showForm && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>كلمة المرور الحالية</Text>
            <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry placeholder="••••••••" textAlign="right" />
            <Text style={styles.label}>كلمة المرور الجديدة</Text>
            <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry placeholder="6 أحرف على الأقل" textAlign="right" />
            <Text style={styles.label}>تأكيد كلمة المرور</Text>
            <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="أعد كتابة كلمة المرور" textAlign="right" />
            <TouchableOpacity style={styles.changeBtn} onPress={changePassword} disabled={changing}>
              {changing ? <ActivityIndicator color="#fff" /> : <Text style={styles.changeBtnTxt}>تغيير كلمة المرور</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={20} color="#C62828" />
        <Text style={styles.logoutTxt}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, padding: 30, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarTxt: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  role: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  card: { backgroundColor: C.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 16, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: C.text, textAlign: 'right' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLbl: { fontSize: 13, color: C.sub },
  fieldVal: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 8 },
  label: { fontSize: 13, fontWeight: '600', color: C.sub, textAlign: 'right', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14 },
  changeBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  changeBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, margin: 14, padding: 16, backgroundColor: '#FFEBEE', borderRadius: 14, borderWidth: 1, borderColor: '#EF9A9A' },
  logoutTxt: { color: '#C62828', fontWeight: 'bold', fontSize: 16 },
});
