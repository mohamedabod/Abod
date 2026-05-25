import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';

const db = SQLite.openDatabase('emessa_offline.db');

export function initOfflineDB() {
  db.transaction(tx => {
    tx.executeSql(`CREATE TABLE IF NOT EXISTS pending_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);
    tx.executeSql(`CREATE TABLE IF NOT EXISTS cached_workorders (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`);
  });
}

export function saveOfflineAction(type, method, endpoint, payload) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'INSERT INTO pending_actions (type, method, endpoint, payload) VALUES (?,?,?,?)',
        [type, method, endpoint, JSON.stringify(payload)],
        (_, result) => resolve(result.insertId),
        (_, err) => reject(err)
      );
    });
  });
}

export function getPendingActions() {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM pending_actions ORDER BY created_at ASC',
        [],
        (_, { rows }) => resolve(rows._array),
        (_, err) => reject(err)
      );
    });
  });
}

export function deletePendingAction(id) {
  return new Promise((resolve) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM pending_actions WHERE id = ?', [id], () => resolve());
    });
  });
}

export function cacheWorkorders(workorders) {
  db.transaction(tx => {
    workorders.forEach(wo => {
      tx.executeSql(
        'INSERT OR REPLACE INTO cached_workorders (id, data) VALUES (?,?)',
        [wo.id, JSON.stringify(wo)]
      );
    });
  });
}

export function getCachedWorkorders() {
  return new Promise((resolve) => {
    db.transaction(tx => {
      tx.executeSql('SELECT * FROM cached_workorders', [], (_, { rows }) => {
        resolve(rows._array.map(r => JSON.parse(r.data)));
      }, () => resolve([]));
    });
  });
}

export function isOnline() {
  return NetInfo.fetch().then(s => s.isConnected && s.isInternetReachable);
}

export async function syncPendingActions(apiInstance) {
  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  const actions = await getPendingActions();
  let synced = 0, failed = 0;

  for (const action of actions) {
    try {
      const payload = action.payload ? JSON.parse(action.payload) : {};
      await apiInstance.request({ method: action.method, url: action.endpoint, data: payload });
      await deletePendingAction(action.id);
      synced++;
    } catch (_) {
      failed++;
    }
  }
  return { synced, failed };
}
