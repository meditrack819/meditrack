// screens/RegisterScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as Clipboard from "expo-clipboard";
import axios from "axios";

const API_BASE = "https://meditrack.space/api";
const API = `${API_BASE}/patients`;

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    mode: "new-auto",
    family_no: "",
    id: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    email: "",
    phone: "",
    birthdate: "",
    sex: "",
    building_no: "",
    street: "",
    barangay: "",
    city: "",
    religion: "",
    civil_status: "",
    work: "",
  });

  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [creds, setCreds] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleChange = (key, value) => setForm({ ...form, [key]: value });

  const validate = () => {
    if (form.mode === "existing") {
      if (!form.family_no) return "Family No required";
      if (!form.id) return "ID required";
    }
    if (form.mode === "new-known" && !form.family_no) {
      return "Family No required";
    }

    const required = [
      "first_name",
      "last_name",
      "phone",
      "birthdate",
      "sex",
      "building_no",
      "street",
      "barangay",
      "city",
      "religion",
      "civil_status",
      "work",
    ];
    for (let k of required) {
      if (!form[k] || String(form[k]).trim() === "") {
        return `Please enter ${k.replace("_", " ")}.`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) return Alert.alert("Missing info", err);

    const payload = {
      family_no:
        form.mode === "existing" || form.mode === "new-known"
          ? form.family_no
          : null,
      id: form.mode === "existing" ? form.id : null,
      first_name: form.first_name,
      middle_name: form.middle_name || null,
      last_name: form.last_name,
      suffix: form.suffix || null,
      email: form.email || null,
      phone: form.phone,
      birthdate: form.birthdate,
      sex: form.sex,
      building_no: form.building_no,
      street: form.street,
      barangay: form.barangay,
      city: form.city,
      religion: form.religion,
      civil_status: form.civil_status,
      work: form.work,
    };

    try {
      const { data } = await axios.post(API, payload);
      setCreds(data);
      setModalVisible(true);
    } catch (e) {
      console.error("Register error:", e.response?.data || e.message);
      Alert.alert("Error", e.response?.data?.error || e.message);
    }
  };

  const copyToClipboard = () => {
    if (creds) {
      Clipboard.setStringAsync(
        `ID: ${creds.id}\nFamily No: ${creds.family_no}\nPassword: ${creds.password}`
      );
      Alert.alert("Copied", "Credentials copied to clipboard!");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.header}>Patient Registration</Text>

          {/* Registration Type */}
          <Text style={styles.label}>Registration Type</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={form.mode}
              onValueChange={(v) => handleChange("mode", v)}
            >
              <Picker.Item
                label="Pasyente ng Highway Hills Medical Center (May Family No. at ID No.)"
                value="existing"
              />
              <Picker.Item
                label="Bagong Pasyente (May Family No.)"
                value="new-known"
              />
              <Picker.Item
                label="Bagong Pasyente (Walang Family No. at ID No.)"
                value="new-auto"
              />
            </Picker>
          </View>

          {/* Conditional Fields */}
          {form.mode === "existing" && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Family No *"
                placeholderTextColor="#888"
                value={form.family_no}
                onChangeText={(t) => handleChange("family_no", t)}
              />
              <TextInput
                style={styles.input}
                placeholder="ID *"
                placeholderTextColor="#888"
                value={form.id}
                onChangeText={(t) => handleChange("id", t)}
              />
            </>
          )}
          {form.mode === "new-known" && (
            <TextInput
              style={styles.input}
              placeholder="Family No *"
              placeholderTextColor="#888"
              value={form.family_no}
              onChangeText={(t) => handleChange("family_no", t)}
            />
          )}

          {/* Common Fields */}
          <TextInput
            style={styles.input}
            placeholder="First Name *"
            placeholderTextColor="#888"
            value={form.first_name}
            onChangeText={(t) => handleChange("first_name", t)}
          />
          <TextInput
            style={styles.input}
            placeholder="Middle Name"
            placeholderTextColor="#888"
            value={form.middle_name}
            onChangeText={(t) => handleChange("middle_name", t)}
          />
          <TextInput
            style={styles.input}
            placeholder="Last Name *"
            placeholderTextColor="#888"
            value={form.last_name}
            onChangeText={(t) => handleChange("last_name", t)}
          />
          <TextInput
            style={styles.input}
            placeholder="Suffix (e.g., Jr., Sr., III)"
            placeholderTextColor="#888"
            value={form.suffix}
            onChangeText={(t) => handleChange("suffix", t)}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone *"
            placeholderTextColor="#888"
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={(t) => handleChange("phone", t)}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#888"
            keyboardType="email-address"
            value={form.email}
            onChangeText={(t) => handleChange("email", t)}
          />

          {/* Birthdate */}
<TouchableOpacity
  style={styles.input}
  onPress={() => setShowBirthPicker(true)}
>
  <Text style={{ color: form.birthdate ? "#000" : "#888" }}>
    {form.birthdate || "Birthday *"}
  </Text>
</TouchableOpacity>

{showBirthPicker && (
  <DateTimePicker
    mode="date"
    display="spinner"
    value={form.birthdate ? new Date(form.birthdate) : new Date()}
    maximumDate={new Date()} // 🚫 no future dates
    minimumDate={
      new Date(
        new Date().setFullYear(new Date().getFullYear() - 110)
      )
    } // 🚫 older than 110 years not allowed
    onChange={(event, selectedDate) => {
      setShowBirthPicker(false);
      if (selectedDate) {
        const iso = selectedDate.toISOString().split("T")[0];
        handleChange("birthdate", iso);
      }
    }}
  />
)}

          {/* Sex Picker */}
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={form.sex}
              onValueChange={(value) => handleChange("sex", value)}
              style={[
                styles.picker,
                !form.sex && { color: "#888" },
              ]}
            >
              <Picker.Item label="Select Sex *" value="" color="#888" />
              <Picker.Item label="Male" value="Male" />
              <Picker.Item label="Female" value="Female" />
              <Picker.Item label="Other" value="Other" />
            </Picker>
          </View>

          {/* Religion */}
          <TextInput
            style={styles.input}
            placeholder="Religion *"
            placeholderTextColor="#888"
            value={form.religion}
            onChangeText={(t) => handleChange("religion", t)}
          />

          {/* Civil Status Picker */}
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={form.civil_status}
              onValueChange={(value) => handleChange("civil_status", value)}
              style={[
                styles.picker,
                !form.civil_status && { color: "#888" },
              ]}
            >
              <Picker.Item label="Select Civil Status *" value="" color="#888" />
              <Picker.Item label="Single" value="Single" />
              <Picker.Item label="Married" value="Married" />
              <Picker.Item label="Widowed" value="Widowed" />
              <Picker.Item label="Separated" value="Separated" />
            </Picker>
          </View>

          {/* Work */}
          <TextInput
            style={styles.input}
            placeholder="Work *"
            placeholderTextColor="#888"
            value={form.work}
            onChangeText={(t) => handleChange("work", t)}
          />

          {/* Address */}
          <TextInput
            style={styles.input}
            placeholder="Bldg/House No *"
            placeholderTextColor="#888"
            value={form.building_no}
            onChangeText={(t) => handleChange("building_no", t)}
          />
          <TextInput
            style={styles.input}
            placeholder="Street/Blk *"
            placeholderTextColor="#888"
            value={form.street}
            onChangeText={(t) => handleChange("street", t)}
          />

          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={form.barangay}
              onValueChange={(value) => handleChange("barangay", value)}
              style={[
                styles.picker,
                !form.barangay && { color: "#888" },
              ]}
            >
              <Picker.Item label="Select Barangay *" value="" color="#888" />
              <Picker.Item label="Addition Hills" value="Addition Hills" />
              <Picker.Item label="Bagong Silang" value="Bagong Silang" />
              <Picker.Item label="Barangka Drive" value="Barangka Drive" />
              <Picker.Item label="Barangka Ibaba" value="Barangka Ibaba" />
              <Picker.Item label="Barangka Ilaya" value="Barangka Ilaya" />
              <Picker.Item label="Barangka Itaas" value="Barangka Itaas" />
              <Picker.Item label="Buayang Bato" value="Buayang Bato" />
              <Picker.Item label="Daang Bakal" value="Daang Bakal" />
              <Picker.Item label="Hagdan Bato Itaas" value="Hagdan Bato Itaas" />
              <Picker.Item label="Hagdan Bato Libis" value="Hagdan Bato Libis" />
              <Picker.Item label="Harapin ang Bukas" value="Harapin ang Bukas" />
              <Picker.Item label="Highway Hills" value="Highway Hills" />
              <Picker.Item label="Hulo" value="Hulo" />
              <Picker.Item label="Mabini-J. Rizal" value="Mabini-J. Rizal" />
              <Picker.Item label="Malamig" value="Malamig" />
              <Picker.Item label="Mauway" value="Mauway" />
              <Picker.Item label="Namayan" value="Namayan" />
              <Picker.Item label="New Zaniga" value="New Zaniga" />
              <Picker.Item label="Old Zaniga" value="Old Zaniga" />
              <Picker.Item label="Pag-asa" value="Pag-asa" />
              <Picker.Item label="Plainview" value="Plainview" />
              <Picker.Item label="Pleasant Hills" value="Pleasant Hills" />
              <Picker.Item label="Poblacion" value="Poblacion" />
              <Picker.Item label="San Jose" value="San Jose" />
              <Picker.Item label="Vergara" value="Vergara" />
              <Picker.Item label="Wack-Wack Greenhills" value="Wack-Wack Greenhills" />
            </Picker>
          </View>

          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={form.city}
              onValueChange={(value) => handleChange("city", value)}
              style={[
                styles.picker,
                !form.city && { color: "#888" },
              ]}
            >
              <Picker.Item label="Select City *" value="" color="#888" />
              <Picker.Item label="Mandaluyong" value="Mandaluyong" />
            </Picker>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Register</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}>Already have an account? Login</Text>
          </TouchableOpacity>

          {/* Modal */}
          <Modal visible={modalVisible} animationType="slide" transparent>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>🎉 Account Created</Text>
                {creds && (
                  <>
                    <Text>ID: {creds.id}</Text>
                    <Text>Family No: {creds.family_no}</Text>
                    <Text>Password: {creds.password}</Text>
                    <Text>
                      Hintayin ang SMS galing sa MediTrack para sa ID at Password.
                    </Text>
                  </>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalBtn}
                    onPress={copyToClipboard}
                  >
                    <Text style={{ color: "#fff" }}>📋 Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: "#6b7280" }]}
                    onPress={() => {
                      setModalVisible(false);
                      navigation.navigate("Login");
                    }}
                  >
                    <Text style={{ color: "#fff" }}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 5 },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
    marginBottom: 15,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 15,
    color: "#000",
    height: 48,
  },
  picker: {
    height: 50,
    color: "#000",
    fontSize: 15,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  link: { color: "#2563eb", textAlign: "center", marginTop: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  modalActions: {
    flexDirection: "row",
    marginTop: 15,
    justifyContent: "space-between",
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
});
