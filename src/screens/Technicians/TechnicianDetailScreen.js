import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const ROLE_AR = { admin: 'مدير النظام', manager: 'مشرف', technician: 'فني صيانة', viewer: 'مراقب' };
const ROLE_COLOR = { admin: '#C62828', manager: '#1565C0', technician: '#2E7D32', viewer: '#666' };

export default function TechnicianDetailScreen({ route }) {
  const staff = route.params?.staff || {};
  const role = staff.role || 'technician';

  const Row = ({ icon, label, value }) => value ? (
    <View style={styles.row}>
      <Text style={styles.val}>{value}</Text>
      <View style={styles.rowLabel}>
        <Ionicons name={icon} size={16} color={C.primary} />
        <Text style={styles.lbl}>{label}</Text>
      </View>
    </View>
  ) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{staff.name?.charAt(0) || '?'}</Text>
        </View>
        <Text style={styles.name}>{staff.name}</Text>
        <View style={[styles.badge, { backgroundColor: (ROLE_COLOR[role] || '#666') + '33' }]}>
          <Text style={[styles.badgeTxt, { color: ROLE_COLOR[role] || '#666' }]}>{ROLE_AR[role] || role}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>معلومات الاتصال</Text>
        <Row icon="mail" label="البريد الإلكتروني" value={staff.email} />
        <Row icon="call" label="الهاتف" value={staff.phone} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>بيانات الوظيفة</Text>
        <Row icon="business" label="القسم" value={staff.department} />
        <Row icon="hammer" label="التخصص" value={staff.specialization} />
        <Row icon="card" label="الرقم الوظيفي" value={staff.employee_id} />
      </View>

      {staff.notes ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ملاحظات</Text>
          <Text style={styles.notes}>{staff.notes}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, padding: 30, alignItems: 'center', paddingTop: 30 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarTxt: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  badgeTxt: { fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: C.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 16, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: C.primary, textAlign: 'right', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lbl: { fontSize: 13, color: C.sub },
  val: { fontSize: 14, color: C.text, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 8 },
  notes: { fontSize: 14, color: C.text, textAlign: 'right', lineHeight: 22 },
});
