import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { workordersAPI } from '../../services/api';

const C = {
  primary: '#1565C0',
  accent: '#FF6F00',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  sub: '#616161',
  border: '#E0E0E0',
  danger: '#D32F2F',
  success: '#2E7D32',
  warning: '#FF6F00',
};

const FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'مفتوح', value: 'open' },
  { label: 'جاري', value: 'inprogress' },
  { label: 'منتهي', value: 'done' },
  { label: 'متأخر', value: 'overdue' },
];

const STATUS_AR = {
  open: 'مفتوح',
  inprogress: 'جاري',
  done: 'منتهي',
  closed: 'مغلق',
  overdue: 'متأخر',
  cancelled: 'ملغي',
};

const STATUS_COLOR = {
  open: C.primary,
  inprogress: C.accent,
  done: C.success,
  closed: '#757575',
  overdue: C.danger,
  cancelled: '#9E9E9E',
};

const PRIORITY_COLOR = { high: C.danger, medium: C.warning, low: C.success };
const PRIORITY_AR = { high: 'عالي', medium: 'متوسط', low: 'منخفض' };

const RequestsListScreen = ({ navigation }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchData = useCallback(async (filter) => {
    try {
      setError(null);
      const params = { limit: 50 };
      if (filter && filter !== 'all') params.status = filter;
      const res = await workordersAPI.getAll(params);
      setItems(res.data || []);
    } catch (e) {
      setError('فشل تحميل أوامر العمل.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData(activeFilter);
    }, [fetchData, activeFilter])
  );

  const handleFilterChange = (val) => {
    setActiveFilter(val);
    setLoading(true);
    fetchData(val);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData(activeFilter);
  };

  const renderItem = ({ item }) => {
    const pColor = PRIORITY_COLOR[item.priority] || C.sub;
    const sColor = STATUS_COLOR[item.status] || C.sub;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('RequestDetail', { id: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: sColor + '20', borderColor: sColor }]}>
            <Text style={[styles.badgeText, { color: sColor }]}>{STATUS_AR[item.status] || item.status}</Text>
          </View>
          <Text style={styles.woId}>WO-{String(item.id).padStart(4, '0')}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.description}</Text>
        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Text style={styles.metaVal} numberOfLines={1}>{item.asset_name || 'غير محدد'}</Text>
            <Text style={styles.metaLbl}>الأصل:</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaVal} numberOfLines={1}>{item.tech_name || 'غير مُسند'}</Text>
            <Text style={styles.metaLbl}>الفني:</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.footerDate}>{item.date_created ? item.date_created.slice(0, 10) : ''}</Text>
          <View style={[styles.priorityBadge, { backgroundColor: pColor + '20' }]}>
            <View style={[styles.priorityDot, { backgroundColor: pColor }]} />
            <Text style={[styles.priorityText, { color: pColor }]}>{PRIORITY_AR[item.priority] || item.priority}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>أوامر العمل</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrap}>
        <FlatList
          data={FILTERS}
          keyExtractor={(f) => f.value}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: f }) => (
            <TouchableOpacity
              style={[styles.filterTab, activeFilter === f.value && styles.filterTabActive]}
              onPress={() => handleFilterChange(f.value)}
            >
              <Text style={[styles.filterText, activeFilter === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={C.sub} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchData(activeFilter); }}>
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="clipboard-outline" size={48} color={C.sub} />
              <Text style={styles.emptyText}>لا توجد أوامر عمل</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewRequest')}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    elevation: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: C.text, textAlign: 'right' },
  filterWrap: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  filterList: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontSize: 13, color: C.sub, fontWeight: '500' },
  filterTextActive: { color: '#FFF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  errorText: { fontSize: 14, color: C.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8 },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
  emptyText: { fontSize: 15, color: C.sub },
  listContent: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  woId: { fontSize: 12, color: C.sub, fontWeight: '600' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'right', marginBottom: 10, lineHeight: 22 },
  metaBox: { backgroundColor: C.bg, borderRadius: 8, padding: 10, gap: 6, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLbl: { fontSize: 12, color: C.sub },
  metaVal: { fontSize: 12, color: C.text, fontWeight: '500', flex: 1, textAlign: 'left' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8 },
  footerDate: { fontSize: 11, color: C.sub },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
});

export default RequestsListScreen;
