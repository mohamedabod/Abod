import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENT_VERSION = '1.0.0';
const CURRENT_BUILD = 1;

export async function checkForUpdate() {
  try {
    const serverUrl = await AsyncStorage.getItem('server_url') || 'http://localhost:5000';
    const res = await fetch(`${serverUrl}/api/app-version`, { timeout: 5000 });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.build > CURRENT_BUILD) return data;
    return null;
  } catch (_) {
    return null;
  }
}

export async function downloadAndInstall(apkUrl, onProgress) {
  const dest = FileSystem.cacheDirectory + 'emessa-update.apk';

  // Remove old file if exists
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) await FileSystem.deleteAsync(dest);

  const download = FileSystem.createDownloadResumable(apkUrl, dest, {}, (prog) => {
    const pct = Math.round((prog.totalBytesWritten / prog.totalBytesExpectedToWrite) * 100);
    onProgress?.(pct);
  });

  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error('Download failed');

  // Trigger Android package installer
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: result.uri,
    flags: 1,  // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
