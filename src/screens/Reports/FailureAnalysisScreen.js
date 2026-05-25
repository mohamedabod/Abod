import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function FailureAnalysisScreen() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(90);

  const load = async () => {
    try {
      const res = await api.get(`/api/reports/failure-patterns?days=${days}&min_count=2`);
      setPatterns(res.data);
    } catch (_) {} finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [days]));

  const riskColor = (count) => count >= 5 ? '#C62828' : count >= 3 ? '#FF6F00' : '#2E7D32';

  return (
    <View style={styles.container}>
      <View style={styles.periodRow}>
        {[30, 90, 180].map(d => (
          <TouchableOpacity key={d} style={[styles.periodBtn, days === d && styles.periodActive]} onPress={() => setDays(d)}>
            <Text style={[styles.periodTxt, days === d && styles.periodTxtActive]}>{d} يوم</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.infoBox}>
        <Ionicons name="analytics" size={18} color={C.primary} />
        <Text style={styles.infoTxt}>المعدات التي تكررت أعطالها أكثر من مرة — مرشحة لإدراجها في خطة الصيانة الوقائية</Text>
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> : (
        <FlatList
          data={patterns}
          keyExtractor={i => String(i.asset_id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { borderLeftColor: riskColor(item.failure_count) }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.countBadge, { backgroundColor: riskColor(item.failure_count) }]}>
                  <Text style={styles.countTxt}>{item.failure_count}x</Text>
                </View>
                <Text style={styles.assetName}>{item.asset_name}</Text>
              </View>
              <Text style={styles.lastFail}>آخر عطل: {item.last_failure}</Text>
              {item.avg_days_between && (
                <Text style={styles.pattern}>📊 متوسط التكرار كل {Math.round(item.avg_days_between)} يوم</Text>
              )}
              <View style={styles.recommendation}>
                <Ionicons name="bulb" size={14} color="#FF6F00" />
                <Text style={styles.recTxt}>
                  {item.failure_count >= 5
                    ? 'خطر عالي — فكر في استبدال المكون أو زيادة تكرار الصيانة'
                    : item.failure_count >= 3
                    ? 'أضف صيانة وقائية كل ' + Math.round((item.avg_days_between || 30) * 0.8) + ' يوم'
                    : 'راجع إجراءات الصيانة الحالية لهذه المعدة'
                  }
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle" size={56} color="#4CAF50" />
              <Text style={styles.emptyTxt}>لا توجد أعطال متكررة في هذه الفترة</Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  periodRow: { flexDirection: 'row', margin: 12, gap: 8 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', backgroundColor: C.white },
  periodActive: { backgroundColor: C.primary, borderColor: C.primary },
  periodTxt: { fontSize: 13, color: C.sub },
  periodTxtActive: { color: '#fff', fontWeight: 'bold' },
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginHorizontal: 12, marginBottom: 8, alignItems: 'flex-start' },
  infoTxt: { flex: 1, fontSize: 12, color: C.primary, textAlign: 'right', lineHeight: 18 },
  card: { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  assetName: { fontSize: 15, fontWeight: 'bold', color: C.text, flex: 1, textAlign: 'right', marginLeft: 8 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  countTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  lastFail: { fontSize: 12, color: C.sub, textAlign: 'right', marginBottom: 4 },
  pattern: { fontSize: 13, color: C.text, textAlign: 'right', marginBottom: 8 },
  recommendation: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF8E1', padding: 10, borderRadius: 8 },
  recTxt: { flex: 1, fontSize: 12, color: C.text, textAlign: 'right', lineHeight: 18 },
  empty: { alignItems: 'center', padding: 60 },
  emptyTxt: { color: '#4CAF50', fontSize: 14, marginTop: 12, fontWeight: '600', textAlign: 'center' },
});
