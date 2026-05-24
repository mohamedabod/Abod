import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const COLORS = { primary: '#1565C0', accent: '#FF6F00', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      return Alert.alert('تنبيه', 'أدخل البريد الإلكتروني وكلمة المرور');
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'فشل تسجيل الدخول';
      if (e.code === 'ECONNREFUSED' || e.code === 'ERR_NETWORK') {
        Alert.alert('❌ لا يوجد اتصال', 'تأكد من إعداد عنوان السيرفر أولاً', [
          { text: 'إعداد السيرفر', onPress: () => navigation.navigate('ServerConfig') },
          { text: 'إلغاء' },
        ]);
      } else {
        Alert.alert('خطأ', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Ionicons name="construct" size={48} color="#fff" />
          </View>
          <Text style={styles.appName}>EmessA CMMS</Text>
          <Text style={styles.appSub}>نظام إدارة الصيانة</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>تسجيل الدخول</Text>

          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="admin@emessa.com"
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign="right"
          />

          <Text style={styles.label}>كلمة المرور</Text>
          <View style={styles.passRow}>
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={COLORS.sub} />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              placeholder="••••••••"
              textAlign="right"
            />
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loginText}>دخول</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.configBtn} onPress={() => navigation.navigate('ServerConfig')}>
          <Ionicons name="settings-outline" size={16} color={COLORS.primary} />
          <Text style={styles.configText}>إعداد عنوان السيرفر</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  appSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, textAlign: 'right', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.sub, textAlign: 'right', marginBottom: 6 },
  input: {
    backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0',
    borderRadius: 10, padding: 13, fontSize: 15, marginBottom: 16,
  },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  eyeBtn: { padding: 13, backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10 },
  loginBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 15, alignItems: 'center', marginTop: 4,
  },
  loginText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  configBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 20, padding: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
  },
  configText: { color: '#fff', fontSize: 14 },
});
