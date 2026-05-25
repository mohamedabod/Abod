import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { serverAPI } from '../../services/api';

const COLORS = { primary: '#1565C0', accent: '#FF6F00', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function ServerConfigScreen({ navigation }) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('server_url').then(v => v && setUrl(v));
  }, []);

  const test = async () => {
    if (!url.trim()) return Alert.alert('خطأ', 'أدخل عنوان السيرفر');
    const base = url.trim().replace(/\/$/, '');
    setTesting(true);
    setInfo(null);
    try {
      const res = await serverAPI.getInfo(base);
      setInfo(res.data);
      await AsyncStorage.setItem('server_url', base);
      Alert.alert('✅ اتصال ناجح', `السيرفر: ${res.data.hostname}\nIP: ${res.data.ips?.join(', ')}`);
    } catch (e) {
      const status = e.response?.status;
      if (status === 401 || status === 403) {
        // Server is reachable — auth required (expected before login)
        await AsyncStorage.setItem('server_url', base);
        setInfo({ hostname: base, ips: [base], port: 5000 });
        Alert.alert('✅ السيرفر شغال', 'تم الاتصال بنجاح\nسجّل دخولك الآن');
      } else if (status) {
        // Got a response = server reachable, unexpected error
        await AsyncStorage.setItem('server_url', base);
        Alert.alert('✅ السيرفر شغال', `استجابة السيرفر: ${status}`);
      } else {
        // No response = wrong IP or server off
        Alert.alert('❌ فشل الاتصال', 'تأكد من:\n• الـ IP صح\n• EmessA شغال على الكمبيوتر\n• الكمبيوتر والموبايل على نفس الـ WiFi');
      }
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!url.trim()) return Alert.alert('خطأ', 'أدخل عنوان السيرفر');
    await AsyncStorage.setItem('server_url', url.trim().replace(/\/$/, ''));
    navigation?.goBack?.();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>إعداد عنوان السيرفر</Text>
      <Text style={styles.sub}>أدخل عنوان IP الكمبيوتر اللي شغّال عليه EmessA CMMS</Text>

      <Text style={styles.label}>عنوان السيرفر</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.100:5000"
        autoCapitalize="none"
        keyboardType="url"
        textAlign="right"
      />

      <Text style={styles.hint}>
        💡 لمعرفة الـ IP: افتح CMD على الكمبيوتر واكتب {`ipconfig`}
      </Text>

      {info && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>🖥️ {info.hostname}</Text>
          <Text style={styles.infoText}>🌐 {info.ips?.join(' | ')}</Text>
          <Text style={styles.infoText}>🔌 Port: {info.port}</Text>
        </View>
      )}

      <TouchableOpacity style={[styles.btn, styles.testBtn]} onPress={test} disabled={testing}>
        {testing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>اختبار الاتصال</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={save}>
        <Text style={styles.btnText}>حفظ والرجوع</Text>
      </TouchableOpacity>

      <View style={styles.examples}>
        <Text style={styles.exTitle}>أمثلة:</Text>
        {['http://192.168.1.100:5000', 'http://10.0.0.50:5000', 'https://xxxx.trycloudflare.com'].map(ex => (
          <TouchableOpacity key={ex} onPress={() => setUrl(ex)}>
            <Text style={styles.exItem}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, textAlign: 'right', marginBottom: 8 },
  sub: { fontSize: 14, color: COLORS.sub, textAlign: 'right', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginBottom: 8 },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: '#ddd',
    borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 8,
  },
  hint: { fontSize: 12, color: COLORS.sub, textAlign: 'right', marginBottom: 20 },
  infoBox: {
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginBottom: 20,
    borderLeftWidth: 4, borderLeftColor: '#4CAF50',
  },
  infoText: { fontSize: 13, color: '#2E7D32', textAlign: 'right', marginBottom: 4 },
  btn: { borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 12 },
  testBtn: { backgroundColor: COLORS.accent },
  saveBtn: { backgroundColor: COLORS.primary },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  examples: { marginTop: 16 },
  exTitle: { fontSize: 13, color: COLORS.sub, textAlign: 'right', marginBottom: 8 },
  exItem: { color: COLORS.primary, fontSize: 13, textAlign: 'right', paddingVertical: 4 },
});
