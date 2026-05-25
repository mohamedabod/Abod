import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

const C = { primary: '#1565C0', bg: '#F5F7FA', white: '#fff', sub: '#666' };

export default function PhotoPicker({ photos = [], onAdd, onRemove, maxPhotos = 5, editable = true }) {
  const [uploading, setUploading] = useState(false);

  const pickImage = async (useCamera) => {
    if (photos.length >= maxPhotos) {
      Alert.alert('تنبيه', `الحد الأقصى ${maxPhotos} صور`);
      return;
    }
    const { status } = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('تنبيه', 'يلزم السماح بالوصول للكاميرا/الصور');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: false });

    if (!result.canceled && result.assets?.[0]) {
      onAdd?.(result.assets[0]);
    }
  };

  const confirmRemove = (index) => {
    Alert.alert('حذف الصورة', 'هل تريد حذف هذه الصورة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => onRemove?.(index) },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {photos.map((photo, i) => (
          <View key={i} style={styles.thumb}>
            <Image source={{ uri: photo.uri || photo.url }} style={styles.img} />
            {editable && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => confirmRemove(i)}>
                <Ionicons name="close-circle" size={20} color="#C62828" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {editable && photos.length < maxPhotos && (
          <>
            <TouchableOpacity style={styles.addBtn} onPress={() => pickImage(true)}>
              <Ionicons name="camera" size={24} color={C.primary} />
              <Text style={styles.addTxt}>كاميرا</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => pickImage(false)}>
              <Ionicons name="images" size={24} color={C.primary} />
              <Text style={styles.addTxt}>معرض</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {uploading && <ActivityIndicator color={C.primary} style={{ marginTop: 8 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  scroll: { flexDirection: 'row' },
  thumb: { width: 80, height: 80, marginLeft: 8, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  img: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 2, right: 2, backgroundColor: '#fff', borderRadius: 10 },
  addBtn: { width: 80, height: 80, marginLeft: 8, backgroundColor: '#E3F2FD', borderRadius: 10, borderWidth: 1.5, borderColor: C.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  addTxt: { fontSize: 10, color: C.primary, marginTop: 4 },
});
