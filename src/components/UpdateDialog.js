import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadAndInstall } from '../utils/appUpdater';

export default function UpdateDialog({ update, onDismiss }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  if (!update) return null;

  const handleUpdate = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadAndInstall(update.apk_url, setProgress);
    } catch (e) {
      setError('فشل التحميل. تأكد من الاتصال بالسيرفر.');
      setDownloading(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <Ionicons name="rocket" size={36} color="#1565C0" />
          </View>
          <Text style={styles.title}>تحديث جديد متاح</Text>
          <Text style={styles.version}>الإصدار {update.version}</Text>

          {update.changelog ? (
            <View style={styles.changelogBox}>
              <Text style={styles.changelogText}>{update.changelog}</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {downloading ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color="#1565C0" />
              <Text style={styles.progressText}>جارٍ التحميل... {progress}%</Text>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${progress}%` }]} />
              </View>
            </View>
          ) : (
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.laterBtn} onPress={onDismiss}>
                <Text style={styles.laterTxt}>لاحقاً</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.updateBtn} onPress={handleUpdate}>
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={styles.updateTxt}>تحديث الآن</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', elevation: 10 },
  iconRow: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  version: { fontSize: 14, color: '#1565C0', fontWeight: '600', marginBottom: 16 },
  changelogBox: { backgroundColor: '#F5F7FA', borderRadius: 12, padding: 12, width: '100%', marginBottom: 16 },
  changelogText: { fontSize: 13, color: '#444', textAlign: 'right', lineHeight: 20 },
  errorText: { color: '#c62828', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  progressBox: { width: '100%', alignItems: 'center', gap: 8 },
  progressText: { fontSize: 14, color: '#555' },
  barBg: { width: '100%', height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#1565C0', borderRadius: 4 },
  btnRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 },
  laterBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center' },
  laterTxt: { color: '#666', fontWeight: '600' },
  updateBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  updateTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
