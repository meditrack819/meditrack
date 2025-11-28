// screens/LoginScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { Ionicons } from "@expo/vector-icons";

export default function LoginScreen({ navigation }) {
  const [patientId, setPatientId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!patientId || !password) {
      Alert.alert("Error", "Please enter both Patient ID and password");
      return;
    }

    try {
      setSubmitting(true);
      const cleanId = patientId.trim();

      // 🔹 Lookup patient by ID
      const { data: patientRow, error: patientLookupError } = await supabase
        .from("patients")
        .select(
          "id, user_id, family_no, first_name, middle_name, last_name, phone, building_no, street, barangay, city, email"
        )
        .eq("id", cleanId)
        .maybeSingle();

      if (patientLookupError) {
        console.log("Patient lookup error:", patientLookupError);
        Alert.alert("Error", "Problem looking up patient");
        return;
      }

      if (!patientRow) {
        Alert.alert("Login failed", "No patient found with that ID");
        return;
      }

      const email = patientRow.email?.trim().toLowerCase();
      if (!email) {
        Alert.alert(
          "Login failed",
          "This patient does not have an email linked. Please contact the clinic."
        );
        return;
      }

      // 🔹 Authenticate with Supabase
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.log("Auth error:", authError);
        const msg =
          authError.code === "invalid_credentials"
            ? "Invalid Patient ID or password"
            : authError.message;
        Alert.alert("Login failed", msg);
        return;
      }

      // 🔹 Refresh user session to ensure full metadata is loaded
      const {
        data: { user: freshUser },
        error: getUserErr,
      } = await supabase.auth.getUser();

      if (getUserErr || !freshUser) {
        console.log("getUser error:", getUserErr);
        Alert.alert("Error", "Could not load your account");
        return;
      }

      console.log("✅ Authenticated user:", freshUser.email);
      console.log("🧩 Metadata:", freshUser.user_metadata);

      // 🔹 Format patient info
      const fullName = `${patientRow.first_name} ${
        patientRow.middle_name || ""
      } ${patientRow.last_name}`.replace(/\s+/g, " ");
      const fullAddress = `${patientRow.building_no || ""} ${
        patientRow.street || ""
      }, ${patientRow.barangay || ""}, ${patientRow.city || ""}`.replace(
        /\s+/g,
        " "
      );

      const patientData = {
        id: patientRow.id,
        user_id: patientRow.user_id || freshUser.id,
        family_no: patientRow.family_no,
        name: fullName,
        phone: patientRow.phone,
        address: fullAddress,
        email,
      };

      await AsyncStorage.multiSet([
        ["patient", JSON.stringify(patientData)],
        ["patient_id", String(patientRow.id)],
        ["patient_user_id", patientData.user_id],
      ]);

      console.log("💾 Patient saved locally:", patientData);

      // 🔹 Redirect user based on password-change requirement
      const mustChange =
        freshUser.user_metadata?.must_change_password === true;

      if (mustChange) {
        console.log("⚠️ User must change password — redirecting...");
        navigation.reset({ index: 0, routes: [{ name: "ChangePassword" }] });
      } else {
        console.log("🏠 Redirecting to Home...");
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      }
    } catch (err) {
      console.error("Login error:", err);
      Alert.alert("Error", "Unable to connect to Supabase");
    } finally {
      setSubmitting(false);
    }
  };

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

          <Text style={styles.title}>MediTrack Login</Text>

          <TextInput
            style={styles.input}
            placeholder="Patient ID (e.g., 104-25)"
            placeholderTextColor="#888"
            value={patientId}
            onChangeText={setPatientId}
            autoCapitalize="none"
            editable={!submitting}
            returnKeyType="next"
          />

          {/* 🔒 Password Input with Toggle Visibility */}
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Password"
              placeholderTextColor="#888"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, submitting && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("Register")}
            disabled={submitting}
          >
            <Text style={styles.link}>
              Don’t have an account yet? Register here
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
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
    marginBottom: 25,
    textAlign: "center",
    color: "#000",
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
  link: {
    color: "#1e40af",
    textAlign: "center",
    marginTop: 18,
    fontSize: 14,
  },
});
