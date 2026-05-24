import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { getTechnicianStatusColor, getRequestsForTechnician } from '../../utils/helpers';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
};

const STATUS_FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'متاح', value: 'available' },
  { label: 'مشغول', value: 'busy' },
  { label: 'غير متصل', value: 'offline' },
];

const TechniciansListScreen = ({ navigation }) => {
  const { state } = useApp();
  const { technicians, requests } = state;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredTechnicians = useMemo(() => {
    let result = [...technicians];

    if (activeFilter !== 'all') {
      result = result.filter((t) => t.status === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.specialty.toLowerCase().includes(q) ||
          t.phone.includes(q)
      );
    }

    return result;
  }, [technicians, activeFilter, searchQuery]);

  const getActiveTasks = (techId) => {
    return getRequestsForTechnician(requests, techId).filter(
      (r) => r.status === 'in-progress' || r.status === 'pending'
    ).length;
  };

  const getTotalTasks = (techId) => {
    return getRequestsForTechnician(requests, techId).length;
  };

  const renderItem = ({ item }) => {
    const activeTasks = getActiveTasks(item.id);
    const totalTasks = getTotalTasks(item.id);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('TechnicianDetail', { technicianId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <StatusBadge status={item.status} type="technician" size="small" />
              <Text style={styles.name}>{item.name}</Text>
            </View>
            <Text style={styles.specialty}>{item.specialty}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaValue}>{activeTasks}</Text>
                <Text style={styles.metaLabel}>مهمة نشطة</Text>
              </View>
              <View style={styles.metaSeparator} />
              <View style={styles.metaItem}>
                <Text style={styles.metaValue}>{totalTasks}</Text>
                <Text style={styles.metaLabel}>إجمالي</Text>
              </View>
              <View style={styles.metaSeparator} />
              <View style={styles.metaItem}>
                <Ionicons name="call-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaLabel}>{item.phone}</Text>
              </View>
            </View>
          </View>
          <View
            style={[
              styles.avatar,
              { backgroundColor: getTechnicianStatusColor(item.status) },
            ]}
          >
            <Text style={styles.avatarText}>{item.avatar}</Text>
          </View>
        </View>

        {activeTasks > 0 && (
          <View style={styles.activeTaskBanner}>
            <Text style={styles.activeTaskText}>
              {activeTasks} مهمة جارية حالياً
            </Text>
            <Ionicons name="alert-circle" size={14} color={COLORS.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const stats = useMemo(() => ({
    available: technicians.filter((t) => t.status === 'available').length,
    busy: technicians.filter((t) => t.status === 'busy').length,
    offline: technicians.filter((t) => t.status === 'offline').length,
  }), [technicians]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('NewTechnician')}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الفنيون والموظفون</Text>
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#757575' }]}>{stats.offline}</Text>
          <Text style={styles.summaryLabel}>غير متصل</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: COLORS.primary }]}>{stats.busy}</Text>
          <Text style={styles.summaryLabel}>مشغول</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#2E7D32' }]}>{stats.available}</Text>
          <Text style={styles.summaryLabel}>متاح</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: COLORS.text }]}>{technicians.length}</Text>
          <Text style={styles.summaryLabel}>الإجمالي</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="بحث بالاسم أو التخصص..."
          placeholderTextColor={COLORS.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          textAlign="right"
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, activeFilter === f.value && styles.filterTabActive]}
            onPress={() => setActiveFilter(f.value)}
          >
            <Text
              style={[styles.filterText, activeFilter === f.value && styles.filterTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredTechnicians}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="لا يوجد فنيون"
            subtitle="اضغط + لإضافة فني جديد"
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  addButton: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  summary: {
    backgroundColor: COLORS.card,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 22, fontWeight: 'bold' },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  summarySep: { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    margin: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },

  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: '#FFF' },

  listContent: { padding: 12, paddingBottom: 24 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  cardContent: { flexDirection: 'row', padding: 14, alignItems: 'center' },
  cardInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  specialty: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'right', marginBottom: 8 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaValue: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  metaLabel: { fontSize: 11, color: COLORS.textSecondary },
  metaSeparator: { width: 1, height: 12, backgroundColor: COLORS.border },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
  },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  activeTaskBanner: {
    backgroundColor: COLORS.primary + '12',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.primary + '20',
  },
  activeTaskText: { fontSize: 12, color: COLORS.primary, fontWeight: '500' },
});

export default TechniciansListScreen;
