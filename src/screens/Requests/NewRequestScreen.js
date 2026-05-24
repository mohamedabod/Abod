import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { workordersAPI, assetsAPI, hrAPI } from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

function ChoiceGroup({ label, options, value, onChange, colors }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map(o => (
          <TouchableOpacity key={o.key} style={[styles.choiceBtn, value === o.key && { backgroundColor: (colors?.[o.key] || C.primary), borderColor: (colors?.[o.key] || C.primary) }]} onPress={() => onChange(o.key)}>
            <Text style={[styles.choiceTxt, value === o.key && { color: '#fff' }]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function NewRequestScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [assetId, setAssetId] = useState(null);
  const [techId, setTechId] = useState(null);
  const [priority, setPriority] = useState('medium');
  const [type, setType] = useState('corrective');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [assets, setAssets] = useState([]);
  const [staff, setStaff] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    assetsAPI.getAll().then(r => setAssets(r.data)).catch(() => {});
    hrAPI.getStaff({ active: 1 }).then(r => setStaff(r.data)).catch(() => {});
  }, []);

  const submit = async () => {
    if (!description.trim()) return Alert.alert('تنبيه', 'وصف الطلب مطلوب');
    setSaving(true);
    try {
      await workordersAPI.create({ description: description.trim(), asset_id: assetId, tech_id: techId, priority, type, due_date: dueDate || null, notes: notes || null });
      navigation.goBack();
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.label}>وصف الطلب *</Text>
        <TextInput style={[styles.input, { height: 80 }]} multiline value={description} onChangeText={setDescription} placeholder="اكتب وصف المشكلة..." textAlign="right" textAlignVertical="top" />

        <ChoiceGroup label="الأولوية" value={priority} onChange={setPriority}
          options={[{ key: 'high', label: 'عالي' }, { key: 'medium', label: 'متوسط' }, { key: 'low', label: 'منخفض' }]}
          colors={{ high: '#C62828', medium: '#FF6F00', low: '#2E7D32' }} />

        <ChoiceGroup label="النوع" value={type} onChange={setType}
          options={[{ key: 'corrective', label: 'تصحيحي' }, { key: 'preventive', label: 'وقائي' }, { key: 'inspection', label: 'فحص' }]} />

        <Text style={styles.label}>المعدة</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <TouchableOpacity style={[styles.chip, !assetId && styles.chipActive]} onPress={() => setAssetId(null)}>
            <Text style={[styles.chipTxt, !assetId && styles.chipTxtActive]}>بدون</Text>
          </TouchableOpacity>
          {assets.map(a => (
            <TouchableOpacity key={a.id} style={[styles.chip, assetId === a.id && styles.chipActive]} onPress={() => setAssetId(a.id)}>
              <Text style={[styles.chipTxt, assetId === a.id && styles.chipTxtActive]} numberOfLines={1}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>الفني المسؤول</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <TouchableOpacity style={[styles.chip, !techId && styles.chipActive]} onPress={() => setTechId(null)}>
            <Text style={[styles.chipTxt, !techId && styles.chipTxtActive]}>غير محدد</Text>
          </TouchableOpacity>
          {staff.map(s => (
            <TouchableOpacity key={s.id} style={[styles.chip, techId === s.id && styles.chipActive]} onPress={() => setTechId(s.id)}>
              <Text style={[styles.chipTxt, techId === s.id && styles.chipTxtActive]} numberOfLines={1}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>تاريخ الاستحقاق (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="2025-12-31" textAlign="right" />

        <Text style={styles.label}>ملاحظات</Text>
        <TextInput style={[styles.input, { height: 70 }]} multiline value={notes} onChangeText={setNotes} placeholder="ملاحظات إضافية..." textAlign="right" textAlignVertical="top" />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>إرسال الطلب</Text>}
      </TouchableOpacity>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.white, margin: 12, borderRadius: 14, padding: 16, elevation: 2 },
  label: { fontSize: 13, fontWeight: '600', color: C.sub, textAlign: 'right', marginBottom: 8 },
  input: { backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 16 },
  group: { marginBottom: 16 },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choiceBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center' },
  choiceTxt: { fontSize: 13, color: C.sub },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', marginLeft: 8, borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt: { fontSize: 13, color: C.sub },
  chipTxtActive: { color: '#fff', fontWeight: '600' },
  submitBtn: { backgroundColor: C.primary, margin: 12, borderRadius: 12, padding: 16, alignItems: 'center' },
  submitTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
