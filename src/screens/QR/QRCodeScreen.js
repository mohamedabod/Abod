import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assetsAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', text: '#1a1a1a', sub: '#666' };

// Simple QR-like display showing the URL the QR should contain
export default function QRCodeScreen({ route }) {
  const { assetId, assetName } = route.params || {};
  const [serverUrl, setServerUrl] = useState('');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('server_url').then(url => setServerUrl(url || ''));
    if (!assetId) {
      assetsAPI.getAll().then(r => { setAssets(r.data); setLoading(false); }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const getReportUrl = (id, name) => `${serverUrl}/report?asset=${id}&name=${encodeURIComponent(name || '')}`;

  const shareQR = async (id, name) => {
    try {
      await Share.share({
        message: `رابط بلاغ العطل للمعدة "${name}":\n${getReportUrl(id, name)}\n\nيمكن للعمال فتح الرابط مباشرة من المتصفح لإرسال بلاغ بدون تطبيق`,
        title: `QR - ${name}`,
      });
    } catch (e) { Alert.alert('خطأ', e.message); }
  };

  const showInstructions = () => {
    Alert.alert(
      '📋 طريقة طباعة QR Codes',
      '1. افتح المتصفح على الكمبيوتر\n2. اذهب لـ: [عنوان السيرفر]/api/assets/qr\n3. اطبع صفحة QR لكل معدة\n4. الصق الـ QR على المعدة\n\nالعمال يمسحوا الـ QR من أي موبايل بدون تطبيق',
      [{ text: 'فهمت' }]
    );
  };

  const renderAsset = (id, name) => (
    <View key={id} style={styles.card}>
      <View style={styles.qrPlaceholder}>
        <Ionicons name="qr-code" size={60} color={C.primary} />
        <Text style={styles.qrLabel}>QR</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.assetName}>{name}</Text>
        <Text style={styles.url} numberOfLines={2}>{getReportUrl(id, name)}</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareQR(id, name)}>
          <Ionicons name="share-social" size={16} color="#fff" />
          <Text style={styles.shareTxt}>مشاركة الرابط</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={22} color={C.primary} />
        <Text style={styles.infoText}>
          العمال يمسحوا الـ QR من أي موبايل → يفتح فورم البلاغ في المتصفح بدون تطبيق أو تسجيل دخول
        </Text>
      </View>

      <TouchableOpacity style={styles.printBtn} onPress={showInstructions}>
        <Ionicons name="print" size={20} color="#fff" />
        <Text style={styles.printTxt}>طريقة طباعة الـ QR Codes</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator style={{ margin: 40 }} color={C.primary} size="large" /> : (
        assetId
          ? renderAsset(assetId, assetName)
          : assets.map(a => renderAsset(a.id, a.name))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  infoBox: { flexDirection: 'row', gap: 10, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 13, color: '#1565C0', textAlign: 'right', lineHeight: 20 },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 12, padding: 14, marginBottom: 14 },
  printTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  card: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 14, elevation: 2 },
  qrPlaceholder: { width: 90, height: 90, backgroundColor: '#F0F4FF', borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  qrLabel: { fontSize: 10, color: C.primary, marginTop: 4 },
  cardInfo: { flex: 1 },
  assetName: { fontSize: 15, fontWeight: 'bold', color: C.text, textAlign: 'right', marginBottom: 6 },
  url: { fontSize: 10, color: C.sub, textAlign: 'right', marginBottom: 10 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-end' },
  shareTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
