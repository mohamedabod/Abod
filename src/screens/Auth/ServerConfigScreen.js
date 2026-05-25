import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { serverAPI } from '../../services/api';
import axios from 'axios';

const COLORS = { primary: '#1565C0', accent: '#FF6F00', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function ServerConfigScreen({ navigation }) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
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

  const scanNetwork = async () => {
    setScanning(true);
    setScanProgress('جارٍ البحث عن السيرفر...');
    setInfo(null);

    // Get subnet from common local ranges: 192.168.1.x, 192.168.0.x, 10.0.0.x
    const subnets = ['192.168.1', '192.168.0', '10.0.0', '172.16.0'];
    const port = 5000;
    const found = [];

    for (const subnet of subnets) {
      setScanProgress(`فحص ${subnet}.x ...`);
      const checks = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        checks.push(
          axios.get(`http://${ip}:${port}/api/server-info`, { timeout: 800 })
            .then(r => ({ ip, data: r.data }))
            .catch(e => {
              // 401/403 means server is there but needs auth
              if (e.response?.status === 401 || e.response?.status === 403) {
                return { ip, data: null };
              }
              return null;
            })
        );
      }

      // Run in batches of 30 to avoid overwhelming the network
      for (let b = 0; b < checks.length; b += 30) {
        const batch = await Promise.all(checks.slice(b, b + 30));
        batch.forEach(r => r && found.push(r));
        if (found.length > 0) break;
      }
      if (found.length > 0) break;
    }

    setScanning(false);
    setScanProgress('');

    if (found.length === 0) {
      Alert.alert('لم يُعثر على السيرفر', 'تأكد من:\n• EmessA شغال على الكمبيوتر\n• الموبايل والكمبيوتر على نفس الـ WiFi');
      return;
    }

    if (found.length === 1) {
      const base = `http://${found[0].ip}:${port}`;
      setUrl(base);
      await AsyncStorage.setItem('server_url', base);
      const label = found[0].data?.hostname ? `السيرفر: ${found[0].data.hostname}` : `IP: ${found[0].ip}`;
      Alert.alert('✅ تم العثور على السيرفر', `${label}\n${base}\n\nتم الحفظ تلقائياً`);
    } else {
      // Multiple servers found — let user pick
      Alert.alert(
        'عُثر على أكثر من سيرفر',
        found.map(f => `http://${f.ip}:${port}`).join('\n'),
        found.map(f => ({
          text: `http://${f.ip}:${port}`,
          onPress: async () => {
            const base = `http://${f.ip}:${port}`;
            setUrl(base);
            await AsyncStorage.setItem('server_url', base);
          },
        }))
      );
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

      <TouchableOpacity style={[styles.btn, styles.scanBtn]} onPress={scanNetwork} disabled={scanning || testing}>
        {scanning
          ? <><ActivityIndicator color="#fff" size="small" /><Text style={[styles.btnText, { marginRight: 8 }]}>{scanProgress}</Text></>
          : <Text style={styles.btnText}>🔍 بحث تلقائي عن السيرفر</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.testBtn]} onPress={test} disabled={testing || scanning}>
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
  btn: { borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center' },
  scanBtn: { backgroundColor: '#2E7D32' },
  testBtn: { backgroundColor: COLORS.accent },
  saveBtn: { backgroundColor: COLORS.primary },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  examples: { marginTop: 16 },
  exTitle: { fontSize: 13, color: COLORS.sub, textAlign: 'right', marginBottom: 8 },
  exItem: { color: COLORS.primary, fontSize: 13, textAlign: 'right', paddingVertical: 4 },
});
