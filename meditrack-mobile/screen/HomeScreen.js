// screens/HomeScreen.js — Final Version (with Survey Button)
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  View,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

export default function HomeScreen({ navigation }) {
  const [showSurvey, setShowSurvey] = useState(false);

  const SURVEY_KEY = "surveyAnswered";
  const GOOGLE_FORM_LINK = "https://docs.google.com/forms/d/e/1FAIpQLSf6x8AOd2ojr6uzTfkoa1FyUlfxgVY7WJXjKCCqh97r4lgJJA/formResponse"; // 🔗 replace with your actual link

  useEffect(() => {
    (async () => {
      const answered = await AsyncStorage.getItem(SURVEY_KEY);
      if (!answered) setShowSurvey(true);
    })();
  }, []);

  const handleSurveyPress = async () => {
    try {
      await Linking.openURL(GOOGLE_FORM_LINK);
      await AsyncStorage.setItem(SURVEY_KEY, "true");
      setShowSurvey(false);
    } catch (error) {
      console.warn("Could not open survey:", error);
    }
  };

  const copy = {
    welcomeTitle: "Welcome to MediTrack",
    welcomeSub: "Your Health, On Track",
    card1: "My Prescriptions",
    card2: "Medication Reminders",
    card3: "Book Appointment",
  };

  const cards = [
    {
      icon: "medkit-outline",
      color: "#16a34a",
      label: copy.card1,
      screen: "Prescriptions",
    },
    {
      icon: "alarm-outline",
      color: "#2563eb",
      label: copy.card2,
      screen: "MedicationReminder",
    },
    {
      icon: "calendar-outline",
      color: "#7c3aed",
      label: copy.card3,
      screen: "Appointments",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{copy.welcomeTitle}</Text>
        <Text style={styles.subtitle}>{copy.welcomeSub}</Text>

        <View style={styles.grid}>
          {cards.map((card, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.card}
              onPress={() => navigation.navigate(card.screen)}
              activeOpacity={0.9}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${card.color}20` },
                ]}
              >
                <Ionicons name={card.icon} size={28} color={card.color} />
              </View>
              <Text style={styles.cardText}>{card.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ✅ Survey Button (appears only if not answered) */}
      {showSurvey && (
        <View style={styles.surveyContainer}>
          <TouchableOpacity
            style={styles.surveyButton}
            onPress={handleSurveyPress}
            activeOpacity={0.9}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            <Text style={styles.surveyText}>Answer Survey</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f9fafb" },
  container: { padding: 20, paddingTop: 40, paddingBottom: 100 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    color: "#1e40af",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    color: "#6b7280",
  },
  grid: { flexDirection: "column", gap: 16 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { fontSize: 16, fontWeight: "600", color: "#111827" },

  // 🔻 Survey Button Styles
   surveyContainer: {
    position: "absolute",
    bottom: 90, // ⬆️ raised from 30 → 60 to avoid overlap
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 10, // extra safe area buffer
  },
  surveyButton: {
    backgroundColor: "#1e40af",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 30,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  surveyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
