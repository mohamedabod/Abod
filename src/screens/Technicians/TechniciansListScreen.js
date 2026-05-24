import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { hrAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const ROLE_AR = { admin: 'مدير', manager: 'مشرف', technician: 'فني', viewer: 'مراقب' };
const ROLE_COLOR = { admin: '#C62828', manager: '#1565C0', technician: '#2E7D32', viewer: '#666' };

export default function TechniciansListScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const [s, sum] = await Promise.all([hrAPI.getStaff(), hrAPI.getSummary()]);
      setItems(s.data);
      setSummary(sum.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = search
    ? items.filter(i => i.name?.includes(search) || i.email?.includes(search) || i.department?.includes(search))
    : items;

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('TechnicianDetail', { staff: item })}>
      <View style={styles.avatar}>
        <Text style={styles.avatarTxt}>{item.name?.charAt(0) || '?'}</Text>
      </View>
      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: (ROLE_COLOR[item.role] || '#666') + '22' }]}>
            <Text style={[styles.badgeTxt, { color: ROLE_COLOR[item.role] || '#666' }]}>{ROLE_AR[item.role] || item.role}</Text>
          </View>
          <Text style={styles.name}>{item.name}</Text>
        </View>
        {item.department ? <Text style={styles.dept}>📍 {item.department}</Text> : null}
        {item.phone ? <Text style={styles.dept}>📞 {item.phone}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {summary && (
        <View style={styles.summaryRow}>
          {[
            { label: 'إجمالي', value: summary.total },
            { label: 'نشط', value: summary.active },
            { label: 'فنيون', value: summary.technicians },
          ].map((s, i) => (
            <View key={i} style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{s.value ?? '—'}</Text>
              <Text style={styles.summaryLbl}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      <TextInput style={styles.search} placeholder="بحث..." value={search} onChangeText={setSearch} textAlign="right" />
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> :
        error ? (
          <View style={styles.center}>
            <Text style={{ color: '#C62828', marginBottom: 12 }}>⚠️ {error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة المحاولة</Text></TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={<View style={styles.center}><Ionicons name="people-outline" size={48} color="#ccc" /><Text style={{ color: '#ccc', marginTop: 10 }}>لا يوجد موظفون</Text></View>}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )
      }
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewTechnician')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  summaryRow: { flexDirection: 'row', backgroundColor: C.primary, padding: 14 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  summaryLbl: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  search: { margin: 10, padding: 10, backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  item: { backgroundColor: C.white, marginHorizontal: 10, marginBottom: 8, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.primary + '22', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: 'bold', color: C.primary },
  row: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  dept: { fontSize: 12, color: C.sub, textAlign: 'right', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  fab: { position: 'absolute', bottom: 24, left: 24, backgroundColor: C.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});
