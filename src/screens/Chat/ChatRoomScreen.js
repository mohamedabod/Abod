import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import api from '../../services/api';
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
  const flatRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: room.name });
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

  const renderMsg = ({ item }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {!isMe && <Text style={styles.sender}>{item.sender_name}</Text>}
          {item.type === 'voice'
            ? <TouchableOpacity style={styles.voiceBtn} onPress={() => playVoice(item.content)}>
                <Ionicons name="play-circle" size={28} color={isMe ? '#fff' : C.primary} />
                <Text style={[styles.voiceTxt, isMe && { color: '#fff' }]}>رسالة صوتية</Text>
              </TouchableOpacity>
            : <Text style={[styles.msgTxt, isMe && styles.msgTxtMe]}>{item.content}</Text>
          }
          <Text style={[styles.msgTime, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
            {new Date(item.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={i => String(i.id)}
          renderItem={renderMsg}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd()}
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
});
