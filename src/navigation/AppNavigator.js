import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

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
import InventoryScreen from '../screens/Inventory/InventoryScreen';
import ReportsScreen from '../screens/Reports/ReportsScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const PRIMARY = '#1565C0';
const HEADER = { headerStyle: { backgroundColor: PRIMARY }, headerTintColor: '#fff', headerTitleAlign: 'center' };

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PM" component={PMScreen} options={{ title: 'الصيانة الوقائية' }} />
      <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: 'المخزون' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'الملف الشخصي' }} />
    </Stack.Navigator>
  );
}

function RequestsStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="RequestsList" component={RequestsListScreen} options={{ title: 'طلبات الصيانة' }} />
      <Stack.Screen name="RequestDetail" component={RequestDetailScreen} options={{ title: 'تفاصيل الطلب' }} />
      <Stack.Screen name="NewRequest" component={NewRequestScreen} options={{ title: 'طلب جديد' }} />
    </Stack.Navigator>
  );
}

function TechniciansStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="TechniciansList" component={TechniciansListScreen} options={{ title: 'الفنيون والموظفون' }} />
      <Stack.Screen name="TechnicianDetail" component={TechnicianDetailScreen} options={{ title: 'بيانات الموظف' }} />
      <Stack.Screen name="NewTechnician" component={NewTechnicianScreen} options={{ title: 'موظف جديد' }} />
    </Stack.Navigator>
  );
}

function EquipmentStack() {
  return (
    <Stack.Navigator screenOptions={HEADER}>
      <Stack.Screen name="EquipmentList" component={EquipmentListScreen} options={{ title: 'الأصول والمعدات' }} />
      <Stack.Screen name="EquipmentDetail" component={EquipmentDetailScreen} options={{ title: 'تفاصيل المعدة' }} />
      <Stack.Screen name="NewEquipment" component={NewEquipmentScreen} options={{ title: 'معدة جديدة' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingBottom: 4, height: 60 },
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'home' : 'home-outline',
            Requests: focused ? 'clipboard' : 'clipboard-outline',
            Technicians: focused ? 'people' : 'people-outline',
            Equipment: focused ? 'construct' : 'construct-outline',
            Reports: focused ? 'bar-chart' : 'bar-chart-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ title: 'الرئيسية' }} />
      <Tab.Screen name="Requests" component={RequestsStack} options={{ title: 'الطلبات' }} />
      <Tab.Screen name="Technicians" component={TechniciansStack} options={{ title: 'الفنيون' }} />
      <Tab.Screen name="Equipment" component={EquipmentStack} options={{ title: 'المعدات' }} />
      <Tab.Screen name="Reports" component={ReportsScreen}
        options={{ title: 'التقارير', headerShown: true, ...HEADER, headerTitle: 'التقارير والإحصائيات' }} />
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

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PRIMARY }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
