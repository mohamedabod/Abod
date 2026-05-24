import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { pmAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const FREQ_AR = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
const TABS = [{ key: 'upcoming', label: 'القادمة' }, { key: 'overdue', label: 'المتأخرة' }, { key: 'all', label: 'الكل' }];

export default function PMScreen() {
  const [tab, setTab] = useState('upcoming');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedPM, setSelectedPM] = useState(null);
  const [notes, setNotes] = useState('');

  const load = async () => {
    try {
      setError(null);
      let res;
      if (tab === 'upcoming') res = await pmAPI.getUpcoming(30);
      else if (tab === 'overdue') res = await pmAPI.getOverdue();
      else res = await pmAPI.getAll();
      setItems(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [tab]));

  const openComplete = (pm) => { setSelectedPM(pm); setNotes(''); setShowModal(true); };

  const confirmComplete = async () => {
    if (!selectedPM) return;
    setShowModal(false);
    setCompleting(selectedPM.id);
    try {
      await pmAPI.complete(selectedPM.id, { notes: notes || null });
      await load();
      Alert.alert('تم', 'تم تسجيل إتمام الصيانة الوقائية');
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setCompleting(null); }
  };

  const renderItem = ({ item }) => {
    const overdue = item.next_due && new Date(item.next_due) < new Date();
    return (
      <View style={[styles.item, overdue && styles.itemOverdue]}>
        <View style={styles.itemHeader}>
          <TouchableOpacity style={[styles.completeBtn, completing === item.id && { opacity: 0.5 }]}
            onPress={() => openComplete(item)} disabled={completing === item.id}>
            {completing === item.id
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Ionicons name="checkmark" size={14} color="#fff" /><Text style={styles.completeBtnTxt}>إتمام</Text></>
            }
          </TouchableOpacity>
          <Text style={[styles.pmTitle, overdue && { color: '#C62828' }]}>{item.title}</Text>
        </View>
        <View style={styles.metaRow}>
          {item.asset_name ? <Text style={styles.meta}>🔧 {item.asset_name}</Text> : null}
          {item.frequency ? <Text style={styles.meta}>🔁 {FREQ_AR[item.frequency] || item.frequency}</Text> : null}
          <Text style={[styles.meta, overdue && { color: '#C62828', fontWeight: '600' }]}>
            {overdue ? '⚠️ متأخر: ' : '📅 '}{item.next_due || '—'}
          </Text>
        </View>
        {item.description ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> :
        error ? (
          <View style={styles.center}><Text style={{ color: '#C62828', marginBottom: 12 }}>⚠️ {error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة</Text></TouchableOpacity></View>
        ) : (
          <FlatList data={items} keyExtractor={i => String(i.id)} renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={<View style={styles.center}><Ionicons name="calendar-outline" size={48} color="#ccc" /><Text style={{ color: '#ccc', marginTop: 10 }}>لا توجد خطط</Text></View>}
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 6 }} />
        )
      }
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>تسجيل إتمام الصيانة</Text>
            <Text style={styles.modalSub}>{selectedPM?.title}</Text>
            <Text style={styles.modalLabel}>ملاحظات (اختياري)</Text>
            <TextInput style={styles.modalInput} value={notes} onChangeText={setNotes}
              placeholder="ما الذي تم عمله..." multiline numberOfLines={3} textAlign="right" textAlignVertical="top" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowModal(false)}>
                <Text style={{ color: C.sub }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmComplete}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  tabs: { flexDirection: 'row', backgroundColor: C.white, padding: 10, gap: 8, elevation: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  tabActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabTxt: { fontSize: 13, color: C.sub },
  tabTxtActive: { color: '#fff', fontWeight: 'bold' },
  item: { backgroundColor: C.white, marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, elevation: 2 },
  itemOverdue: { borderLeftWidth: 4, borderLeftColor: '#C62828' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pmTitle: { fontSize: 14, fontWeight: '600', color: C.text, flex: 1, textAlign: 'right', marginLeft: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  meta: { fontSize: 12, color: C.sub },
  desc: { fontSize: 12, color: C.sub, textAlign: 'right', marginTop: 4 },
  completeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2E7D32', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  completeBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: C.text, textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 13, color: C.sub, textAlign: 'center', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: C.sub, textAlign: 'right', marginBottom: 6 },
  modalInput: { backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, height: 80, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  modalConfirm: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#2E7D32' },
});
