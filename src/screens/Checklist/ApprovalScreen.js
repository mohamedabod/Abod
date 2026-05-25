import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function ApprovalScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(null);

  const load = async () => {
    try {
      const res = await workordersAPI.getAll({ status: 'done', limit: 50 });
      setItems(res.data);
    } catch (e) {
      console.log(e.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const approve = async (id) => {
    Alert.alert('اعتماد أمر الشغل', 'هل تؤكد اعتماد وإغلاق هذا الأمر؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'اعتماد ✅', onPress: async () => {
          setApproving(id);
          try {
            await workordersAPI.updateStatus(id, 'closed', 'تم الاعتماد من المهندس');
            await load();
          } catch (e) {
            Alert.alert('خطأ', e.response?.data?.error || e.message);
          } finally { setApproving(null); }
        }
      }
    ]);
  };

  const reject = async (id) => {
    Alert.alert('إعادة فتح', 'هل تريد إعادة فتح هذا الأمر؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إعادة فتح', style: 'destructive', onPress: async () => {
          setApproving(id);
          try {
            await workordersAPI.updateStatus(id, 'inprogress', 'أُعيد فتحه من المهندس للمراجعة');
            await load();
          } catch (e) {
            Alert.alert('خطأ', e.response?.data?.error || e.message);
          } finally { setApproving(null); }
        }
      }
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.woId}>{item.id}</Text>
        <View style={styles.doneBadge}><Text style={styles.doneTxt}>بانتظار الاعتماد</Text></View>
      </View>
      <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.meta}>
        {item.tech_name ? <Text style={styles.metaTxt}>👤 {item.tech_name}</Text> : null}
        {item.asset_name ? <Text style={styles.metaTxt}>🔧 {item.asset_name}</Text> : null}
        {item.closed_date ? <Text style={styles.metaTxt}>📅 {item.closed_date}</Text> : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(item.id)} disabled={approving === item.id}>
          <Ionicons name="arrow-undo" size={16} color="#C62828" />
          <Text style={styles.rejectTxt}>إعادة فتح</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.approveBtn} onPress={() => approve(item.id)} disabled={approving === item.id}>
          {approving === item.id
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={styles.approveTxt}>اعتماد ✅</Text></>
          }
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTxt}>بانتظار اعتمادك: {items.length} أمر</Text>
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={60} color="#4CAF50" />
              <Text style={styles.emptyTxt}>لا توجد أوامر بانتظار الاعتماد</Text>
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
  topBar: { backgroundColor: C.primary, padding: 14 },
  topBarTxt: { color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 15 },
  card: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  woId: { fontSize: 15, fontWeight: 'bold', color: C.primary },
  doneBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  doneTxt: { fontSize: 12, color: '#FF6F00', fontWeight: '600' },
  desc: { fontSize: 14, color: C.text, textAlign: 'right', marginBottom: 10 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  metaTxt: { fontSize: 12, color: C.sub },
  actions: { flexDirection: 'row', gap: 10 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#C62828' },
  rejectTxt: { color: '#C62828', fontWeight: '600' },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, backgroundColor: '#2E7D32' },
  approveTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  empty: { alignItems: 'center', padding: 60 },
  emptyTxt: { color: '#4CAF50', fontSize: 15, marginTop: 12, fontWeight: '600' },
});
