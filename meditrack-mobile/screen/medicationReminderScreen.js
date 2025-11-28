// screens/MedicationReminderScreen.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../lib/supabase";

/* =============================================================
   🔔 Notification Handler
   ============================================================= */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_KEYS = {
  PRESCRIPTIONS: "cached_prescriptions",
  ALARMS: "scheduled_alarms",
};

/* =============================================================
   🧮 Generate Alarm Schedule
   ============================================================= */
function generateAlarms(prescription) {
  const { medication_name, start_date, first_intake_time, duration_days, times_per_day } =
    prescription;
  if (!first_intake_time || !duration_days || !times_per_day || !start_date) return [];

  const base = new Date(`${start_date}T${first_intake_time}`);
  const alarms = [];
  const intervalHrs = 24 / times_per_day;

  for (let d = 0; d < duration_days; d++) {
    for (let t = 0; t < times_per_day; t++) {
      const offsetMs = (d * 24 + t * intervalHrs) * 60 * 60 * 1000;
      alarms.push({
        med: medication_name,
        datetime: new Date(base.getTime() + offsetMs),
        done: false,
        adjusted: false,
        notifId: null,
        followUpId: null,
        missedId: null,
      });
    }
  }
  return alarms;
}

/* =============================================================
   ⏰ Permission Utility
   ============================================================= */
   async function ensurePermissions() {
    if (!Device.isDevice) return false;
    const { status } = await Notifications.getPermissionsAsync();
    let final = status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      final = req.status;
    }
    if (final !== "granted") {
      Alert.alert("Permission required", "Enable notifications to get reminders.");
      return false;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      });
    }
    return true;
  }
  
/* =============================================================
   🔔 Notification Scheduling Functions
   ============================================================= */
   async function scheduleMainNotification(alarm) {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "💊 Medication Reminder",
        body: `Time to take ${alarm.med}`,
        sound: "default",
      },
      trigger: { type: "date", date: alarm.datetime },
    });
  }
  
// 30-minute follow-up reminder
async function scheduleFollowUpNotification(alarm) {
  const followUpDate = new Date(alarm.datetime.getTime() + 30 * 60000);
  return await Notifications.scheduleNotificationAsync({
    content: {
      title: "⏰ Follow-up Reminder",
      body: `You haven’t marked ${alarm.med} as taken yet.`,
      sound: "default",
    },
    trigger: { type: "date", date: followUpDate },
  });
}

// 60-minute missed dose reminder (30 mins after follow-up)
async function scheduleMissedNotification(alarm) {
  const missedDate = new Date(alarm.datetime.getTime() + 60 * 60000);
  const formattedTime = alarm.datetime.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
  return await Notifications.scheduleNotificationAsync({
    content: {
      title: "⚠️ Missed Dose Alert",
      body: `You missed your scheduled ${alarm.med} dose at ${formattedTime}.`,
      sound: "default",
    },
    trigger: { type: "date", date: missedDate },
  });
}

// Cancel follow-up and missed notifications when done or adjusted
async function cancelFollowUpAndMissed(alarm) {
  try {
    if (alarm?.followUpId) {
      await Notifications.cancelScheduledNotificationAsync(alarm.followUpId);
      alarm.followUpId = null;
    }
    if (alarm?.missedId) {
      await Notifications.cancelScheduledNotificationAsync(alarm.missedId);
      alarm.missedId = null;
    }
  } catch (err) {
    console.warn("Cancel follow-up/missed error:", err);
  }
}

// Schedule all notifications per prescription
async function scheduleNotificationsForPrescription(prescription, alarms) {
  const ok = await ensurePermissions();
  if (!ok) return;

  const now = new Date();
  for (const alarm of alarms) {
    if (alarm.datetime > now) {
      alarm.notifId = await scheduleMainNotification(alarm);
      alarm.followUpId = await scheduleFollowUpNotification(alarm);
      alarm.missedId = await scheduleMissedNotification(alarm);
    }
  }
}
/* =============================================================
   💊 Main Component
   ============================================================= */
export default function MedicationReminderScreen() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [alarmsMap, setAlarmsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000); // Update every 30 seconds
    return () => clearInterval(timer);
  }, []);

  /* ---------- Fetch Prescriptions ---------- */
  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      setPrescriptions(data);
      await AsyncStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(data));

      const all = {};
      for (const p of data) all[p.id] = generateAlarms(p);

      const cached = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.ALARMS)) || {};
      const newMap = { ...cached };
      for (const p of data) {
        if (!cached[p.id]) {
          newMap[p.id] = all[p.id];
          await scheduleNotificationsForPrescription(p, all[p.id]);
        }
      }

      setAlarmsMap(newMap);
      await AsyncStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(newMap));
    } catch (err) {
      console.error("Fetch error:", err);
      Alert.alert("Error", "Failed to load prescriptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------- Offline Fallback ---------- */
  useEffect(() => {
    (async () => {
      const net = await NetInfo.fetch();
      if (net.isConnected) await fetchPrescriptions();
      else {
        const cachedPres = await AsyncStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS);
        const cachedAlarms = await AsyncStorage.getItem(STORAGE_KEYS.ALARMS);
        if (cachedPres) setPrescriptions(JSON.parse(cachedPres));
        if (cachedAlarms) setAlarmsMap(JSON.parse(cachedAlarms));
        setLoading(false);
      }
    })();
  }, [fetchPrescriptions]);

  /* ---------- Set First Intake Time and Automatically Mark as Done ---------- */
  const handleSetFirstIntakeTime = async (prescription) => {
    try {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const ss = now.getSeconds().toString().padStart(2, "0");
      const newTime = `${hh}:${mm}:${ss}`;

      const { error } = await supabase
        .from("prescriptions")
        .update({ first_intake_time: newTime })
        .eq("id", prescription.id);
      if (error) throw error;

      Alert.alert("Saved", `First intake time set to ${newTime}`);

      const newAlarms = generateAlarms({ ...prescription, first_intake_time: newTime });
      const mapCopy = { ...alarmsMap, [prescription.id]: newAlarms };
      setAlarmsMap(mapCopy);
      await AsyncStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(mapCopy));

      await scheduleNotificationsForPrescription(prescription, newAlarms);

      // Automatically mark the first intake alarm as done
      const firstAlarm = newAlarms[0]; // The first alarm in the list should be marked as done
      if (firstAlarm) {
        firstAlarm.done = true; // Mark it as done
        const updatedMap = { ...alarmsMap, [prescription.id]: newAlarms };
        setAlarmsMap(updatedMap);
        await AsyncStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(updatedMap));
        Alert.alert("First intake marked", `The first intake of ${prescription.medication_name} is marked as done.`);
      }
    } catch (err) {
      console.error("Set first intake error:", err);
      Alert.alert("Error", "Failed to update intake time.");
    }
  };

  const handleMarkAsDone = async (prescriptionId, alarmIndex) => {
    const mapCopy = { ...alarmsMap };
    const list = mapCopy[prescriptionId];
    const alarm = list[alarmIndex];
    if (!alarm) return;

    const now = new Date();
    if (now < new Date(alarm.datetime)) {
      Alert.alert("Too Early", "You can only mark this dose as done once it's time.");
      return;
    }

    alarm.done = true;
    alarm.adjusted = false;

    await cancelFollowUpAndMissed(alarm);

    setAlarmsMap(mapCopy);
    await AsyncStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(mapCopy));
    Alert.alert("Marked as Done", `You have taken ${alarm.med}`);
  };


  /* ---------- Handle Adjust Alarm Logic ---------- */
  const handleAdjustAlarm = async (prescriptionId, alarmIndex) => {
    const mapCopy = { ...alarmsMap };
    const list = mapCopy[prescriptionId];
    const alarm = list[alarmIndex];
    if (!alarm || alarm.done || alarm.adjusted) return;

    const now = new Date();
    const diffMin = (now - new Date(alarm.datetime)) / 60000;
    if (diffMin < 30) {
      Alert.alert("Too Early", "You can only adjust 30 minutes after the alarm time.");
      return;
    }

    await cancelFollowUpAndMissed(alarm);

    const diffMs = now.getTime() - new Date(alarm.datetime).getTime();
    alarm.done = true;
    alarm.adjusted = true;
    alarm.datetime = now;

    // Shift future alarms
    for (let i = alarmIndex + 1; i < list.length; i++) {
      list[i].datetime = new Date(new Date(list[i].datetime).getTime() + diffMs);
    }

    const mapUpdated = { ...alarmsMap, [prescriptionId]: list };
    setAlarmsMap(mapUpdated);
    await AsyncStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(mapUpdated));

    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      const body = n?.content?.body || "";
      if (body.includes(alarm.med)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    await scheduleNotificationsForPrescription(prescriptionId, list);

    Alert.alert("Adjusted", "This alarm and future reminders have been updated.");
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPrescriptions();
    setRefreshing(false);
  }, [fetchPrescriptions]);

  /* ---------- Render ---------- */
  const renderPrescription = ({ item }) => {
    const list = alarmsMap[item.id] || [];
    const nextAlarmIndex = list.findIndex((a) => !a.done);
  
    return (
      <View style={styles.myCard}>
        <Text style={styles.myTitle}>{item.medication_name}</Text>
        <Text style={styles.mySub}>
          {item.times_per_day}x/day for {item.duration_days} day(s)
        </Text>
        <Text style={styles.mySub}>
          Start: {item.start_date} | First intake: {item.first_intake_time || "—"}
        </Text>
  
        <View style={styles.alarmList}>
          {list.map((a, i) => {
            const alarmTime = new Date(a.datetime);
            const diffMin = (currentTime - alarmTime) / 60000;
            const showAdjust = diffMin >= 30 && !a.done && !a.adjusted;
            const isNext = i === nextAlarmIndex && !a.done;
            const isTimeReached = currentTime >= alarmTime;
  
            return (
              <View
                key={i}
                style={[styles.alarmRow, a.done ? styles.doneCard : styles.upcomingCard]}
              >
                <Text
                  style={[styles.alarmTime, a.done ? styles.doneAlarm : styles.upcomingAlarm]}
                >
                  {a.done ? "✅" : "⏰"}{" "}
                  {alarmTime.toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Text>
  
                {isNext && !a.done && (
                  <View style={styles.inlineButtons}>
                    {/* "Not Yet" Button */}
                    {!showAdjust && (
                      <Pressable
                        style={[styles.markBtn, !isTimeReached && styles.disabledBtn]}
                        disabled={!isTimeReached}
                        onPress={() => handleMarkAsDone(item.id, i)}
                      >
                        <Text style={styles.markBtnText}>
                          {isTimeReached ? "✔ Done" : "⏳ Not Yet"}
                        </Text>
                      </Pressable>
                    )}
  
                    {/* "Adjust" Button */}
                    {showAdjust && (
                      <Pressable
                        style={styles.adjustInlineBtn}
                        onPress={() => handleAdjustAlarm(item.id, i)}
                      >
                        <Text style={styles.adjustInlineText}>🕒 Adjust</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
  
        {!item.first_intake_time && (
          <Pressable style={styles.actionBlue} onPress={() => handleSetFirstIntakeTime(item)}>
            <Text style={styles.actionText}>⏰ Set First Intake Time</Text>
          </Pressable>
        )}
      </View>
    );
  };
  

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.pageTitle}>💊 Medication Reminders</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" />
        ) : (
          <FlatList
            data={prescriptions}
            keyExtractor={(item) => item.id}
            renderItem={renderPrescription}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f7fb" },
  container: { padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "700", color: "#2563eb" },
  myCard: { backgroundColor: "#fff", padding: 16, marginTop: 20, borderRadius: 12 },
  myTitle: { fontWeight: "700", fontSize: 18, marginBottom: 4 },
  mySub: { fontSize: 13, color: "#374151", marginBottom: 3 },
  alarmList: { marginTop: 10 },
  alarmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  upcomingCard: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1 },
  doneCard: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", borderWidth: 1 },
  alarmTime: { fontSize: 13, flex: 1 },
  upcomingAlarm: { color: "#1e3a8a" },
  doneAlarm: { color: "#16a34a", textDecorationLine: "line-through" },
  inlineButtons: { flexDirection: "row", alignItems: "center", gap: 6 },
  markBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  disabledBtn: { backgroundColor: "#9ca3af" },
  adjustInlineBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  adjustInlineText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  actionBlue: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});