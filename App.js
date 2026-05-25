import React, { useState, useEffect } from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { AuthProvider } from './src/context/AuthContext';
import './src/screens/Location/LocationTrackingScreen'; // register background task
import { NetworkProvider } from './src/context/NetworkContext';
import AppNavigator from './src/navigation/AppNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import UpdateDialog from './src/components/UpdateDialog';
import { checkForUpdate } from './src/utils/appUpdater';

I18nManager.forceRTL(true);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    // Check for update 3 seconds after app starts
    const t = setTimeout(async () => {
      const available = await checkForUpdate();
      if (available) setUpdate(available);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <OfflineBanner />
            <AppNavigator />
            <UpdateDialog update={update} onDismiss={() => setUpdate(null)} />
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
