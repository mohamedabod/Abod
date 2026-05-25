import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hrAPI } from '../../services/api';
import api from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function NewChatScreen({ navigation }) {
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    hrAPI.getStaff().then(r => { setStaff(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const create = async () => {
    if (selected.length === 0) return Alert.alert('تنبيه', 'اختر شخصاً على الأقل');
    const isGroup = selected.length > 1;
    if (isGroup && !groupName.trim()) return Alert.alert('تنبيه', 'أدخل اسم المجموعة');
    setCreating(true);
    try {
      const res = await api.post('/api/chat/rooms', {
        members: selected,
        is_group: isGroup,
        name: isGroup ? groupName.trim() : null,
      });
      navigation.replace('ChatRoom', { room: res.data });
    } catch (e) {
      Alert.alert('خطأ', e.response?.data?.error || e.message);
    } finally { setCreating(false); }
  };

  return (
    <View style={styles.container}>
      {selected.length > 1 && (
        <TextInput style={styles.groupInput} value={groupName} onChangeText={setGroupName}
          placeholder="اسم المجموعة..." textAlign="right" />
      )}
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} /> : (
        <FlatList
          data={staff}
          keyExtractor={i => String(i.id)}
          renderItem={({ item }) => {
            const sel = selected.includes(item.id);
            return (
              <TouchableOpacity style={[styles.row, sel && styles.rowSelected]} onPress={() => toggle(item.id)}>
                <View style={[styles.check, sel && styles.checkDone]}>
                  {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.role}>{item.department || item.role}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
      <TouchableOpacity style={[styles.createBtn, selected.length === 0 && { opacity: 0.4 }]}
        onPress={create} disabled={creating || selected.length === 0}>
        {creating ? <ActivityIndicator color="#fff" /> : (
          <><Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
          <Text style={styles.createTxt}>{selected.length > 1 ? `إنشاء مجموعة (${selected.length})` : 'بدء محادثة'}</Text></>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  groupInput: { margin: 12, padding: 12, backgroundColor: C.white, borderRadius: 10, borderWidth: 1.5, borderColor: '#ddd', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 12 },
  rowSelected: { backgroundColor: '#E3F2FD' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  checkDone: { backgroundColor: C.primary, borderColor: C.primary },
  name: { fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'right' },
  role: { fontSize: 12, color: C.sub, textAlign: 'right' },
  createBtn: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: C.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 6 },
  createTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
