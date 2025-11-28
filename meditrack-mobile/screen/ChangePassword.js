// screens/ChangePassword.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";

const API_BASE = "https://meditrack.space/api";

export default function ChangePassword({ navigation }) {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);

  /* ---------------------------
     ✅ Helper: Clear session
  --------------------------- */
  const logoutAndRedirect = async () => {
    await AsyncStorage.multiRemove([
      "patient_id",
      "patient_name",
      "auth_token",
      "must_change_password",
    ]);
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  };

  /* ---------------------------
     ✅ Change password
  --------------------------- */
  const handleChange = async () => {
    if (!newPass || !confirmPass) {
      Alert.alert("Error", "Please enter both fields");
      return;
    }
    if (newPass !== confirmPass) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    if (newPass.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters long");
      return;
    }

    try {
      setLoading(true);
      const patientId = await AsyncStorage.getItem("patient_id");
      if (!patientId) {
        Alert.alert("Error", "Patient ID missing, please log in again.");
        setLoading(false);
        return;
      }

      const res = await axios.post(
        `${API_BASE}/patients/${patientId}/change-password`,
        { newPassword: newPass }
      );

      if (res.data?.success) {
        Alert.alert("Success", "Password changed successfully", [
          {
            text: "OK",
            onPress: async () => {
              await logoutAndRedirect();
            },
          },
        ]);
      } else {
        Alert.alert("Error", res.data?.error || "Failed to change password");
      }
    } catch (err) {
      console.error("ChangePassword error:", err);
      Alert.alert("Error", "Unable to change password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------
     ✅ Skip (keep temporary password)
  --------------------------- */
  const handleSkip = async () => {
    try {
      setLoading(true);
      const patientId = await AsyncStorage.getItem("patient_id");
      if (!patientId) {
        Alert.alert("Error", "Patient ID missing, please log in again.");
        setLoading(false);
        return;
      }

      await axios.post(`${API_BASE}/patients/${patientId}/skip-password`);
      Alert.alert("Info", "You kept your temporary password.", [
        {
          text: "OK",
          onPress: async () => {
            await logoutAndRedirect();
          },
        },
      ]);
    } catch (err) {
      console.error("SkipPassword error:", err);
      Alert.alert("Error", "Unable to continue. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------
     ✅ UI
  --------------------------- */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Image
            source={require("../assets/meditrack-icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Change Your Password</Text>
          <Text style={styles.subtitle}>
            You can set a new password now or keep your current one.
          </Text>

          {/* 🔒 New Password with Visibility Toggle */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="New Password"
              placeholderTextColor="#888"
              secureTextEntry={!showNewPass}
              value={newPass}
              onChangeText={setNewPass}
              editable={!loading}
              returnKeyType="next"
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowNewPass(!showNewPass)}
            >
              <Ionicons
                name={showNewPass ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          {/* 🔒 Confirm Password with Visibility Toggle */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Confirm Password"
              placeholderTextColor="#888"
              secureTextEntry={!showConfirmPass}
              value={confirmPass}
              onChangeText={setConfirmPass}
              editable={!loading}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowConfirmPass(!showConfirmPass)}
            >
              <Ionicons
                name={showConfirmPass ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.7 }]}
            onPress={handleChange}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Update Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.skipButton, loading && { opacity: 0.6 }]}
            onPress={handleSkip}
            disabled={loading}
          >
            <Text style={styles.skipText}>Keep Current Password</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------------------------
   ✅ Styles
--------------------------- */
const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 20,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    color: "#000",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#555",
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 15,
    borderRadius: 8,
    color: "#000",
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  passwordContainer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    marginBottom: 15,
  },
  eyeIcon: {
    paddingHorizontal: 10,
  },
  button: {
    width: "100%",
    backgroundColor: "#1e40af",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 5,
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
  },
  skipButton: {
    marginTop: 15,
    paddingVertical: 10,
  },
  skipText: {
    color: "#1e40af",
    fontSize: 14,
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
