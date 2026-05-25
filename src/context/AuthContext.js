import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { authAPI, locationAPI } from '../services/api';

export const LOCATION_TASK = 'background-location';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('auth_token');
        if (savedToken) {
          setToken(savedToken);
          const res = await authAPI.me();
          setUser(res.data.user);
        }
      } catch {
        await AsyncStorage.removeItem('auth_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const registerPushToken = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const finalStatus = status === 'granted'
        ? status
        : (await Notifications.requestPermissionsAsync()).status;
      if (finalStatus !== 'granted') return;
      const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();
      await authAPI.savePushToken(expoPushToken);
    } catch (_) {}
  };

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    const { token: t, user: u } = res.data;
    await AsyncStorage.setItem('auth_token', t);
    setToken(t);
    setUser(u);
    registerPushToken();
    return u;
  };

  const logout = async () => {
    try { await locationAPI.clearMyLocation(); } catch (_) {}
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
      if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch (_) {}
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('location_tracking');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
