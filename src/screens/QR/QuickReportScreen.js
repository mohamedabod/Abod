import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', accent: '#FF6F00', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

const ISSUE_TYPES = [
  { key: 'stopped', label: 'توقف تام', icon: 'stop-circle', color: '#C62828' },
  { key: 'noise', label: 'صوت غريب', icon: 'volume-high', color: '#FF6F00' },
  { key: 'quality', label: 'مشكلة جودة', icon: 'alert-circle', color: '#FF6F00' },
  { key: 'leak', label: 'تسريب', icon: 'water', color: '#1565C0' },
  { key: 'slow', label: 'بطء / أداء ضعيف', icon: 'speedometer', color: '#FF6F00' },
  { key: 'other', label: 'أخرى', icon: 'construct', color: '#666' },
];

const PRIORITY_MAP = { stopped: 'high', noise: 'medium', quality: 'medium', leak: 'high', slow: 'medium', other: 'low' };

export default function QuickReportScreen({ navigation, route }) {
  const { assetId, assetName } = route.params || {};
  const [issueType, setIssueType] = useState(null);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!issueType) return Alert.alert('تنبيه', 'اختر نوع المشكلة');
    setSending(true);
    try {
      const issue = ISSUE_TYPES.find(i => i.key === issueType);
      await workordersAPI.create({
        description: `[${issue.label}] ${notes || ''}`.trim(),
        asset_id: assetId || null,
        priority: PRIORITY_MAP[issueType] || 'medium',
        type: 'corrective',
        notes: notes || null,
      });
      Alert.alert('✅ تم الإرسال', 'تم إرسال البلاغ لقسم الصيانة', [
        { text: 'حسناً', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || 'فشل إرسال البلاغ');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Ionicons name="warning" size={32} color="#C62828" />
        <Text style={styles.title}>بلاغ عطل</Text>
        {assetName ? <Text style={styles.assetName}>🔧 {assetName}</Text> : null}
      </View>

      <Text style={styles.label}>نوع المشكلة *</Text>
      <View style={styles.grid}>
        {ISSUE_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeBtn, issueType === t.key && { borderColor: t.color, backgroundColor: t.color + '15' }]}
            onPress={() => setIssueType(t.key)}
          >
            <Ionicons name={t.icon} size={28} color={issueType === t.key ? t.color : '#999'} />
            <Text style={[styles.typeLabel, issueType === t.key && { color: t.color, fontWeight: 'bold' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>ملاحظات إضافية</Text>
      <TextInput
        style={styles.input}
        value={notes}
        onChangeText={setNotes}
        placeholder="اكتب تفاصيل العطل..."
        multiline
        numberOfLines={4}
        textAlign="right"
        textAlignVertical="top"
      />

      <TouchableOpacity style={[styles.btn, !issueType && { opacity: 0.5 }]} onPress={submit} disabled={sending || !issueType}>
        {sending
          ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="send" size={20} color="#fff" /><Text style={styles.btnTxt}>إرسال البلاغ</Text></>
        }
      </TouchableOpacity>

      <Text style={styles.footer}>سيصل البلاغ لقسم الصيانة فوراً</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { alignItems: 'center', marginBottom: 24, backgroundColor: C.white, padding: 20, borderRadius: 14, elevation: 2 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#C62828', marginTop: 8 },
  assetName: { fontSize: 14, color: C.sub, marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', color: C.sub, textAlign: 'right', marginBottom: 10, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeBtn: { width: '47%', backgroundColor: C.white, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#eee', elevation: 1 },
  typeLabel: { fontSize: 13, color: C.sub, marginTop: 8, textAlign: 'center' },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12, padding: 14, fontSize: 14, height: 100, marginBottom: 20 },
  btn: { backgroundColor: '#C62828', borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  footer: { textAlign: 'center', color: C.sub, fontSize: 12, marginTop: 16 },
});
