import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

const C = { primary: '#1565C0', bg: '#000', white: '#fff' };

export default function QRScannerScreen({ navigation, route }) {
  const mode = route.params?.mode || 'equipment'; // 'equipment' | 'report'
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      // QR format: emessa://asset/ASSET_ID  or  emessa://report/ASSET_ID
      const url = new URL(data);
      if (url.protocol === 'emessa:') {
        const parts = url.pathname.replace('//', '').split('/');
        const action = parts[0];
        const assetId = parts[1];

        if (action === 'asset') {
          navigation.replace('EquipmentDetail', { id: assetId });
        } else if (action === 'report') {
          navigation.replace('QuickReport', { assetId, assetName: url.searchParams?.get('name') });
        } else {
          Alert.alert('QR غير معروف', data, [{ text: 'حسناً', onPress: () => setScanned(false) }]);
        }
      } else if (data.includes('/report?asset=')) {
        // Web URL format: http://server:5000/report?asset=ID&name=NAME
        const url2 = new URL(data);
        const assetId = url2.searchParams.get('asset');
        const assetName = url2.searchParams.get('name');
        navigation.replace('QuickReport', { assetId, assetName });
      } else {
        Alert.alert('QR غير معروف', 'هذا الـ QR مش من النظام', [
          { text: 'مسح تاني', onPress: () => setScanned(false) }
        ]);
      }
    } catch (_) {
      Alert.alert('خطأ', 'QR غير صالح', [{ text: 'مسح تاني', onPress: () => setScanned(false) }]);
    } finally {
      setLoading(false);
    }
  };

  if (hasPermission === null) return <View style={styles.container}><ActivityIndicator color="#fff" /></View>;
  if (hasPermission === false) return (
    <View style={styles.container}>
      <Ionicons name="camera-off" size={60} color="#fff" />
      <Text style={styles.permText}>يلزم السماح باستخدام الكاميرا</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFillObject}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        barCodeScannerSettings={{ barCodeTypes: ['qr'] }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topArea}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>امسح QR المعدة</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.middleRow}>
          <View style={styles.sideMask} />
          <View style={styles.scanBox}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            {loading && <ActivityIndicator color="#fff" size="large" />}
          </View>
          <View style={styles.sideMask} />
        </View>

        <View style={styles.bottomArea}>
          <Text style={styles.hint}>ضع الـ QR داخل الإطار</Text>
          {scanned && !loading && (
            <TouchableOpacity style={styles.retryBtn} onPress={() => setScanned(false)}>
              <Text style={styles.retryTxt}>مسح مرة أخرى</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const BOX = 240;
const CORNER = 24;
const BORDER = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  permText: { color: '#fff', marginTop: 16, fontSize: 16, textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  topArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 60, backgroundColor: 'rgba(0,0,0,0.6)' },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  middleRow: { flexDirection: 'row', height: BOX },
  sideMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanBox: { width: BOX, height: BOX, justifyContent: 'center', alignItems: 'center' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },
  bottomArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', paddingTop: 30 },
  hint: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  retryBtn: { marginTop: 20, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryTxt: { color: '#fff', fontWeight: 'bold' },
});
