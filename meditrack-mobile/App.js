// App.js — Updated with Manual Alarm Test Screen
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { initDatabase } from "./database";

/* ---------- Utils ---------- */
import { supabase } from "./lib/supabase";

/* ---------- Screens ---------- */
import OnboardingScreen from "./screens/OnboardingScreen";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import HomeScreen from "./screens/HomeScreen";
import PrescriptionsScreen from "./screens/PrescriptionsScreen";
import MedicationReminderScreen from "./screens/medicationReminderScreen";
import AppointmentsScreen from "./screens/AppointmentsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import MedicalHistoryScreen from "./screens/MedicalHistoryScreen";
import ChangePassword from "./screens/ChangePassword";
/* ---------- Setup ---------- */
const Stack = createNativeStackNavigator();
const navRef = createNavigationContainerRef();

/* ---------- Default Notification Handler ---------- */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login");
  const receivedListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        console.log("🚀 MediTrack booting...");
        initDatabase();

        // Initial route setup
        const firstLaunch = await AsyncStorage.getItem("alreadyLaunched");
        if (firstLaunch === null) {
          await AsyncStorage.setItem("alreadyLaunched", "true");
          setInitialRoute("Onboarding");
        } else {
          const patient = await AsyncStorage.getItem("patient_id");
          setInitialRoute(patient ? "Home" : "Login");
        }

        // Request permissions
        if (Device.isDevice) {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowSound: true, allowBadge: true },
          });

          if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync("appointments", {
              name: "Appointment Reminders",
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: [0, 250, 250, 250],
              sound: "default",
              lockscreenVisibility:
                Notifications.AndroidNotificationVisibility.PUBLIC,
            });
          }
        }

        await initAppointmentNotifications(navRef);

        // Notification listeners
        receivedListener.current = Notifications.addNotificationReceivedListener(
          () => {}
        );
        responseListener.current =
          Notifications.addNotificationResponseReceivedListener((response) => {
            const screen =
              response?.notification?.request?.content?.data?.target;
            if (screen && navRef.isReady()) {
              navRef.navigate(screen);
            } else if (navRef.isReady()) {
              navRef.navigate("Appointments");
            }
          });
      } catch (err) {
        console.error("⚠️ App bootstrap error:", err);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (receivedListener.current)
        Notifications.removeNotificationSubscription(receivedListener.current);
      if (responseListener.current)
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text>Loading MediTrack...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: "Register Patient" }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            title: "MediTrack",
            headerRight: () => (
              <TouchableOpacity
                style={{ marginRight: 15 }}
                onPress={() => navigation.navigate("Settings")}
              >
                <Ionicons name="person-outline" size={24} color="#2563eb" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} />
        <Stack.Screen
          name="MedicationReminder"
          component={MedicationReminderScreen}
          options={{ title: "Medication Reminders" }}
        />
        <Stack.Screen name="Appointments" component={AppointmentsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen
          name="MedicalHistory"
          component={MedicalHistoryScreen}
          options={{ title: "Medical History" }}
        />
        <Stack.Screen
          name="ChangePassword"
          component={ChangePassword}
          options={{ title: "Change Password" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
