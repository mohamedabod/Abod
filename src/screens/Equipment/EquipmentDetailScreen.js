import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { assetsAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };
const hColor = h => h >= 80 ? '#2E7D32' : h >= 60 ? '#FF6F00' : '#C62828';
const CAT_AR = { electrical: 'كهربي', mechanical: 'ميكانيكي', hvac: 'تكييف', civil: 'مدني', other: 'أخرى' };

export default function EquipmentDetailScreen({ route }) {
  const { id } = route.params;
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const res = await assetsAPI.getOne(id);
      setAsset(res.data);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [id]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>⚠️ {error}</Text><TouchableOpacity onPress={load} style={styles.retryBtn}><Text style={{ color: '#fff' }}>إعادة</Text></TouchableOpacity></View>;
  if (!asset) return null;

  const h = asset.health ?? 100;
  const hc = hColor(h);
  let subsystems = [];
  try { subsystems = typeof asset.subsystems === 'string' ? JSON.parse(asset.subsystems || '[]') : (asset.subsystems || []); } catch (_) {}

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {/* Health + Name */}
      <View style={styles.card}>
        <Text style={styles.assetName}>{asset.name}</Text>
        {asset.category ? <Text style={styles.category}>{CAT_AR[asset.category] || asset.category}</Text> : null}
        <View style={styles.healthRow}>
          <Text style={[styles.healthPct, { color: hc }]}>{h}%</Text>
          <View style={styles.healthBarBg}>
            <View style={[styles.healthBarFill, { width: `${h}%`, backgroundColor: hc }]} />
          </View>
          <Text style={[styles.healthLabel, { color: hc }]}>{h >= 80 ? 'جيد' : h >= 60 ? 'تحذير' : 'حرج'}</Text>
        </View>
      </View>

      {/* WO Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{asset.total_wo ?? '—'}</Text>
          <Text style={styles.statLbl}>إجمالي الطلبات</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: (asset.open_wo || 0) > 0 ? '#FF6F00' : '#2E7D32' }]}>{asset.open_wo ?? '—'}</Text>
          <Text style={styles.statLbl}>طلبات مفتوحة</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>بيانات المعدة</Text>
        {[
          { label: 'الرقم التسلسلي', value: asset.serial },
          { label: 'القسم', value: asset.dept },
          { label: 'الموقع', value: asset.location },
          { label: 'الشركة المصنعة', value: asset.manufacturer },
          { label: 'الموديل', value: asset.model },
          { label: 'سنة الصنع', value: asset.year },
          { label: 'آخر صيانة', value: asset.last_maintenance },
          { label: 'تاريخ الشراء', value: asset.purchase_year },
        ].filter(f => f.value).map(f => (
          <View key={f.label} style={styles.field}>
            <Text style={styles.fieldVal}>{f.value}</Text>
            <Text style={styles.fieldLbl}>{f.label}</Text>
          </View>
        ))}
        {asset.notes ? <View style={{ marginTop: 10 }}><Text style={styles.fieldLbl}>ملاحظات</Text><Text style={styles.notes}>{asset.notes}</Text></View> : null}
      </View>

      {/* Subsystems */}
      {subsystems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>الأنظمة الفرعية</Text>
          {subsystems.map((s, i) => (
            <View key={i} style={styles.subItem}>
              <Ionicons name="chevron-back" size={14} color={C.primary} />
              <Text style={styles.subText}>{typeof s === 'string' ? s : JSON.stringify(s)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { color: '#C62828', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  card: { backgroundColor: C.white, margin: 12, marginBottom: 0, borderRadius: 14, padding: 16, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 12 },
  assetName: { fontSize: 20, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 4 },
  category: { fontSize: 13, color: C.sub, textAlign: 'right', marginBottom: 12 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthPct: { fontSize: 18, fontWeight: 'bold', width: 45, textAlign: 'right' },
  healthBarBg: { flex: 1, height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden' },
  healthBarFill: { height: '100%', borderRadius: 5 },
  healthLabel: { fontSize: 13, fontWeight: '600', width: 40, textAlign: 'right' },
  statsRow: { flexDirection: 'row', margin: 12, marginBottom: 0, gap: 8 },
  statBox: { flex: 1, backgroundColor: C.white, borderRadius: 12, padding: 16, alignItems: 'center', elevation: 2 },
  statVal: { fontSize: 26, fontWeight: 'bold', color: C.text },
  statLbl: { fontSize: 12, color: C.sub, marginTop: 4, textAlign: 'center' },
  field: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  fieldLbl: { fontSize: 12, color: C.sub },
  fieldVal: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right', marginRight: 8 },
  notes: { fontSize: 13, color: C.text, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  subItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 6 },
  subText: { fontSize: 13, color: C.text, flex: 1, textAlign: 'right' },
});
