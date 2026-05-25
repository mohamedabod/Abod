import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي متخصص في صيانة المعدات الصناعية (CMMS) في مصنع غزل ونسيج.
مهمتك مساعدة مهندسي ومشرفي الصيانة في:
- تشخيص الأعطال بناءً على الأعراض
- اقتراح إجراءات الإصلاح خطوة بخطوة
- تحديد قطع الغيار المحتمل استخدامها
- تقييم الأولوية والخطورة
- اقتراح إجراءات الصيانة الوقائية

أجب دائماً بالعربية. كن دقيقاً وعملياً. إذا كانت المشكلة خطرة اذكر ذلك بوضوح.`;

export default function AIAssistantScreen() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'مرحباً! أنا مساعد تشخيص الأعطال. صف لي المشكلة وسأساعدك في التشخيص والإصلاح.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const serverUrl = await AsyncStorage.getItem('server_url') || '';
      const res = await api.post('/api/ai/diagnose', {
        message: userMsg,
        history: messages.slice(-6),
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'عذراً، حدث خطأ في الاتصال. تأكد من إعداد Claude API في السيرفر.'
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const quickPrompts = [
    'صوت طقطقة في الماكينة',
    'ارتفاع درجة حرارة المحرك',
    'تسريب زيت من الهيدروليك',
    'اهتزاز غير طبيعي',
    'توقف مفاجئ بدون سبب',
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: 14 }}>
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}>
              {m.role === 'assistant' && <Ionicons name="hardware-chip" size={16} color={C.primary} style={{ marginBottom: 4 }} />}
              <Text style={[styles.bubbleTxt, m.role === 'user' && styles.userTxt]}>{m.content}</Text>
            </View>
          ))}
          {loading && (
            <View style={styles.aiBubble}>
              <ActivityIndicator size="small" color={C.primary} />
            </View>
          )}
        </ScrollView>

        <View style={styles.quickRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
            {quickPrompts.map(p => (
              <TouchableOpacity key={p} style={styles.quickChip} onPress={() => setInput(p)}>
                <Text style={styles.quickTxt}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputRow}>
          <TouchableOpacity style={[styles.sendBtn, !input.trim() && { opacity: 0.5 }]} onPress={sendMessage} disabled={!input.trim() || loading}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="اكتب الأعراض أو المشكلة..."
            textAlign="right"
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  messages: { flex: 1 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 14, marginBottom: 10 },
  aiBubble: { backgroundColor: C.white, alignSelf: 'flex-end', elevation: 1, borderBottomRightRadius: 4 },
  userBubble: { backgroundColor: C.primary, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: 14, color: C.text, lineHeight: 22, textAlign: 'right' },
  userTxt: { color: '#fff', textAlign: 'left' },
  quickRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: C.white },
  quickChip: { backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  quickTxt: { fontSize: 12, color: C.primary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: C.white, gap: 8, borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
});
