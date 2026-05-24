import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function InventoryScreen() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const [all, low] = await Promise.all([inventoryAPI.getAll(), inventoryAPI.getLowStock()]);
      const lowIds = new Set(low.data.map(i => i.id));
      const enriched = all.data.map(i => ({ ...i, isLow: lowIds.has(i.id) }));
      setItems(enriched);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = filter === 'low' ? items.filter(i => i.isLow) : items;

  const openAdjust = (item) => { setSelected(item); setDelta(''); setReason(''); setShowModal(true); };

  const confirmAdjust = async () => {
    const d = parseInt(delta);
    if (isNaN(d) || d === 0) return Alert.alert('تنبيه', 'أدخل كمية صحيحة (موجبة للإضافة، سالبة للسحب)');
    setAdjusting(true);
    try {
      await inventoryAPI.adjustQty(selected.id, d, reason || null);
      setShowModal(false);
      await load();
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setAdjusting(false); }
  };

  const renderItem = ({ item }) => {
    const stockPct = item.min_qty > 0 ? Math.min(100, Math.round((item.qty / (item.min_qty * 3)) * 100)) : null;
    return (
      <View style={[styles.item, item.isLow && styles.itemLow]}>
        <View style={styles.itemHeader}>
          <TouchableOpacity style={styles.adjustBtn} onPress={() => openAdjust(item)}>
            <Ionicons name="swap-vertical" size={14} color="#fff" />
            <Text style={styles.adjustBtnTxt}>تعديل</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.part_number ? <Text style={styles.partNo}>{item.part_number}</Text> : null}
          </View>
        </View>
        <View style={styles.qtyRow}>
          <View style={styles.qtyBox}>
            <Text style={[styles.qty, item.isLow && { color: '#C62828' }]}>{item.qty ?? 0}</Text>
            <Text style={styles.unit}>{item.unit || 'قطعة'}</Text>
          </View>
          {item.min_qty != null && (
            <View style={styles.minBox}>
              <Text style={styles.minLabel}>الحد الأدنى: {item.min_qty}</Text>
              {item.isLow && <Text style={styles.lowBadge}>مخزون منخفض ⚠️</Text>}
            </View>
          )}
        </View>
        {stockPct !== null && (
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${stockPct}%`, backgroundColor: item.isLow ? '#C62828' : '#2E7D32' }]} />
          </View>
        )}
        {item.location ? <Text style={styles.location}>📍 {item.location}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {[{ key: 'all', label: 'الكل' }, { key: 'low', label: 'منخفض ⚠️' }].map(f => (
          <TouchableOpacity key={f.key} style={[styles.filterBtn, filter === f.key && styles.filterActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterTxt, filter === f.key && styles.filterTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.countTxt}>{filtered.length} صنف</Text>
      </View>

      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> :
        error ? (
          <View style={styles.center}><Text style={{ color: '#C62828', marginBottom: 12 }}>⚠️ {error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة</Text></TouchableOpacity></View>
        ) : (
          <FlatList data={filtered} keyExtractor={i => String(i.id)} renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={<View style={styles.center}><Ionicons name="cube-outline" size={48} color="#ccc" /><Text style={{ color: '#ccc', marginTop: 10 }}>لا توجد أصناف</Text></View>}
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 6 }} />
        )
      }

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>تعديل الكمية</Text>
            <Text style={styles.modalSub}>{selected?.name} · الحالي: {selected?.qty} {selected?.unit || ''}</Text>
            <Text style={styles.modalLabel}>الكمية (+ إضافة / - سحب)</Text>
            <TextInput style={styles.modalInput} value={delta} onChangeText={setDelta}
              placeholder="مثال: 10 أو -5" keyboardType="numeric" textAlign="center" />
            <Text style={styles.modalLabel}>السبب (اختياري)</Text>
            <TextInput style={styles.modalInput} value={reason} onChangeText={setReason}
              placeholder="توريد / صرف للإنتاج..." textAlign="right" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowModal(false)}>
                <Text style={{ color: C.sub }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmAdjust} disabled={adjusting}>
                {adjusting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>تأكيد</Text>}
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
  filterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, padding: 10, gap: 8, elevation: 2 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterTxt: { fontSize: 13, color: C.sub },
  filterTxtActive: { color: '#fff', fontWeight: 'bold' },
  countTxt: { marginLeft: 'auto', fontSize: 12, color: C.sub },
  item: { backgroundColor: C.white, marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 14, elevation: 2 },
  itemLow: { borderLeftWidth: 4, borderLeftColor: '#C62828' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  itemName: { fontSize: 14, fontWeight: '600', color: C.text },
  partNo: { fontSize: 11, color: C.sub, marginTop: 2 },
  adjustBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  adjustBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  qtyBox: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  qty: { fontSize: 28, fontWeight: 'bold', color: C.primary },
  unit: { fontSize: 13, color: C.sub },
  minBox: { alignItems: 'flex-end' },
  minLabel: { fontSize: 12, color: C.sub },
  lowBadge: { fontSize: 11, color: '#C62828', fontWeight: '600', marginTop: 2 },
  barBg: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: '100%', borderRadius: 3 },
  location: { fontSize: 12, color: C.sub, textAlign: 'right' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.white, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: C.text, textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 13, color: C.sub, textAlign: 'center', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: C.sub, textAlign: 'right', marginBottom: 6 },
  modalInput: { backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  modalConfirm: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: C.primary },
});
