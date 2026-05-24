import React from 'react';
import { View, Text, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

// Screens
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
import ReportsScreen from '../screens/Reports/ReportsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const COLORS = {
  primary: '#1565C0',
  accent: '#FF6F00',
  background: '#FFFFFF',
  inactive: '#9E9E9E',
  text: '#212121',
};

const screenOptions = (title) => ({
  headerStyle: {
    backgroundColor: COLORS.primary,
    elevation: 4,
    shadowOpacity: 0.3,
  },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: {
    fontWeight: '700',
    fontSize: 17,
  },
  headerTitle: title,
  headerBackTitle: 'رجوع',
  cardStyle: { backgroundColor: '#F5F7FA' },
});

// ==================== STACK NAVIGATORS ====================

function RequestsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="RequestsList"
        component={RequestsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RequestDetail"
        component={RequestDetailScreen}
        options={screenOptions('تفاصيل الطلب')}
      />
      <Stack.Screen
        name="NewRequest"
        component={NewRequestScreen}
        options={screenOptions('طلب صيانة جديد')}
      />
    </Stack.Navigator>
  );
}

function TechniciansStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="TechniciansList"
        component={TechniciansListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TechnicianDetail"
        component={TechnicianDetailScreen}
        options={screenOptions('بيانات الفني')}
      />
      <Stack.Screen
        name="NewTechnician"
        component={NewTechnicianScreen}
        options={screenOptions('إضافة فني جديد')}
      />
    </Stack.Navigator>
  );
}

function EquipmentStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="EquipmentList"
        component={EquipmentListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EquipmentDetail"
        component={EquipmentDetailScreen}
        options={screenOptions('تفاصيل المعدة')}
      />
      <Stack.Screen
        name="NewEquipment"
        component={NewEquipmentScreen}
        options={screenOptions('إضافة معدة جديدة')}
      />
    </Stack.Navigator>
  );
}

// ==================== TAB NAVIGATOR ====================

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'DashboardTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'RequestsTab') {
            iconName = focused ? 'clipboard' : 'clipboard-outline';
          } else if (route.name === 'TechniciansTab') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'EquipmentTab') {
            iconName = focused ? 'cog' : 'cog-outline';
          } else if (route.name === 'ReportsTab') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          }
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ tabBarLabel: 'الرئيسية' }}
      />
      <Tab.Screen
        name="RequestsTab"
        component={RequestsStack}
        options={{ tabBarLabel: 'الطلبات' }}
      />
      <Tab.Screen
        name="TechniciansTab"
        component={TechniciansStack}
        options={{ tabBarLabel: 'الفنيون' }}
      />
      <Tab.Screen
        name="EquipmentTab"
        component={EquipmentStack}
        options={{ tabBarLabel: 'المعدات' }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{ tabBarLabel: 'التقارير' }}
      />
    </Tab.Navigator>
  );
}

// ==================== MAIN NAVIGATOR ====================

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
};

export default AppNavigator;
