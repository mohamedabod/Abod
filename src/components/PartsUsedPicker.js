import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryAPI } from '../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function PartsUsedPicker({ visible, onClose, onConfirm }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) inventoryAPI.getAll().then(r => setItems(r.data)).catch(() => {});
  }, [visible]);

  const setQty = (id, qty) => {
    const n = parseInt(qty) || 0;
    if (n <= 0) { const s = { ...selected }; delete s[id]; setSelected(s); }
    else setSelected(s => ({ ...s, [id]: n }));
  };

  const confirm = () => {
    const parts = Object.entries(selected).map(([id, qty]) => {
      const item = items.find(i => String(i.id) === id);
      if (item && qty > item.qty) {
        Alert.alert('تحذير', `الكمية المطلوبة (${qty}) أكبر من المخزون (${item.qty}) لـ "${item.name}"`);
        return null;
      }
      return { inventory_id: id, qty_used: qty, name: item?.name };
    }).filter(Boolean);
    onConfirm?.(parts);
    setSelected({});
    onClose?.();
  };

  const filtered = search ? items.filter(i => i.name?.includes(search)) : items;
  const selectedCount = Object.keys(selected).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
          <Text style={styles.title}>قطع الغيار المستخدمة</Text>
          <TouchableOpacity onPress={confirm} disabled={selectedCount === 0}>
            <Text style={[styles.confirmTxt, selectedCount === 0 && { opacity: 0.4 }]}>تأكيد ({selectedCount})</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={styles.search} placeholder="بحث..." value={search} onChangeText={setSearch} textAlign="right" />
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(String(item.id), (selected[String(item.id)] || 0) + 1)}>
                  <Ionicons name="add" size={18} color={C.primary} />
                </TouchableOpacity>
                <Text style={styles.qtyTxt}>{selected[String(item.id)] || 0}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(String(item.id), (selected[String(item.id)] || 0) - 1)}>
                  <Ionicons name="remove" size={18} color="#C62828" />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.stock}>مخزون: {item.qty} {item.unit || ''}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50 },
  title: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  confirmTxt: { color: '#FFD54F', fontWeight: 'bold' },
  search: { margin: 10, padding: 10, backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, marginHorizontal: 10, marginBottom: 6, borderRadius: 10, padding: 12, gap: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center' },
  qtyTxt: { fontSize: 16, fontWeight: 'bold', color: C.text, minWidth: 24, textAlign: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'right' },
  stock: { fontSize: 12, color: C.sub, textAlign: 'right' },
});
