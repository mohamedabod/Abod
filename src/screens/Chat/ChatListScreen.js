import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function ChatListScreen({ navigation }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    try {
      const res = await api.get('/api/chat/rooms');
      setRooms(res.data);
    } catch (_) { } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filteredRooms = searchQuery.trim()
    ? rooms.filter(r =>
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : rooms;

  const renderRoom = ({ item }) => (
    <TouchableOpacity style={styles.room} onPress={() => navigation.navigate('ChatRoom', { room: item })}>
      <View style={styles.avatar}>
        {item.is_group
          ? <Ionicons name="people" size={22} color={C.primary} />
          : <Text style={styles.avatarTxt}>{item.name?.charAt(0)}</Text>
        }
      </View>
      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={styles.row}>
          {item.unread > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{item.unread}</Text></View>}
          <Text style={styles.roomName}>{item.name}</Text>
        </View>
        {item.last_message && <Text style={styles.lastMsg} numberOfLines={1}>{item.last_message}</Text>}
      </View>
      <Text style={styles.time}>{item.last_at ? new Date(item.last_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={C.sub} style={{ marginLeft: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ابحث في المحادثات..."
          textAlign="right"
          placeholderTextColor={C.sub}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ marginRight: 8 }}>
            <Ionicons name="close-circle" size={18} color={C.sub} />
          </TouchableOpacity>
        )}
      </View>
      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> : (
        <FlatList
          data={filteredRooms}
          keyExtractor={i => String(i.id)}
          renderItem={renderRoom}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={56} color="#ccc" />
              <Text style={styles.emptyTxt}>
                {searchQuery.trim() ? 'لا توجد نتائج' : 'لا توجد محادثات بعد'}
              </Text>
            </View>
          }
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewChat')}>
        <Ionicons name="create" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#e8e8e8', paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, paddingHorizontal: 8, paddingVertical: 4 },
  room: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: 'bold', color: C.primary },
  row: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 4 },
  roomName: { fontSize: 15, fontWeight: '600', color: C.text },
  lastMsg: { fontSize: 13, color: C.sub, textAlign: 'right' },
  time: { fontSize: 11, color: C.sub, marginLeft: 8 },
  badge: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  empty: { alignItems: 'center', padding: 60 },
  emptyTxt: { color: '#ccc', marginTop: 12, fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, left: 24, backgroundColor: C.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});
