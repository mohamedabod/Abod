import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { workordersAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

const DEFAULT_CHECKLIST = [
  { id: 1, text: 'تم فصل الطاقة وتطبيق LOTO', required: true },
  { id: 2, text: 'تم تحديد سبب العطل', required: true },
  { id: 3, text: 'تم استخدام قطع الغيار الصحيحة', required: true },
  { id: 4, text: 'تم اختبار المعدة بعد الإصلاح', required: true },
  { id: 5, text: 'المعدة تعمل بشكل طبيعي', required: true },
  { id: 6, text: 'منطقة العمل نظيفة', required: false },
  { id: 7, text: 'تم توثيق قطع الغيار المستخدمة', required: false },
];

export default function ChecklistScreen({ navigation, route }) {
  const { workorderId, woDescription, onComplete } = route.params || {};
  const [checks, setChecks] = useState(DEFAULT_CHECKLIST.map(c => ({ ...c, done: false })));
  const [techNotes, setTechNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setChecks(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c));

  const allRequired = checks.filter(c => c.required).every(c => c.done);
  const doneCount = checks.filter(c => c.done).length;

  const submit = async () => {
    if (!allRequired) {
      Alert.alert('تنبيه', 'يجب إتمام جميع البنود الإجبارية (🔴) قبل الإغلاق');
      return;
    }
    setSaving(true);
    try {
      const checklistData = checks.map(c => ({ id: c.id, text: c.text, done: c.done, required: c.required }));
      await workordersAPI.updateStatus(workorderId, 'done', techNotes || 'تم الإصلاح');
      await workordersAPI.saveChecklist?.(workorderId, { checklist: checklistData, tech_notes: techNotes });
      Alert.alert('✅ تم', 'تم إغلاق أمر الشغل وإرساله للمراجعة', [
        { text: 'حسناً', onPress: () => { onComplete?.(); navigation.goBack(); } }
      ]);
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  const pct = Math.round((doneCount / checks.length) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.woId}>{workorderId}</Text>
        <Text style={styles.woDesc} numberOfLines={2}>{woDescription}</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressPct}>{pct}%</Text>
          <Text style={styles.progressLabel}>اكتملت {doneCount} من {checks.length} بنود</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: allRequired ? '#2E7D32' : C.primary }]} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>قائمة التحقق</Text>

      {checks.map(item => (
        <TouchableOpacity key={item.id} style={styles.checkItem} onPress={() => toggle(item.id)}>
          <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
            {item.done && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
          <Text style={[styles.checkText, item.done && styles.checkTextDone]}>{item.text}</Text>
          {item.required && <Text style={styles.required}>🔴</Text>}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>ملاحظات الفني</Text>
      <TextInput
        style={styles.notesInput}
        value={techNotes}
        onChangeText={setTechNotes}
        placeholder="اكتب ملاحظاتك عن الإصلاح..."
        multiline
        numberOfLines={4}
        textAlign="right"
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.submitBtn, !allRequired && { backgroundColor: '#999' }]}
        onPress={submit}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={styles.submitTxt}>إرسال للاعتماد</Text></>
        }
      </TouchableOpacity>

      {!allRequired && (
        <Text style={styles.warningTxt}>⚠️ أكمل البنود الإجبارية 🔴 أولاً</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, padding: 16, borderRadius: 12, margin: 2, marginBottom: 12 },
  woId: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'right' },
  woDesc: { fontSize: 15, fontWeight: 'bold', color: '#fff', textAlign: 'right', marginTop: 4 },
  progressCard: { backgroundColor: C.white, borderRadius: 12, padding: 14, marginBottom: 14, elevation: 2 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressPct: { fontSize: 22, fontWeight: 'bold', color: C.primary },
  progressLabel: { fontSize: 13, color: C.sub },
  barBg: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 10, marginTop: 6 },
  checkItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 10, padding: 14, marginBottom: 8, gap: 12, elevation: 1 },
  checkbox: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  checkboxDone: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkText: { flex: 1, fontSize: 14, color: C.text, textAlign: 'right' },
  checkTextDone: { color: '#999', textDecorationLine: 'line-through' },
  required: { fontSize: 14 },
  notesInput: { backgroundColor: C.white, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12, padding: 14, fontSize: 14, height: 100, marginBottom: 16 },
  submitBtn: { backgroundColor: '#2E7D32', borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  submitTxt: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  warningTxt: { textAlign: 'center', color: '#FF6F00', marginTop: 10, fontSize: 13 },
});
