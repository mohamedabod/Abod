import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import api, { chatAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function ChatRoomScreen({ route, navigation }) {
  const { room } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const flatRef = useRef(null);
  const searchInputRef = useRef(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .map((m, i) => ({ index: i, msg: m }))
      .filter(({ msg }) => msg.type === 'text' && msg.content?.toLowerCase().includes(q));
  }, [searchQuery, messages]);

  const openSearch = () => {
    setIsSearching(true);
    setSearchQuery('');
    setSearchIdx(0);
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={closeSearch} style={{ marginRight: 12 }}>
          <Ionicons name="close" size={22} color={C.primary} />
        </TouchableOpacity>
      ),
    });
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchIdx(0);
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={openSearch} style={{ marginRight: 12 }}>
          <Ionicons name="search" size={22} color={C.primary} />
        </TouchableOpacity>
      ),
    });
  };

  const navigateSearch = (dir) => {
    if (!searchResults.length) return;
    const next = (searchIdx + dir + searchResults.length) % searchResults.length;
    setSearchIdx(next);
    flatRef.current?.scrollToIndex({ index: searchResults[next].index, animated: true, viewPosition: 0.5 });
  };

  useEffect(() => {
    navigation.setOptions({
      title: room.name,
      headerRight: () => (
        <TouchableOpacity onPress={openSearch} style={{ marginRight: 12 }}>
          <Ionicons name="search" size={22} color={C.primary} />
        </TouchableOpacity>
      ),
    });
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMessages = async () => {
    try {
      const res = await api.get(`/api/chat/rooms/${room.id}/messages`);
      setMessages(res.data.reverse());
    } catch (_) {}
  };

  const sendText = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      await api.post('/api/chat/messages', { room_id: room.id, content: text, type: 'text' });
      await loadMessages();
      flatRef.current?.scrollToEnd({ animated: true });
    } catch (_) {} finally { setSending(false); }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
    } catch (_) {}
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    // Upload voice message
    const formData = new FormData();
    formData.append('audio', { uri, type: 'audio/m4a', name: 'voice.m4a' });
    formData.append('room_id', String(room.id));
    formData.append('type', 'voice');
    try {
      await api.post('/api/chat/voice', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadMessages();
    } catch (_) {}
  };

  const playVoice = async (url) => {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      await sound.playAsync();
    } catch (_) {}
  };

  const confirmDelete = (msg) => {
    Alert.alert(
      'حذف الرسالة',
      'هل تريد حذف هذه الرسالة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatAPI.deleteMessage(msg.id);
              setMessages(prev => prev.filter(m => m.id !== msg.id));
            } catch (_) {
              Alert.alert('خطأ', 'تعذّر حذف الرسالة');
            }
          },
        },
      ]
    );
  };

  const renderHighlighted = (text, isMe) => {
    if (!searchQuery.trim()) return <Text style={[styles.msgTxt, isMe && styles.msgTxtMe]}>{text}</Text>;
    const q = searchQuery.toLowerCase();
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <Text style={[styles.msgTxt, isMe && styles.msgTxtMe]}>
        {parts.map((part, i) =>
          part.toLowerCase() === q
            ? <Text key={i} style={styles.highlight}>{part}</Text>
            : part
        )}
      </Text>
    );
  };

  const renderMsg = ({ item, index }) => {
    const isMe = item.sender_id === user?.id;
    const isCurrentResult = searchResults[searchIdx]?.index === index;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => isMe && confirmDelete(item)}
          delayLongPress={400}
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, isCurrentResult && styles.bubbleHighlighted]}
        >
          {!isMe && <Text style={styles.sender}>{item.sender_name}</Text>}
          {item.type === 'voice'
            ? <TouchableOpacity style={styles.voiceBtn} onPress={() => playVoice(item.content)}>
                <Ionicons name="play-circle" size={28} color={isMe ? '#fff' : C.primary} />
                <Text style={[styles.voiceTxt, isMe && { color: '#fff' }]}>رسالة صوتية</Text>
              </TouchableOpacity>
            : renderHighlighted(item.content, isMe)
          }
          <Text style={[styles.msgTime, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
            {new Date(item.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {isSearching && (
          <View style={styles.searchBar}>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(t) => { setSearchQuery(t); setSearchIdx(0); }}
              placeholder="ابحث في الرسائل..."
              textAlign="right"
              placeholderTextColor={C.sub}
            />
            {searchResults.length > 0 && (
              <View style={styles.searchNav}>
                <TouchableOpacity onPress={() => navigateSearch(1)} style={styles.navBtn}>
                  <Ionicons name="chevron-down" size={18} color={C.primary} />
                </TouchableOpacity>
                <Text style={styles.searchCount}>{searchIdx + 1}/{searchResults.length}</Text>
                <TouchableOpacity onPress={() => navigateSearch(-1)} style={styles.navBtn}>
                  <Ionicons name="chevron-up" size={18} color={C.primary} />
                </TouchableOpacity>
              </View>
            )}
            {searchQuery.length > 0 && searchResults.length === 0 && (
              <Text style={styles.noResults}>لا نتائج</Text>
            )}
          </View>
        )}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={i => String(i.id)}
          renderItem={renderMsg}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => !isSearching && flatRef.current?.scrollToEnd()}
          onScrollToIndexFailed={() => {}}
        />
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.voiceBtn2, isRecording && { backgroundColor: '#C62828' }]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
          >
            <Ionicons name={isRecording ? 'radio-button-on' : 'mic'} size={22} color="#fff" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="اكتب رسالة..."
            textAlign="right"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={sendText}
            disabled={!input.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  msgRow: { marginBottom: 8, alignItems: 'flex-end' },
  msgRowMe: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 14, elevation: 1 },
  bubbleThem: { backgroundColor: C.white, borderBottomRightRadius: 4 },
  bubbleMe: { backgroundColor: C.primary, borderBottomLeftRadius: 4 },
  sender: { fontSize: 11, color: C.primary, fontWeight: 'bold', textAlign: 'right', marginBottom: 4 },
  msgTxt: { fontSize: 14, color: C.text, textAlign: 'right', lineHeight: 20 },
  msgTxtMe: { color: '#fff', textAlign: 'left' },
  msgTime: { fontSize: 10, color: C.sub, marginTop: 4, textAlign: 'right' },
  voiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceTxt: { fontSize: 14, color: C.text },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
  input: { flex: 1, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  voiceBtn2: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#e8e8e8', paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 4 },
  searchNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: { padding: 4 },
  searchCount: { fontSize: 12, color: C.sub, minWidth: 36, textAlign: 'center' },
  noResults: { fontSize: 12, color: C.sub, marginLeft: 8 },
  highlight: { backgroundColor: '#FFF176', color: C.text, borderRadius: 2 },
  bubbleHighlighted: { borderWidth: 2, borderColor: '#FDD835' },
});
