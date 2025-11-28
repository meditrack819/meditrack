// screens/SettingsScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SettingsScreen({ navigation }) {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPatient = async () => {
      try {
        const data = await AsyncStorage.getItem("patient");
        if (data) {
          setPatient(JSON.parse(data));
        }
      } catch (err) {
        console.error("Error loading patient from storage:", err);
      } finally {
        setLoading(false);
      }
    };
    loadPatient();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.clear();
    navigation.replace("Login");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Patient Info</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" />
          ) : patient ? (
            <View style={styles.infoBox}>
              <Text style={styles.label}>
                Family No: <Text style={styles.value}>{patient.family_no}</Text>
              </Text>
              <Text style={styles.label}>
                Patient ID: <Text style={styles.value}>{patient.id}</Text>
              </Text>
              <Text style={styles.label}>
                Full Name: <Text style={styles.value}>{patient.name}</Text>
              </Text>
              <Text style={styles.label}>
                Phone: <Text style={styles.value}>{patient.phone}</Text>
              </Text>
              <Text style={styles.label}>
                Address: <Text style={styles.value}>{patient.address}</Text>
              </Text>
            </View>
          ) : (
            <Text style={styles.noData}>No patient info available</Text>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("MedicalHistory")}
          >
            <Text style={styles.buttonText}>Medical History</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Logout button fixed at bottom */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f9fafb" },
  container: { flex: 1, padding: 16 },
  scrollContent: { paddingBottom: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  infoBox: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    elevation: 2,
  },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 6 },
  value: { fontWeight: "400" },
  noData: {
    fontSize: 16,
    color: "#6b7280",
    fontStyle: "italic",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontWeight: "bold", textAlign: "center" },
  logoutButton: {
    backgroundColor: "#ef4444",
    padding: 14,
    borderRadius: 8,
    marginTop: "auto",
  },
  logoutText: { color: "#fff", fontWeight: "bold", textAlign: "center" },
});
