import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const STATUS_AR = { open: 'مفتوح', inprogress: 'جاري', done: 'منتهي', closed: 'مغلق', overdue: 'متأخر', cancelled: 'ملغي' };
const STATUS_COLOR = { open: '#FF6F00', inprogress: '#1565C0', done: '#2E7D32', closed: '#555', overdue: '#C62828', cancelled: '#999' };
const PRIORITY_COLOR = { high: '#C62828', medium: '#FF6F00', low: '#2E7D32' };
const PRIORITY_AR = { high: 'عالي', medium: 'متوسط', low: 'منخفض' };
const FILTERS = [
  { key: null, label: 'الكل' },
  { key: 'open', label: 'مفتوح' },
  { key: 'inprogress', label: 'جاري' },
  { key: 'done', label: 'منتهي' },
  { key: 'overdue', label: 'متأخر' },
];

export default function RequestsListScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const params = { limit: 100 };
      if (filter) params.status = filter;
      const res = await workordersAPI.getAll(params);
      setItems(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [filter]));

  const filtered = search
    ? items.filter(i => i.description?.includes(search) || i.id?.includes(search) || i.asset_name?.includes(search))
    : items;

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('RequestDetail', { id: item.id })}>
      <View style={styles.itemHeader}>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
          <Text style={[styles.badgeTxt, { color: STATUS_COLOR[item.status] }]}>{STATUS_AR[item.status] || item.status}</Text>
        </View>
        <Text style={styles.woId}>{item.id}</Text>
      </View>
      <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.itemFooter}>
        <View style={[styles.badge, { backgroundColor: PRIORITY_COLOR[item.priority] + '22' }]}>
          <Text style={[styles.badgeTxt, { color: PRIORITY_COLOR[item.priority] }]}>{PRIORITY_AR[item.priority] || item.priority}</Text>
        </View>
        {item.asset_name ? <Text style={styles.meta}>🔧 {item.asset_name}</Text> : null}
        {item.tech_name ? <Text style={styles.meta}>👤 {item.tech_name}</Text> : null}
      </View>
      {item.due_date ? <Text style={styles.date}>الاستحقاق: {item.due_date}</Text> : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="بحث..." value={search} onChangeText={setSearch} textAlign="right" />
      <View style={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={String(f.key)} style={[styles.filterBtn, filter === f.key && styles.filterActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterTxt, filter === f.key && styles.filterTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> :
        error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة المحاولة</Text></TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={<View style={styles.center}><Ionicons name="clipboard-outline" size={48} color="#ccc" /><Text style={styles.emptyTxt}>لا توجد طلبات</Text></View>}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )
      }
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewRequest')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  search: { margin: 10, padding: 10, backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  filters: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 6, gap: 6 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: '#ddd' },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterTxt: { fontSize: 12, color: C.sub },
  filterTxtActive: { color: '#fff', fontWeight: 'bold' },
  item: { backgroundColor: C.white, marginHorizontal: 10, marginBottom: 8, borderRadius: 12, padding: 14, elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  woId: { fontSize: 13, fontWeight: 'bold', color: C.primary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  desc: { fontSize: 14, color: C.text, textAlign: 'right', marginBottom: 8 },
  itemFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { fontSize: 12, color: C.sub },
  date: { fontSize: 11, color: C.sub, textAlign: 'right', marginTop: 6 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { color: '#C62828', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  emptyTxt: { color: '#ccc', marginTop: 10, fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, left: 24, backgroundColor: C.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});
