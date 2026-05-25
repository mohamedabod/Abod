import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/Auth/LoginScreen';
import ServerConfigScreen from '../screens/Auth/ServerConfigScreen';
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import RequestsListScreen from '../screens/Requests/RequestsListScreen';
import RequestDetailScreen from '../screens/Requests/RequestDetailScreen';
import NewRequestScreen from '../screens/Requests/NewRequestScreen';
import TechniciansListScreen from '../screens/Technicians/TechniciansListScreen';
import TechnicianDetailScreen from '../screens/Technicians/TechnicianDetailScreen';
import NewTechnicianScreen from '../screens/Technicians/NewTechnicianScreen';
import EquipmentListScreen from '../screens/Equipment/EquipmentListScreen';
import EquipmentDetailScreen from '../screens/Equipment/EquipmentDetailScreen';
import NewEquipmentScreen from '../screens/Equipment/NewEquipmentScreen';
import PMScreen from '../screens/PM/PMScreen';
import PredictiveScreen from '../screens/PM/Predictive/PredictiveScreen';
import InventoryScreen from '../screens/Inventory/InventoryScreen';
import ReportsScreen from '../screens/Reports/ReportsScreen';
import FailureAnalysisScreen from '../screens/Reports/FailureAnalysisScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import QRScannerScreen from '../screens/QR/QRScannerScreen';
import QuickReportScreen from '../screens/QR/QuickReportScreen';
import QRCodeScreen from '../screens/QR/QRCodeScreen';
import ChecklistScreen from '../screens/Checklist/ChecklistScreen';
import ApprovalScreen from '../screens/Checklist/ApprovalScreen';
import WrenchTimeScreen from '../screens/Analytics/WrenchTimeScreen';
import LocationTrackingScreen from '../screens/Location/LocationTrackingScreen';
import AIAssistantScreen from '../screens/AI/AIAssistantScreen';
import ChatListScreen from '../screens/Chat/ChatListScreen';
import ChatRoomScreen from '../screens/Chat/ChatRoomScreen';
import NewChatScreen from '../screens/Chat/NewChatScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const PRIMARY = '#1565C0';
const HEADER = { headerStyle: { backgroundColor: PRIMARY }, headerTintColor: '#fff', headerTitleAlign: 'center' };

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PM" component={PMScreen} options={{ title: 'الصيانة الوقائية' }} />
      <Stack.Screen name="Predictive" component={PredictiveScreen} options={{ title: 'التنبؤ بالأعطال' }} />
      <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: 'المخزون' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'الملف الشخصي' }} />
      <Stack.Screen name="QRScanner" component={QRScannerScreen} options={{ title: 'مسح QR', headerShown: false }} />
      <Stack.Screen name="QuickReport" component={QuickReportScreen} options={{ title: 'بلاغ عطل' }} />
      <Stack.Screen name="WrenchTime" component={WrenchTimeScreen} options={{ title: 'تحليل وقت الفنيين' }} />
      <Stack.Screen name="AIAssistant" component={AIAssistantScreen} options={{ title: '🤖 مساعد التشخيص' }} />
    </Stack.Navigator>
  );
}

function RequestsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="RequestsList" component={RequestsListScreen} options={{ title: 'طلبات الصيانة' }} />
      <Stack.Screen name="RequestDetail" component={RequestDetailScreen} options={{ title: 'تفاصيل الطلب' }} />
      <Stack.Screen name="NewRequest" component={NewRequestScreen} options={{ title: 'طلب جديد' }} />
      <Stack.Screen name="Checklist" component={ChecklistScreen} options={{ title: 'قائمة التحقق' }} />
      <Stack.Screen name="Approval" component={ApprovalScreen} options={{ title: 'اعتماد أوامر الشغل' }} />
    </Stack.Navigator>
  );
}

function TechniciansStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="TechniciansList" component={TechniciansListScreen} options={{ title: 'الفنيون والموظفون' }} />
      <Stack.Screen name="TechnicianDetail" component={TechnicianDetailScreen} options={{ title: 'بيانات الموظف' }} />
      <Stack.Screen name="NewTechnician" component={NewTechnicianScreen} options={{ title: 'موظف جديد' }} />
      <Stack.Screen name="LocationTracking" component={LocationTrackingScreen} options={{ title: 'تتبع الفنيين' }} />
    </Stack.Navigator>
  );
}

function EquipmentStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="EquipmentList" component={EquipmentListScreen} options={{ title: 'الأصول والمعدات' }} />
      <Stack.Screen name="EquipmentDetail" component={EquipmentDetailScreen} options={{ title: 'تفاصيل المعدة' }} />
      <Stack.Screen name="NewEquipment" component={NewEquipmentScreen} options={{ title: 'معدة جديدة' }} />
      <Stack.Screen name="QRCode" component={QRCodeScreen} options={{ title: 'QR المعدة' }} />
      <Stack.Screen name="AIAssistant" component={AIAssistantScreen} options={{ title: '🤖 مساعد التشخيص' }} />
    </Stack.Navigator>
  );
}

function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="ReportsList" component={ReportsScreen} options={{ title: 'التقارير والإحصائيات' }} />
      <Stack.Screen name="FailureAnalysis" component={FailureAnalysisScreen} options={{ title: 'تحليل الأعطال المتكررة' }} />
      <Stack.Screen name="WrenchTime" component={WrenchTimeScreen} options={{ title: 'تحليل وقت الفنيين' }} />
    </Stack.Navigator>
  );
}

function ChatStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: 'المحادثات' }} />
      <Stack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ title: 'محادثة' }} />
      <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: 'محادثة جديدة' }} />
    </Stack.Navigator>
  );
}

function MainTabs({ navigation }) {
  const notifListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.wo_id) navigation.navigate('Requests', { screen: 'RequestDetail', params: { id: data.wo_id } });
    });
    return () => {
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingBottom: 4, height: 60 },
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'home' : 'home-outline',
            Requests: focused ? 'clipboard' : 'clipboard-outline',
            Technicians: focused ? 'people' : 'people-outline',
            Equipment: focused ? 'construct' : 'construct-outline',
            Reports: focused ? 'bar-chart' : 'bar-chart-outline',
            Chat: focused ? 'chatbubbles' : 'chatbubbles-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ title: 'الرئيسية' }} />
      <Tab.Screen name="Requests" component={RequestsStack} options={{ title: 'الطلبات' }} />
      <Tab.Screen name="Technicians" component={TechniciansStack} options={{ title: 'الفنيون' }} />
      <Tab.Screen name="Equipment" component={EquipmentStack} options={{ title: 'المعدات' }} />
      <Tab.Screen name="Reports" component={ReportsStack} options={{ title: 'التقارير' }} />
      <Tab.Screen name="Chat" component={ChatStack} options={{ title: 'الشات' }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ServerConfig" component={ServerConfigScreen}
        options={{ headerShown: true, title: 'إعداد السيرفر', ...HEADER }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PRIMARY }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
