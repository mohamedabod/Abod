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
import {
  getEquipmentStatusColor,
  formatDate,
  getRequestsForEquipment,
} from '../../utils/helpers';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
  success: '#2E7D32',
  warning: '#FF6F00',
  danger: '#D32F2F',
};

const STATUS_FILTERS = [
  { label: 'الكل', value: 'all' },
  { label: 'يعمل', value: 'working' },
  { label: 'يحتاج صيانة', value: 'needs-maintenance' },
  { label: 'معطل', value: 'broken' },
];

const EquipmentListScreen = ({ navigation }) => {
  const { state } = useApp();
  const { equipment, requests } = state;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredEquipment = useMemo(() => {
    let result = [...equipment];

    if (activeFilter !== 'all') {
      result = result.filter((e) => e.status === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q) ||
          e.serialNumber.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q)
      );
    }

    return result;
  }, [equipment, activeFilter, searchQuery]);

  const getActiveRequestCount = (equipId) => {
    return getRequestsForEquipment(requests, equipId).filter(
      (r) => r.status === 'pending' || r.status === 'in-progress'
    ).length;
  };

  const renderItem = ({ item }) => {
    const activeRequests = getActiveRequestCount(item.id);
    const statusColor = getEquipmentStatusColor(item.status);

    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: statusColor }]}
        onPress={() => navigation.navigate('EquipmentDetail', { equipmentId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderRight}>
            <StatusBadge status={item.status} type="equipment" size="small" />
          </View>
          <View style={styles.equipIcon}>
            <Ionicons name="cog-outline" size={28} color={statusColor} />
          </View>
        </View>

        <Text style={styles.equipName}>{item.name}</Text>
        <Text style={styles.equipModel}>{item.model}</Text>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.detailValue} numberOfLines={1}>
              {item.location}
            </Text>
            <View style={styles.detailLabel}>
              <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
              <Text style={styles.detailLabelText}>الموقع</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailValue}>{item.serialNumber}</Text>
            <View style={styles.detailLabel}>
              <Ionicons name="barcode-outline" size={13} color={COLORS.textSecondary} />
              <Text style={styles.detailLabelText}>الرقم التسلسلي</Text>
            </View>
          </View>
          {item.lastMaintenanceDate && (
            <View style={styles.detailRow}>
              <Text style={styles.detailValue}>{formatDate(item.lastMaintenanceDate)}</Text>
              <View style={styles.detailLabel}>
                <Ionicons name="time-outline" size={13} color={COLORS.textSecondary} />
                <Text style={styles.detailLabelText}>آخر صيانة</Text>
              </View>
            </View>
          )}
        </View>

        {activeRequests > 0 && (
          <View style={styles.requestsBanner}>
            <Text style={styles.requestsBannerText}>
              {activeRequests} طلب صيانة نشط
            </Text>
            <Ionicons name="alert-circle" size={14} color={COLORS.accent} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const stats = useMemo(() => ({
    working: equipment.filter((e) => e.status === 'working').length,
    needs: equipment.filter((e) => e.status === 'needs-maintenance').length,
    broken: equipment.filter((e) => e.status === 'broken').length,
  }), [equipment]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('NewEquipment')}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المعدات والأصول</Text>
      </View>

      {/* Stats summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: COLORS.danger }]}>{stats.broken}</Text>
          <Text style={styles.summaryLabel}>معطل</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: COLORS.warning }]}>{stats.needs}</Text>
          <Text style={styles.summaryLabel}>يحتاج صيانة</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: COLORS.success }]}>{stats.working}</Text>
          <Text style={styles.summaryLabel}>يعمل</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: COLORS.text }]}>{equipment.length}</Text>
          <Text style={styles.summaryLabel}>الإجمالي</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="بحث بالاسم أو الموقع..."
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

      {/* Filters */}
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
        data={filteredEquipment}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="cog-outline"
            title="لا توجد معدات"
            subtitle="اضغط + لإضافة معدة جديدة"
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
  summaryLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: '#FFF' },
  listContent: { padding: 12, paddingBottom: 24 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderRight: { flex: 1, alignItems: 'flex-end' },
  equipIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  equipName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 3,
  },
  equipModel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginBottom: 10,
  },
  details: {
    backgroundColor: '#F8F9FB',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginBottom: 8,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabelText: { fontSize: 11, color: COLORS.textSecondary },
  detailValue: { fontSize: 11, color: COLORS.text, flex: 1, textAlign: 'left' },
  requestsBanner: {
    backgroundColor: COLORS.accent + '15',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 6,
  },
  requestsBannerText: { fontSize: 12, color: COLORS.accent, fontWeight: '500' },
});

export default EquipmentListScreen;
