import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { initOfflineDB, syncPendingActions } from '../utils/offline';
import api from '../services/api';

const NetworkContext = createContext({ isOnline: true, syncing: false, pendingCount: 0 });

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    initOfflineDB();
    const unsub = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable);
      setIsOnline(online);
      if (online) runSync();
    });
    return () => unsub();
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncPendingActions(api);
      setPendingCount(0);
    } catch (_) {}
    finally { setSyncing(false); }
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, syncing, pendingCount, runSync }}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => useContext(NetworkContext);
