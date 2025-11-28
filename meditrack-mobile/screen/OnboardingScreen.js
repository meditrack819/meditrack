// screens/OnboardingScreen.js
import React from "react";
import Onboarding from "react-native-onboarding-swiper";
import { Image, TouchableOpacity, Text, View, SafeAreaView, StyleSheet, Dimensions } from "react-native";

const { height } = Dimensions.get("window");

export default function OnboardingScreen({ navigation }) {
  const Skip = ({ ...props }) => (
    <TouchableOpacity style={styles.skipBtn} {...props}>
      <Text style={styles.skipText}>Skip</Text>
    </TouchableOpacity>
  );

  const Next = ({ ...props }) => (
    <TouchableOpacity style={styles.nextBtn} {...props}>
      <Text style={styles.nextText}>Next</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Onboarding
        onSkip={() => navigation.replace("Login")}
        onDone={() => navigation.replace("Login")}
        SkipButtonComponent={Skip}
        NextButtonComponent={Next}
        bottomBarHighlight={false}
        bottomBarHeight={100}
        titleStyles={styles.title}
        subTitleStyles={styles.subtitle}
        containerStyles={styles.container}
        imageContainerStyles={styles.imageContainer}
        pages={[
          {
            backgroundColor: "#ffffff",
            image: <Image source={require("../assets/meditrack-logo.png")} style={styles.logo} />,
            title: "Welcome to MediTrack",
            subtitle:
              "Your personal health companion for appointments, reminders, and progress tracking.",
          },
          {
            backgroundColor: "#f5f5f5",
            image: <Image source={require("../assets/meditrack-logo.png")} style={styles.logo} />,
            title: "Book Appointments Easily",
            subtitle:
              "Schedule medical, dental, or therapy appointments directly from your phone.",
          },
          {
            backgroundColor: "#eaf7ef",
            image: <Image source={require("../assets/meditrack-logo.png")} style={styles.logo} />,
            title: "Stay on Track",
            subtitle:
              "Get reminders for your medicine and upcoming visits — never miss an important date.",
          },
          {
            backgroundColor: "#ffffff",
            image: <Image source={require("../assets/meditrack-logo.png")} style={styles.logo} />,
            title: "Monitor Your Progress",
            subtitle:
              "View your health improvements over time and stay informed anywhere, anytime.",
          },
        ]}
      />

      {/* ✅ Single centered “Get Started” button */}
      <View style={styles.doneWrapper}>
        <TouchableOpacity
          style={styles.getStartedBtn}
          onPress={() => navigation.replace("Login")}
        >
          <Text style={styles.getStartedText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    justifyContent: "flex-start",
    alignItems: "center",
    marginTop: 60,
    marginBottom: 20,
  },
  logo: {
    width: 160,
    height: 160,
    resizeMode: "contain",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e3a8a",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#374151",
    textAlign: "center",
    marginHorizontal: 20,
    marginBottom: 20,
  },

  /* ---------- Skip / Next ---------- */
  skipBtn: {
    paddingHorizontal: 24,
  },
  skipText: {
    color: "#6b7280",
    fontSize: 15,
  },
  nextBtn: {
    paddingHorizontal: 24,
  },
  nextText: {
    color: "#2563eb",
    fontWeight: "700",
    fontSize: 15,
  },

  /* ---------- Centered Get Started ---------- */
  doneWrapper: {
    position: "absolute",
    bottom: height * 0.12, // perfectly in red area
    left: 0,
    right: 0,
    alignItems: "center",
  },
  getStartedBtn: {
    backgroundColor: "#1e40af",
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  getStartedText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
