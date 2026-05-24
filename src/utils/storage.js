import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  REQUESTS: '@maintenance_requests',
  TECHNICIANS: '@maintenance_technicians',
  EQUIPMENT: '@maintenance_equipment',
  APP_INITIALIZED: '@app_initialized',
};

/**
 * Save requests to AsyncStorage
 */
export const saveRequests = async (requests) => {
  try {
    await AsyncStorage.setItem(KEYS.REQUESTS, JSON.stringify(requests));
    return true;
  } catch (error) {
    console.error('Error saving requests:', error);
    return false;
  }
};

/**
 * Load requests from AsyncStorage
 */
export const loadRequests = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.REQUESTS);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading requests:', error);
    return null;
  }
};

/**
 * Save technicians to AsyncStorage
 */
export const saveTechnicians = async (technicians) => {
  try {
    await AsyncStorage.setItem(KEYS.TECHNICIANS, JSON.stringify(technicians));
    return true;
  } catch (error) {
    console.error('Error saving technicians:', error);
    return false;
  }
};

/**
 * Load technicians from AsyncStorage
 */
export const loadTechnicians = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.TECHNICIANS);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading technicians:', error);
    return null;
  }
};

/**
 * Save equipment to AsyncStorage
 */
export const saveEquipment = async (equipment) => {
  try {
    await AsyncStorage.setItem(KEYS.EQUIPMENT, JSON.stringify(equipment));
    return true;
  } catch (error) {
    console.error('Error saving equipment:', error);
    return false;
  }
};

/**
 * Load equipment from AsyncStorage
 */
export const loadEquipment = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.EQUIPMENT);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading equipment:', error);
    return null;
  }
};

/**
 * Check if app has been initialized with seed data
 */
export const isAppInitialized = async () => {
  try {
    const value = await AsyncStorage.getItem(KEYS.APP_INITIALIZED);
    return value === 'true';
  } catch (error) {
    return false;
  }
};

/**
 * Mark app as initialized
 */
export const markAppInitialized = async () => {
  try {
    await AsyncStorage.setItem(KEYS.APP_INITIALIZED, 'true');
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Clear all data (for testing/reset)
 */
export const clearAllData = async () => {
  try {
    await AsyncStorage.multiRemove([
      KEYS.REQUESTS,
      KEYS.TECHNICIANS,
      KEYS.EQUIPMENT,
      KEYS.APP_INITIALIZED,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    return false;
  }
};

/**
 * Save all data at once
 */
export const saveAllData = async ({ requests, technicians, equipment }) => {
  try {
    const pairs = [
      [KEYS.REQUESTS, JSON.stringify(requests)],
      [KEYS.TECHNICIANS, JSON.stringify(technicians)],
      [KEYS.EQUIPMENT, JSON.stringify(equipment)],
    ];
    await AsyncStorage.multiSet(pairs);
    return true;
  } catch (error) {
    console.error('Error saving all data:', error);
    return false;
  }
};

/**
 * Load all data at once
 */
export const loadAllData = async () => {
  try {
    const values = await AsyncStorage.multiGet([
      KEYS.REQUESTS,
      KEYS.TECHNICIANS,
      KEYS.EQUIPMENT,
    ]);
    return {
      requests: values[0][1] ? JSON.parse(values[0][1]) : null,
      technicians: values[1][1] ? JSON.parse(values[1][1]) : null,
      equipment: values[2][1] ? JSON.parse(values[2][1]) : null,
    };
  } catch (error) {
    console.error('Error loading all data:', error);
    return { requests: null, technicians: null, equipment: null };
  }
};
