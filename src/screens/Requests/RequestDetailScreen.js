import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const STATUS_AR = { open: 'مفتوح', inprogress: 'جاري', done: 'منتهي', closed: 'مغلق', overdue: 'متأخر', cancelled: 'ملغي' };
const STATUS_COLOR = { open: '#FF6F00', inprogress: '#1565C0', done: '#2E7D32', closed: '#555', overdue: '#C62828', cancelled: '#999' };
const PRIORITY_AR = { high: 'عالي', medium: 'متوسط', low: 'منخفض' };
const PRIORITY_COLOR = { high: '#C62828', medium: '#FF6F00', low: '#2E7D32' };
const TYPE_AR = { corrective: 'تصحيحي', preventive: 'وقائي', inspection: 'فحص' };

const STATUS_OPTIONS = [
  { key: 'open', label: 'مفتوح', color: '#FF6F00' },
  { key: 'inprogress', label: 'جاري', color: '#1565C0' },
  { key: 'done', label: 'منتهي', color: '#2E7D32' },
  { key: 'closed', label: 'مغلق', color: '#555' },
  { key: 'cancelled', label: 'ملغي', color: '#999' },
];

export default function RequestDetailScreen({ route }) {
  const { id } = route.params;
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const res = await workordersAPI.getOne(id);
      setWo(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [id]));

  const updateStatus = async (status) => {
    setShowStatusModal(false);
    setUpdating(true);
    try {
      await workordersAPI.updateStatus(id, status);
      await load();
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setUpdating(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>⚠️ {error}</Text><TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة</Text></TouchableOpacity></View>;
  if (!wo) return null;

  let timeline = [];
  try { timeline = typeof wo.timeline === 'string' ? JSON.parse(wo.timeline || '[]') : (wo.timeline || []); } catch (_) {}

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {/* ID + Status */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: STATUS_COLOR[wo.status] + '22' }]}>
            <Text style={[styles.badgeTxt, { color: STATUS_COLOR[wo.status] }]}>{STATUS_AR[wo.status]}</Text>
          </View>
          <Text style={styles.woId}>{wo.id}</Text>
        </View>
        <Text style={styles.desc}>{wo.description}</Text>
        <View style={[styles.row, { marginTop: 8 }]}>
          <View style={[styles.badge, { backgroundColor: PRIORITY_COLOR[wo.priority] + '22' }]}>
            <Text style={[styles.badgeTxt, { color: PRIORITY_COLOR[wo.priority] }]}>أولوية {PRIORITY_AR[wo.priority]}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.badgeTxt, { color: C.primary }]}>{TYPE_AR[wo.type] || wo.type}</Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={styles.card}>
        {[
          { label: 'المعدة', value: wo.asset_name },
          { label: 'الفني المسؤول', value: wo.tech_name },
          { label: 'القسم', value: wo.dept },
          { label: 'تاريخ الاستحقاق', value: wo.due_date },
          { label: 'تاريخ الإغلاق', value: wo.closed_date },
          { label: 'منشئ الطلب', value: wo.created_by_name },
        ].filter(f => f.value).map(f => (
          <View key={f.label} style={styles.field}>
            <Text style={styles.fieldVal}>{f.value}</Text>
            <Text style={styles.fieldLbl}>{f.label}</Text>
          </View>
        ))}
        {wo.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.fieldLbl}>ملاحظات</Text>
            <Text style={styles.notesText}>{wo.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Timeline */}
      {timeline.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>سجل الأحداث</Text>
          {[...timeline].reverse().map((t, i) => (
            <View key={i} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineMsg}>{t.msg}</Text>
                <Text style={styles.timelineMeta}>{t.user} · {t.t}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Update status button */}
      <TouchableOpacity style={styles.statusBtn} onPress={() => setShowStatusModal(true)} disabled={updating}>
        {updating ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="swap-horizontal" size={20} color="#fff" />
            <Text style={styles.statusBtnTxt}>تحديث الحالة</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 30 }} />

      {/* Status Modal */}
      <Modal visible={showStatusModal} transparent animationType="slide" onRequestClose={() => setShowStatusModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowStatusModal(false)} />
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>اختر الحالة الجديدة</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity key={s.key} style={[styles.statusOption, wo.status === s.key && { backgroundColor: s.color + '22' }]} onPress={() => updateStatus(s.key)}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={[styles.statusOptionTxt, wo.status === s.key && { color: s.color, fontWeight: 'bold' }]}>{s.label}</Text>
              {wo.status === s.key && <Ionicons name="checkmark" size={18} color={s.color} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowStatusModal(false)}>
            <Text style={{ color: C.sub }}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { color: '#C62828', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  card: { backgroundColor: C.white, margin: 12, marginBottom: 0, borderRadius: 14, padding: 16, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  woId: { fontSize: 18, fontWeight: 'bold', color: C.primary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTxt: { fontSize: 12, fontWeight: '600' },
  desc: { fontSize: 15, color: C.text, textAlign: 'right', lineHeight: 22 },
  field: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  fieldLbl: { fontSize: 12, color: C.sub },
  fieldVal: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right', marginRight: 8 },
  notesBox: { marginTop: 10 },
  notesText: { fontSize: 13, color: C.text, textAlign: 'right', lineHeight: 20, marginTop: 4 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, marginTop: 4 },
  timelineMsg: { fontSize: 13, color: C.text, textAlign: 'right' },
  timelineMeta: { fontSize: 11, color: C.sub, textAlign: 'right', marginTop: 2 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, margin: 14, borderRadius: 12, padding: 15 },
  statusBtnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: C.text, textAlign: 'center', marginBottom: 16 },
  statusOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 6, gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  statusOptionTxt: { flex: 1, fontSize: 15, color: C.text, textAlign: 'right' },
  cancelBtn: { alignItems: 'center', padding: 14, marginTop: 4 },
});
