// screens/MedicalHistoryScreen.js
import React, { useState, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function MedicalHistoryScreen() {
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const updateField = (field, value) => {
    if (editing) {
      setForm({ ...form, [field]: value });
    }
  };

  /* --- Load existing medical history --- */
  useEffect(() => {
    const loadData = async () => {
      const patientId = await AsyncStorage.getItem("patient_id");
      if (!patientId) return;

      const { data, error } = await supabase
        .from("patient_medical_history")
        .select("*")
        .eq("patient_id", patientId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.log("Load error:", error);
        return;
      }

      if (data) {
        setForm(data);
        setRecordId(data.id);
        setLastUpdated(data.updated_at || data.created_at);
        setEditing(false);
      } else {
        setForm({});
        setEditing(true);
      }
    };
    loadData();
  }, []);

  /* --- Auto Calculate BMI & WH Ratio --- */
  useEffect(() => {
    if (editing) {
      if (form.weight && form.height) {
        const h = parseFloat(form.height) / 100;
        const bmi = parseFloat(form.weight) / (h * h);
        if (!isNaN(bmi))
          setForm((prev) => ({ ...prev, bmi: parseFloat(bmi.toFixed(2)) }));
      }
      if (form.waist && form.hip) {
        const wh = parseFloat(form.waist) / parseFloat(form.hip);
        if (!isNaN(wh))
          setForm((prev) => ({ ...prev, wh_ratio: parseFloat(wh.toFixed(2)) }));
      }
    }
  }, [form.weight, form.height, form.waist, form.hip, editing]);

  /* --- Save or Update --- */
  const handleSave = async () => {
    const patientId = await AsyncStorage.getItem("patient_id");
    if (!patientId) {
      Alert.alert("Error", "No patient logged in");
      return;
    }

    const cleanedForm = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === "" ? null : v])
    );

    let error, data;
    if (recordId) {
      ({ error, data } = await supabase
        .from("patient_medical_history")
        .update(cleanedForm)
        .eq("id", recordId)
        .select()
        .single());
    } else {
      ({ error, data } = await supabase
        .from("patient_medical_history")
        .insert([{ patient_id: patientId, ...cleanedForm }])
        .select()
        .single());
    }

    if (error) {
      console.log("Save error:", error);
      Alert.alert("Error", "Failed to save medical history");
    } else {
      setLastUpdated(data.updated_at || data.created_at);
      Alert.alert("Success", "Medical history saved!");
      setEditing(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🩺 Kasaysayan Medikal</Text>

      {lastUpdated && (
        <Text style={styles.lastUpdated}>
          Huling Update: {new Date(lastUpdated).toLocaleString()}
        </Text>
      )}

      {!editing && (
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setEditing(true)}
        >
          <Text style={styles.editText}>I-edit</Text>
        </TouchableOpacity>
      )}

      {/* === Past Medical History === */}
      <Text style={styles.section}>II. Kasaysayan ng Sakit (Nakaraan)</Text>
      <CheckboxRow label="Diabetes" field="diabetes" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Altapresyon" field="hypertension" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Kanser" field="cancer" form={form} update={updateField} editable={editing} />
      {form.cancer && (
        <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Bahagi ng Kanser" value={form.cancer_site || ""} onChangeText={(t) => updateField("cancer_site", t)} />
      )}
      <CheckboxRow label="Sakit sa Baga" field="lung_disease" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Sakit sa Mata" field="eye_disease" form={form} update={updateField} editable={editing} />

      {/* === Chest Pain === */}
      <Text style={styles.subSection}>Pananakit ng Dibdib</Text>
      <CheckboxRow label="Kapag kumikilos" field="chest_pain_exertion" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Sumasakit hanggang braso/panga" field="chest_pain_spread" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Mabilis ang tibok ng puso" field="chest_pain_fast" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Hirap sa paghinga" field="chest_pain_breathless" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Pinapawisan / Nasusuka" field="chest_pain_sweating" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Gumagaan sa pahinga/gamot" field="chest_pain_relieved" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Lampas 30 minuto" field="chest_pain_30min" form={form} update={updateField} editable={editing} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Iba pang sintomas" value={form.chest_pain_other || ""} onChangeText={(t) => updateField("chest_pain_other", t)} />

      {/* === Family History === */}
      <Text style={styles.section}>Kasaysayan ng Pamilya</Text>
      <CheckboxRow label="Sakit sa Puso" field="family_sakit_puso" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Stroke" field="family_stroke" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Diabetes" field="family_diabetes" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Kanser" field="family_cancer" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Sakit sa Baga" field="family_sakit_lungs" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Sakit sa Bato" field="family_sakit_bato" form={form} update={updateField} editable={editing} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Iba pa" value={form.family_other || ""} onChangeText={(t) => updateField("family_other", t)} />

      {/* === Nutrition === */}
      <Text style={styles.section}>Nutrisyon</Text>
      <CheckboxRow label="Kumakain ng Gulay" field="gulay" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Kumakain ng Prutas" field="prutas" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Kumakain ng Isda" field="isda" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Kumakain ng Karne" field="karne" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Kumakain ng Processed Food" field="processed" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Maalat kada linggo" field="maalat_per_week" form={form} update={updateField} editable={editing} />

      {/* === Smoking === */}
      <Text style={styles.section}>Paninigarilyo</Text>
      <CheckboxRow label="Naninigarilyo" field="naninigarilyo" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Sticks per Day" field="sticks_per_day" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Tumigil" field="tumigil" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Taon mula tumigil" field="years_quit" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Naka-100 sticks sa buhay" field="ever_100_sticks" form={form} update={updateField} editable={editing} />

      {/* === Exercise === */}
      <Text style={styles.section}>Ehersisyo</Text>
      <CheckboxRow label="Nag-eehersisyo" field="ehersisyo" form={form} update={updateField} editable={editing} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Uri ng Ehersisyo" value={form.uri_ehersisyo || ""} onChangeText={(t) => updateField("uri_ehersisyo", t)} />
      <CheckboxRow label="Sapat ba ang Ehersisyo" field="sapat_ehersisyo" form={form} update={updateField} editable={editing} />

      {/* === Stress === */}
      <Text style={styles.section}>Stress</Text>
      <CheckboxRow label="May Stress" field="stress" form={form} update={updateField} editable={editing} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Sanhi ng Stress" value={form.stress_dahilan || ""} onChangeText={(t) => updateField("stress_dahilan", t)} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Epekto ng Stress" value={form.stress_effect || ""} onChangeText={(t) => updateField("stress_effect", t)} />

      {/* === Risk Screening === */}
      <Text style={styles.section}>Pagsusuri ng Panganib</Text>
      <NumberInputRow label="Timbang (kg)" field="weight" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Taas (cm)" field="height" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Baywang (cm)" field="waist" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Balakang (cm)" field="hip" form={form} update={updateField} editable={editing} />
      <InfoRow label="BMI" value={form.bmi} />
      <InfoRow label="Waist-Hip Ratio" value={form.wh_ratio} />
      <NumberInputRow label="FBS" field="fbs" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="RBS" field="rbs" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="BP Kaliwa" field="left_bp" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="BP Kanan" field="right_bp" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Karaniwang BP" field="baseline_bp" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Kolesterol" field="cholesterol" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Protein sa Ihi" field="urine_protein" form={form} update={updateField} editable={editing} />
      <CheckboxRow label="Ketones sa Ihi" field="urine_ketones" form={form} update={updateField} editable={editing} />
      <NumberInputRow label="Porsyento ng Panganib" field="risk_profile" form={form} update={updateField} editable={editing} />

      {/* === Cancer Screening === */}
      <Text style={styles.section}>Screening ng Kanser</Text>
      <CheckboxRow label="Na-screen na ba?" field="cancer_screened" form={form} update={updateField} editable={editing} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Uri ng Screening" value={form.cancer_screen_type || ""} onChangeText={(t) => updateField("cancer_screen_type", t)} />
      <TextInput style={[styles.input, !editing && styles.readonly]} editable={editing} placeholder="Resulta ng Screening" value={form.cancer_screen_result || ""} onChangeText={(t) => updateField("cancer_screen_result", t)} />

      {editing && (
        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>💾 I-save</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

/* --- Reusable Components --- */
function CheckboxRow({ label, field, form, update, editable }) {
  const value = !!form[field];
  return (
    <TouchableOpacity
      style={styles.rowCard}
      disabled={!editable}
      onPress={() => editable && update(field, !value)}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.checkIcon, { color: value ? "#16a34a" : "#9ca3af" }]}>
        {value ? "✔️" : "⬜"}
      </Text>
    </TouchableOpacity>
  );
}

function NumberInputRow({ label, field, form, update, editable }) {
  const value = form[field] ?? "";
  return (
    <View style={styles.rowCard}>
      <Text style={styles.rowLabel}>{label}</Text>
      {editable ? (
        <TextInput
          style={styles.numberInput}
          keyboardType="numeric"
          value={value.toString()}
          onChangeText={(t) => update(field, t.replace(/[^0-9.]/g, ""))}
        />
      ) : (
        <Text style={styles.valueText}>{value || "-"}</Text>
      )}
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.rowCard}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.valueText}>{value ? value.toString() : "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f9fafb" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: "#111827" },
  lastUpdated: { fontSize: 14, color: "#6b7280", marginBottom: 12 },
  section: { fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 10, color: "#1f2937" },
  subSection: { fontSize: 16, fontWeight: "500", marginTop: 12, marginBottom: 6, color: "#374151" },
  rowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowLabel: { fontSize: 16, color: "#111827", flex: 1 },
  checkIcon: { fontSize: 20, fontWeight: "600" },
  valueText: { fontSize: 16, color: "#374151", fontWeight: "500" },
  numberInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 60,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginVertical: 6,
  },
  readonly: { backgroundColor: "#f3f4f6", color: "#6b7280" },
  button: { backgroundColor: "#16a34a", padding: 16, borderRadius: 10, marginTop: 24 },
  buttonText: { color: "#fff", fontWeight: "bold", textAlign: "center", fontSize: 16 },
  editButton: { alignSelf: "flex-end", backgroundColor: "#2563eb", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginBottom: 12 },
  editText: { color: "#fff", fontWeight: "bold" },
});