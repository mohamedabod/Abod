import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assetsAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const healthColor = (h) => h >= 80 ? '#2E7D32' : h >= 60 ? '#FF6F00' : '#C62828';
const CAT_AR = { electrical: 'كهربي', mechanical: 'ميكانيكي', hvac: 'تكييف', civil: 'مدني', other: 'أخرى' };
const FILTERS = [null, 'electrical', 'mechanical', 'hvac', 'civil'];
const FILTER_AR = { null: 'الكل', electrical: 'كهربي', mechanical: 'ميكانيكي', hvac: 'تكييف', civil: 'مدني' };

export default function EquipmentListScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const params = filter ? { category: filter } : {};
      const res = await assetsAPI.getAll(params);
      setItems(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [filter]));

  const filtered = search ? items.filter(i => i.name?.includes(search) || i.serial?.includes(search) || i.location?.includes(search)) : items;

  const renderItem = ({ item }) => {
    const h = item.health ?? 100;
    const hc = healthColor(h);
    return (
      <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('EquipmentDetail', { id: item.id })}>
        <View style={styles.itemHeader}>
          <View style={[styles.badge, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.badgeTxt, { color: C.primary }]}>{CAT_AR[item.category] || item.category || '—'}</Text>
          </View>
          <Text style={styles.itemName}>{item.name}</Text>
        </View>
        {item.serial ? <Text style={styles.meta}>S/N: {item.serial}</Text> : null}
        {item.location ? <Text style={styles.meta}>📍 {item.location}</Text> : null}
        {item.dept ? <Text style={styles.meta}>🏭 {item.dept}</Text> : null}
        <View style={styles.healthRow}>
          <Text style={[styles.healthPct, { color: hc }]}>{h}%</Text>
          <View style={styles.healthBar}>
            <View style={[styles.healthFill, { width: `${h}%`, backgroundColor: hc }]} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="بحث..." value={search} onChangeText={setSearch} textAlign="right" />
      <View style={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={String(f)} style={[styles.filterBtn, filter === f && styles.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterTxt, filter === f && styles.filterTxtActive]}>{FILTER_AR[f] || 'الكل'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> :
        error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة</Text></TouchableOpacity>
          </View>
        ) : (
          <FlatList data={filtered} keyExtractor={i => String(i.id)} renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={<View style={styles.center}><Ionicons name="construct-outline" size={48} color="#ccc" /><Text style={styles.emptyTxt}>لا توجد معدات</Text></View>}
            contentContainerStyle={{ paddingBottom: 100 }} />
        )
      }
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewEquipment')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  search: { margin: 10, padding: 10, backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  filters: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 6, gap: 6, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: '#ddd' },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterTxt: { fontSize: 12, color: C.sub },
  filterTxtActive: { color: '#fff', fontWeight: 'bold' },
  item: { backgroundColor: C.white, marginHorizontal: 10, marginBottom: 8, borderRadius: 12, padding: 14, elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: C.text, flex: 1, textAlign: 'right', marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  meta: { fontSize: 12, color: C.sub, textAlign: 'right', marginBottom: 2 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  healthPct: { fontSize: 13, fontWeight: 'bold', width: 38, textAlign: 'right' },
  healthBar: { flex: 1, height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
  healthFill: { height: '100%', borderRadius: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { color: '#C62828', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  emptyTxt: { color: '#ccc', marginTop: 10 },
  fab: { position: 'absolute', bottom: 24, left: 24, backgroundColor: C.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});
