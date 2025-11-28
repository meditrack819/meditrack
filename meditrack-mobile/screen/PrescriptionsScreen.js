// screens/PrescriptionsScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  RefreshControl,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import moment from "moment";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  process.env.REACT_NATIVE_API_BASE ||
  "https://meditrack.space/api";

export default function PrescriptionsScreen() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const patientUserId = await AsyncStorage.getItem("patient_user_id");
      if (!patientUserId) {
        console.warn("Missing patient_user_id");
        setLoading(false);
        return;
      }

      const { data: rxData, error } = await supabase
        .from("prescriptions")
        .select("*")
        .eq("patient_id", patientUserId)
        .order("created_at", { ascending: false });

      if (error) console.error("Fetch error:", error.message);
      else setPrescriptions(rxData || []);
    } catch (err) {
      console.error("Error loading prescriptions:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>📋 My Prescriptions</Text>

      {prescriptions.length > 0 ? (
        <FlatList
          data={prescriptions}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => <PrescriptionImageCard rx={item} />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      ) : (
        <Text style={styles.empty}>No prescriptions found</Text>
      )}
    </View>
  );
}

/* -------------------------------------------------------
   📸 Simple Card: Date + Image only
------------------------------------------------------- */
function PrescriptionImageCard({ rx }) {
  const [thumb, setThumb] = useState(null);
  const [loadingImg, setLoadingImg] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingImg(true);
      try {
        const res = await fetch(
          `${API_BASE}/prescriptions/${encodeURIComponent(rx.id)}/signed-url`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancel) setThumb(data?.url || null);
        }
      } catch {
        // ignore
      } finally {
        if (!cancel) setLoadingImg(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [rx.id]);

  const openImage = async () => {
    if (thumb) {
      try {
        await Linking.openURL(thumb);
      } catch (e) {
        console.warn("Failed to open image", e);
      }
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.dateText}>
        🗓️ {moment(rx.created_at).format("MMMM D, YYYY")}
      </Text>

      {loadingImg ? (
        <View style={styles.imageWrapper}>
          <ActivityIndicator size="small" color="#1e40af" />
        </View>
      ) : thumb ? (
        <TouchableOpacity onPress={openImage}>
          <Image source={{ uri: thumb }} style={styles.image} />
        </TouchableOpacity>
      ) : (
        <View style={[styles.image, styles.noImage]}>
          <Text style={styles.noImageText}>No image available</Text>
        </View>
      )}
    </View>
  );
}

/* -------------------------------------------------------
   🎨 Styles
------------------------------------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 20 },
  header: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#1e40af",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  dateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1e3a8a",
    marginBottom: 10,
  },
  imageWrapper: { justifyContent: "center", alignItems: "center", height: 220 },
  image: {
    width: 250,
    height: 250,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    resizeMode: "cover",
  },
  noImage: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#eef",
  },
  noImageText: { fontSize: 12, color: "#666" },
  empty: { textAlign: "center", marginTop: 50, color: "#999" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
