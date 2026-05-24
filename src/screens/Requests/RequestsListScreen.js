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
import { getPriorityColor, getPriorityText, getRelativeTime } from '../../utils/helpers';

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#212121',
  textSecondary: '#616161',
  border: '#E0E0E0',
};

const FILTER_OPTIONS = [
  { label: 'الكل', value: 'all' },
  { label: 'معلق', value: 'pending' },
  { label: 'قيد التنفيذ', value: 'in-progress' },
  { label: 'مكتمل', value: 'completed' },
  { label: 'ملغى', value: 'cancelled' },
];

const RequestsListScreen = ({ navigation }) => {
  const { state } = useApp();
  const { requests, equipment, technicians } = state;
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRequests = useMemo(() => {
    let result = [...requests];

    if (activeFilter !== 'all') {
      result = result.filter((r) => r.status === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.requestedBy.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [requests, activeFilter, searchQuery]);

  const getEquipmentName = (equipmentId) => {
    const eq = equipment.find((e) => e.id === equipmentId);
    return eq ? eq.name : 'غير محدد';
  };

  const getTechnicianName = (techId) => {
    if (!techId) return 'غير مُسند';
    const tech = technicians.find((t) => t.id === techId);
    return tech ? tech.name : 'غير محدد';
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('RequestDetail', { requestId: item.id })}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <StatusBadge status={item.status} size="small" />
        <View style={styles.priorityContainer}>
          <Text style={[styles.priorityText, { color: getPriorityColor(item.priority) }]}>
            {getPriorityText(item.priority)}
          </Text>
          <View
            style={[
              styles.priorityDot,
              { backgroundColor: getPriorityColor(item.priority) },
            ]}
          />
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>

      <View style={styles.cardInfo}>
        <View style={styles.infoRow}>
          <Text style={styles.infoValue} numberOfLines={1}>
            {getEquipmentName(item.equipmentId)}
          </Text>
          <View style={styles.infoLabel}>
            <Ionicons name="construct-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.infoLabelText}>المعدة:</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoValue} numberOfLines={1}>
            {getTechnicianName(item.technicianId)}
          </Text>
          <View style={styles.infoLabel}>
            <Ionicons name="person-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.infoLabelText}>الفني:</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.footerDate}>{getRelativeTime(item.createdAt)}</Text>
        <Text style={styles.footerRequester} numberOfLines={1}>
          {item.requestedBy}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('NewRequest')}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>طلبات الصيانة</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="بحث في الطلبات..."
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
        {FILTER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.filterTab,
              activeFilter === option.value && styles.filterTabActive,
            ]}
            onPress={() => setActiveFilter(option.value)}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === option.value && styles.filterTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-outline"
            title="لا توجد طلبات"
            subtitle={
              activeFilter !== 'all'
                ? 'لا توجد طلبات بهذا التصفية'
                : 'اضغط + لإضافة طلب صيانة جديد'
            }
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },
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
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
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
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 10,
    lineHeight: 22,
  },
  cardInfo: {
    gap: 6,
    marginBottom: 10,
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    padding: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoLabelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'left',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
  },
  footerDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  footerRequester: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
    textAlign: 'right',
    marginRight: 8,
  },
});

export default RequestsListScreen;
