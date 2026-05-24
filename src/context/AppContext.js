import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { generateId } from '../utils/helpers';
import {
  loadAllData,
  saveRequests,
  saveTechnicians,
  saveEquipment,
  isAppInitialized,
  markAppInitialized,
} from '../utils/storage';

// ==================== SEED DATA ====================

const SEED_TECHNICIANS = [
  {
    id: 'tech-001',
    name: 'أحمد محمد السيد',
    phone: '0501234567',
    specialty: 'كهرباء وأنظمة التبريد',
    status: 'available',
    avatar: 'أم',
    createdAt: new Date('2023-01-15').toISOString(),
  },
  {
    id: 'tech-002',
    name: 'محمود علي حسن',
    phone: '0559876543',
    specialty: 'ميكانيكا وصيانة المحركات',
    status: 'busy',
    avatar: 'مح',
    createdAt: new Date('2023-02-20').toISOString(),
  },
  {
    id: 'tech-003',
    name: 'خالد إبراهيم النجار',
    phone: '0523456789',
    specialty: 'سباكة وأنظمة المياه',
    status: 'available',
    avatar: 'خن',
    createdAt: new Date('2023-03-10').toISOString(),
  },
  {
    id: 'tech-004',
    name: 'عمر عبدالله الزهراني',
    phone: '0567891234',
    specialty: 'أجهزة إلكترونية وحاسوب',
    status: 'offline',
    avatar: 'عز',
    createdAt: new Date('2023-04-05').toISOString(),
  },
  {
    id: 'tech-005',
    name: 'يوسف سالم القحطاني',
    phone: '0512345678',
    specialty: 'تكييف وتهوية',
    status: 'available',
    avatar: 'يق',
    createdAt: new Date('2023-05-12').toISOString(),
  },
];

const SEED_EQUIPMENT = [
  {
    id: 'equip-001',
    name: 'مكيف مركزي - المبنى الرئيسي',
    model: 'Carrier 50XC',
    serialNumber: 'CAR-2021-001',
    location: 'المبنى الرئيسي - الطابق الأرضي',
    status: 'working',
    lastMaintenanceDate: new Date('2024-01-10').toISOString(),
    purchaseDate: new Date('2021-03-15').toISOString(),
  },
  {
    id: 'equip-002',
    name: 'مولد كهربائي احتياطي',
    model: 'Caterpillar DE330',
    serialNumber: 'CAT-2020-007',
    location: 'غرفة المولدات - البدروم',
    status: 'needs-maintenance',
    lastMaintenanceDate: new Date('2023-08-20').toISOString(),
    purchaseDate: new Date('2020-06-01').toISOString(),
  },
  {
    id: 'equip-003',
    name: 'مضخة مياه رئيسية',
    model: 'Grundfos CM10',
    serialNumber: 'GRU-2022-015',
    location: 'غرفة الضخ - الطابق السفلي',
    status: 'working',
    lastMaintenanceDate: new Date('2024-02-05').toISOString(),
    purchaseDate: new Date('2022-01-20').toISOString(),
  },
  {
    id: 'equip-004',
    name: 'لوحة التحكم الكهربائية الرئيسية',
    model: 'Schneider EasyPact',
    serialNumber: 'SCH-2019-003',
    location: 'غرفة الكهرباء - الطابق الأول',
    status: 'working',
    lastMaintenanceDate: new Date('2023-12-15').toISOString(),
    purchaseDate: new Date('2019-09-10').toISOString(),
  },
  {
    id: 'equip-005',
    name: 'رافعة شوكية',
    model: 'Toyota 8FGU25',
    serialNumber: 'TOY-2021-042',
    location: 'المستودع الرئيسي',
    status: 'broken',
    lastMaintenanceDate: new Date('2023-06-30').toISOString(),
    purchaseDate: new Date('2021-11-05').toISOString(),
  },
  {
    id: 'equip-006',
    name: 'ضاغط هواء صناعي',
    model: 'Atlas Copco GA30',
    serialNumber: 'ATC-2022-008',
    location: 'ورشة الإنتاج - القسم أ',
    status: 'working',
    lastMaintenanceDate: new Date('2024-01-25').toISOString(),
    purchaseDate: new Date('2022-04-18').toISOString(),
  },
  {
    id: 'equip-007',
    name: 'نظام إطفاء الحريق',
    model: 'Notifier AFP-200',
    serialNumber: 'NOT-2020-021',
    location: 'جميع الطوابق',
    status: 'needs-maintenance',
    lastMaintenanceDate: new Date('2023-07-14').toISOString(),
    purchaseDate: new Date('2020-12-01').toISOString(),
  },
  {
    id: 'equip-008',
    name: 'مصعد كهربائي',
    model: 'Otis GEN2',
    serialNumber: 'OTI-2018-001',
    location: 'المبنى الرئيسي - جميع الطوابق',
    status: 'working',
    lastMaintenanceDate: new Date('2024-02-20').toISOString(),
    purchaseDate: new Date('2018-05-22').toISOString(),
  },
];

const SEED_REQUESTS = [
  {
    id: 'req-001',
    title: 'فحص وصيانة دورية للمكيف المركزي',
    description: 'يحتاج المكيف المركزي للمبنى الرئيسي إلى فحص دوري وتنظيف الفلاتر وفحص مستوى الغاز',
    equipmentId: 'equip-001',
    technicianId: 'tech-005',
    priority: 'medium',
    status: 'in-progress',
    requestedBy: 'مدير المبنى - سعد الأحمدي',
    createdAt: new Date('2024-02-15').toISOString(),
    updatedAt: new Date('2024-02-16').toISOString(),
    completedAt: null,
  },
  {
    id: 'req-002',
    title: 'إصلاح عطل المولد الكهربائي الاحتياطي',
    description: 'المولد الكهربائي الاحتياطي لا يعمل بشكل صحيح، يصدر أصواتاً غير طبيعية ويحتاج فحصاً عاجلاً',
    equipmentId: 'equip-002',
    technicianId: 'tech-001',
    priority: 'high',
    status: 'in-progress',
    requestedBy: 'قسم الكهرباء - فهد المطيري',
    createdAt: new Date('2024-02-18').toISOString(),
    updatedAt: new Date('2024-02-19').toISOString(),
    completedAt: null,
  },
  {
    id: 'req-003',
    title: 'فحص نظام إطفاء الحريق السنوي',
    description: 'يستحق نظام إطفاء الحريق الفحص السنوي المقرر وفقاً للجدول الزمني للصيانة الوقائية',
    equipmentId: 'equip-007',
    technicianId: null,
    priority: 'high',
    status: 'pending',
    requestedBy: 'مسؤول السلامة - ناصر القرني',
    createdAt: new Date('2024-02-20').toISOString(),
    updatedAt: new Date('2024-02-20').toISOString(),
    completedAt: null,
  },
  {
    id: 'req-004',
    title: 'إصلاح الرافعة الشوكية المعطلة',
    description: 'الرافعة الشوكية في المستودع معطلة تماماً وتؤثر على عمليات نقل البضائع، تحتاج إصلاح عاجل',
    equipmentId: 'equip-005',
    technicianId: 'tech-002',
    priority: 'high',
    status: 'pending',
    requestedBy: 'مدير المستودع - علي الشمري',
    createdAt: new Date('2024-02-21').toISOString(),
    updatedAt: new Date('2024-02-21').toISOString(),
    completedAt: null,
  },
  {
    id: 'req-005',
    title: 'صيانة دورية لمضخة المياه الرئيسية',
    description: 'فحص وتزييت مضخة المياه الرئيسية وفحص التوصيلات والتسربات المحتملة',
    equipmentId: 'equip-003',
    technicianId: 'tech-003',
    priority: 'medium',
    status: 'completed',
    requestedBy: 'قسم الخدمات - عبدالرحمن الدوسري',
    createdAt: new Date('2024-01-10').toISOString(),
    updatedAt: new Date('2024-01-15').toISOString(),
    completedAt: new Date('2024-01-15').toISOString(),
  },
  {
    id: 'req-006',
    title: 'فحص لوحة التحكم الكهربائية الرئيسية',
    description: 'فحص دوري للوحة التحكم والتأكد من سلامة جميع الوصلات والقواطع الكهربائية',
    equipmentId: 'equip-004',
    technicianId: 'tech-001',
    priority: 'low',
    status: 'completed',
    requestedBy: 'المهندس الكهربائي - بندر الحربي',
    createdAt: new Date('2024-01-20').toISOString(),
    updatedAt: new Date('2024-01-22').toISOString(),
    completedAt: new Date('2024-01-22').toISOString(),
  },
  {
    id: 'req-007',
    title: 'صيانة ضاغط الهواء الصناعي',
    description: 'تغيير زيت الضاغط وفلتر الهواء وفحص صمامات الأمان',
    equipmentId: 'equip-006',
    technicianId: 'tech-002',
    priority: 'medium',
    status: 'completed',
    requestedBy: 'مدير الإنتاج - محمد العتيبي',
    createdAt: new Date('2024-01-25').toISOString(),
    updatedAt: new Date('2024-01-28').toISOString(),
    completedAt: new Date('2024-01-28').toISOString(),
  },
  {
    id: 'req-008',
    title: 'فحص دوري للمصعد الكهربائي',
    description: 'الفحص الشهري المقرر للمصعد شامل فحص الكابلات والموتور والأبواب ومستشعرات الأمان',
    equipmentId: 'equip-008',
    technicianId: null,
    priority: 'low',
    status: 'pending',
    requestedBy: 'مدير المبنى - سعد الأحمدي',
    createdAt: new Date('2024-02-22').toISOString(),
    updatedAt: new Date('2024-02-22').toISOString(),
    completedAt: null,
  },
  {
    id: 'req-009',
    title: 'إصلاح تسرب مياه في الطابق الثاني',
    description: 'يوجد تسرب مياه في السقف بالقرب من الحمامات في الطابق الثاني يحتاج إصلاح فوري',
    equipmentId: 'equip-003',
    technicianId: 'tech-003',
    priority: 'high',
    status: 'in-progress',
    requestedBy: 'المشرف الإداري - خالد السبيعي',
    createdAt: new Date('2024-02-19').toISOString(),
    updatedAt: new Date('2024-02-20').toISOString(),
    completedAt: null,
  },
  {
    id: 'req-010',
    title: 'تحديث برنامج نظام التحكم',
    description: 'تحديث برنامج نظام التحكم في لوحة الكهرباء الرئيسية لأحدث إصدار والتحقق من التوافق',
    equipmentId: 'equip-004',
    technicianId: 'tech-004',
    priority: 'low',
    status: 'cancelled',
    requestedBy: 'قسم تقنية المعلومات - رائد البقمي',
    createdAt: new Date('2024-01-30').toISOString(),
    updatedAt: new Date('2024-02-01').toISOString(),
    completedAt: null,
  },
];

// ==================== INITIAL STATE ====================

const initialState = {
  requests: [],
  technicians: [],
  equipment: [],
  loading: true,
  error: null,
};

// ==================== ACTION TYPES ====================

export const ACTION_TYPES = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  LOAD_DATA: 'LOAD_DATA',

  // Requests
  ADD_REQUEST: 'ADD_REQUEST',
  UPDATE_REQUEST: 'UPDATE_REQUEST',
  DELETE_REQUEST: 'DELETE_REQUEST',

  // Technicians
  ADD_TECHNICIAN: 'ADD_TECHNICIAN',
  UPDATE_TECHNICIAN: 'UPDATE_TECHNICIAN',
  DELETE_TECHNICIAN: 'DELETE_TECHNICIAN',

  // Equipment
  ADD_EQUIPMENT: 'ADD_EQUIPMENT',
  UPDATE_EQUIPMENT: 'UPDATE_EQUIPMENT',
  DELETE_EQUIPMENT: 'DELETE_EQUIPMENT',
};

// ==================== REDUCER ====================

function appReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return { ...state, loading: action.payload };

    case ACTION_TYPES.SET_ERROR:
      return { ...state, error: action.payload, loading: false };

    case ACTION_TYPES.LOAD_DATA:
      return {
        ...state,
        requests: action.payload.requests || [],
        technicians: action.payload.technicians || [],
        equipment: action.payload.equipment || [],
        loading: false,
      };

    // Requests
    case ACTION_TYPES.ADD_REQUEST:
      return { ...state, requests: [action.payload, ...state.requests] };

    case ACTION_TYPES.UPDATE_REQUEST:
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.payload.id ? action.payload : r
        ),
      };

    case ACTION_TYPES.DELETE_REQUEST:
      return {
        ...state,
        requests: state.requests.filter((r) => r.id !== action.payload),
      };

    // Technicians
    case ACTION_TYPES.ADD_TECHNICIAN:
      return { ...state, technicians: [action.payload, ...state.technicians] };

    case ACTION_TYPES.UPDATE_TECHNICIAN:
      return {
        ...state,
        technicians: state.technicians.map((t) =>
          t.id === action.payload.id ? action.payload : t
        ),
      };

    case ACTION_TYPES.DELETE_TECHNICIAN:
      return {
        ...state,
        technicians: state.technicians.filter((t) => t.id !== action.payload),
      };

    // Equipment
    case ACTION_TYPES.ADD_EQUIPMENT:
      return { ...state, equipment: [action.payload, ...state.equipment] };

    case ACTION_TYPES.UPDATE_EQUIPMENT:
      return {
        ...state,
        equipment: state.equipment.map((e) =>
          e.id === action.payload.id ? action.payload : e
        ),
      };

    case ACTION_TYPES.DELETE_EQUIPMENT:
      return {
        ...state,
        equipment: state.equipment.filter((e) => e.id !== action.payload),
      };

    default:
      return state;
  }
}

// ==================== CONTEXT ====================

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load data on mount
  useEffect(() => {
    initializeApp();
  }, []);

  // Auto-save when data changes
  useEffect(() => {
    if (!state.loading) {
      saveRequests(state.requests);
    }
  }, [state.requests, state.loading]);

  useEffect(() => {
    if (!state.loading) {
      saveTechnicians(state.technicians);
    }
  }, [state.technicians, state.loading]);

  useEffect(() => {
    if (!state.loading) {
      saveEquipment(state.equipment);
    }
  }, [state.equipment, state.loading]);

  const initializeApp = async () => {
    try {
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: true });

      const initialized = await isAppInitialized();

      if (!initialized) {
        // First run - load seed data
        dispatch({
          type: ACTION_TYPES.LOAD_DATA,
          payload: {
            requests: SEED_REQUESTS,
            technicians: SEED_TECHNICIANS,
            equipment: SEED_EQUIPMENT,
          },
        });
        await markAppInitialized();
      } else {
        // Load from storage
        const data = await loadAllData();
        dispatch({
          type: ACTION_TYPES.LOAD_DATA,
          payload: {
            requests: data.requests || SEED_REQUESTS,
            technicians: data.technicians || SEED_TECHNICIANS,
            equipment: data.equipment || SEED_EQUIPMENT,
          },
        });
      }
    } catch (error) {
      console.error('Error initializing app:', error);
      dispatch({
        type: ACTION_TYPES.LOAD_DATA,
        payload: {
          requests: SEED_REQUESTS,
          technicians: SEED_TECHNICIANS,
          equipment: SEED_EQUIPMENT,
        },
      });
    }
  };

  // ==================== ACTIONS ====================

  const addRequest = (requestData) => {
    const newRequest = {
      id: generateId(),
      ...requestData,
      technicianId: requestData.technicianId || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };
    dispatch({ type: ACTION_TYPES.ADD_REQUEST, payload: newRequest });
    return newRequest;
  };

  const updateRequest = (id, updates) => {
    const existing = state.requests.find((r) => r.id === id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      completedAt:
        updates.status === 'completed'
          ? new Date().toISOString()
          : existing.completedAt,
    };
    dispatch({ type: ACTION_TYPES.UPDATE_REQUEST, payload: updated });
    return updated;
  };

  const deleteRequest = (id) => {
    dispatch({ type: ACTION_TYPES.DELETE_REQUEST, payload: id });
  };

  const addTechnician = (techData) => {
    const newTech = {
      id: generateId(),
      ...techData,
      avatar: techData.name
        ? techData.name.trim().split(' ').slice(0, 2).map((w) => w[0]).join('')
        : '؟',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: ACTION_TYPES.ADD_TECHNICIAN, payload: newTech });
    return newTech;
  };

  const updateTechnician = (id, updates) => {
    const existing = state.technicians.find((t) => t.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    dispatch({ type: ACTION_TYPES.UPDATE_TECHNICIAN, payload: updated });
    return updated;
  };

  const deleteTechnician = (id) => {
    dispatch({ type: ACTION_TYPES.DELETE_TECHNICIAN, payload: id });
  };

  const addEquipment = (equipData) => {
    const newEquip = {
      id: generateId(),
      ...equipData,
      lastMaintenanceDate: equipData.lastMaintenanceDate || null,
      purchaseDate: equipData.purchaseDate || null,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: ACTION_TYPES.ADD_EQUIPMENT, payload: newEquip });
    return newEquip;
  };

  const updateEquipment = (id, updates) => {
    const existing = state.equipment.find((e) => e.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    dispatch({ type: ACTION_TYPES.UPDATE_EQUIPMENT, payload: updated });
    return updated;
  };

  const deleteEquipment = (id) => {
    dispatch({ type: ACTION_TYPES.DELETE_EQUIPMENT, payload: id });
  };

  const value = {
    state,
    dispatch,
    actions: {
      addRequest,
      updateRequest,
      deleteRequest,
      addTechnician,
      updateTechnician,
      deleteTechnician,
      addEquipment,
      updateEquipment,
      deleteEquipment,
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

export default AppContext;
