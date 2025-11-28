// screens/AppointmentsScreen.js — with 9 AM notifications (3 days before)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
  Platform,
} from "react-native";
import { Calendar } from "react-native-calendars";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import moment from "moment";
import axios from "axios";

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

/* =============================================================
   ⏰ Notification Utilities
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
      Alert.alert("Permission required", "Enable notifications to get appointment reminders.");
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
  
  async function scheduleAppointmentReminders(appointment) {
    const ok = await ensurePermissions();
    if (!ok) return [];
  
    const apptDate = new Date(appointment.startISO);
  
    // 3 days before at 9:00 AM
    const threeDaysBefore = new Date(apptDate);
    threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
    threeDaysBefore.setHours(9, 0, 0, 0);
  
    // 1 day before at 9:00 AM
    const oneDayBefore = new Date(apptDate);
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);
    oneDayBefore.setHours(9, 0, 0, 0);
  
    const now = new Date();
    const ids = [];
  
    // Schedule both if they’re in the future
    for (const reminderDate of [threeDaysBefore, oneDayBefore]) {
      if (reminderDate > now) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: "📅 Upcoming Appointment",
            body: `You have an appointment on ${moment(apptDate).format("MMM D, YYYY")} at ${moment(
              apptDate
            ).format("h:mm A")}.`,
            sound: "default",
          },
          trigger: { type: "date", date: reminderDate },
        });
        ids.push(id);
      }
    }
  
    return ids;
  }
  

async function cancelAppointmentRemindersByIds(ids) {
  if (!ids || !Array.isArray(ids)) return;
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (err) {
      console.warn("⚠️ cancel error:", err.message);
    }
  }
}

/* =============================================================
   ⚙️ API CONFIG
   ============================================================= */
const API_BASE = "https://meditrack.space/api";
const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

/* ---------- Config ---------- */
const OPEN_HOUR = 7;
const CLOSE_HOUR = 16;

const MAIN_SERVICES = [
  { key: "medical", label: "Medical" },
  { key: "dental", label: "Dental" },
  { key: "pt", label: "Physical Therapy" },
  { key: "tb", label: "TB DOTS" },
  { key: "vax", label: "Vaccinations" },
];

const SUB_SERVICES = {
  medical: [
    { key: "medical-general", label: "General Consultation (Mon–Fri)" },
    { key: "medical-buntis", label: "Pregnant (Thursday)" },
  ],
  dental: [
    { key: "dental-bunot", label: "Dental – Bunot (Mon/Fri)" },
    { key: "dental-pasta", label: "Dental – Pasta / Cleaning (Tue/Wed)" },
    { key: "dental-buntis", label: "Dental – Pregnant (Thursday)" },
  ],
  vax: [
    { key: "vax-bcg", label: "BCG Vaccine" },
    { key: "vax-hep-b", label: "Hepatitis B Vaccine" },
    { key: "vax-polio", label: "Polio Vaccine" },
    { key: "vax-dpt", label: "DPT Vaccine" },
    { key: "vax-pneumococcal", label: "Pneumococcal Vaccine" },
    { key: "vax-measles", label: "Measles Vaccine" },
    { key: "vax-mmr", label: "MMR Vaccine" },
  ],
};

const serviceDurations = {
  "medical-general": 15,
  "medical-buntis": 30,
  "dental-bunot": 60,
  "dental-pasta": 60,
  "dental-buntis": 60,
  pt: 60,
  tb: 30,
  "vax-bcg": 30,
  "vax-hep-b": 30,
  "vax-polio": 30,
  "vax-dpt": 30,
  "vax-pneumococcal": 30,
  "vax-measles": 30,
  "vax-mmr": 30,
};

const allowedDays = {
  "medical-general": [1, 2, 3, 4, 5],
  "medical-buntis": [4],
  "dental-bunot": [1, 5],
  "dental-pasta": [2, 3],
  "dental-buntis": [4],
  pt: [1, 3, 5],
  tb: [1, 2, 3, 4, 5],
  "vax-bcg": [1, 2, 3, 4, 5],
  "vax-hep-b": [1, 2, 3, 4, 5],
  "vax-polio": [1, 2, 3, 4, 5],
  "vax-dpt": [1, 2, 3, 4, 5],
  "vax-pneumococcal": [1, 2, 3, 4, 5],
  "vax-measles": [1, 2, 3, 4, 5],
  "vax-mmr": [1, 2, 3, 4, 5],
};

const isPastDate = (ds) => moment(ds, "YYYY-MM-DD").isBefore(moment().startOf("day"));
const isPastDateTime = (ds, timeHHMMSS) =>
  moment(`${ds} ${timeHHMMSS}`, "YYYY-MM-DD HH:mm:ss").isSameOrBefore(moment());

const toDisplay = (t) => moment(String(t).split(".")[0], "HH:mm:ss").format("h:mm A");

const normalizeTime = (t) => {
  if (!t) return t;
  const main = String(t).split(".")[0];
  if (/^\d{2}:\d{2}:\d{2}$/.test(main)) return main;
  if (/^\d{2}:\d{2}$/.test(main)) return `${main}:00`;
  return moment(main, ["HH:mm:ss", "HH:mm"], true).isValid()
    ? moment(main, ["HH:mm:ss", "HH:mm"]).format("HH:mm:ss")
    : main;
};

const generateSlots = (serviceKey) => {
  const minutes = serviceDurations[serviceKey] || 30;
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    // Skip lunch break (12:00 PM - 1:00 PM)
    if (h === 12) continue;
    for (let m = 0; m < 60; m += minutes) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    }
  }
  return slots;
};

const getServiceLabel = (serviceType) => {
  for (const mainKey in SUB_SERVICES) {
    const found = SUB_SERVICES[mainKey].find((s) => s.key === serviceType);
    if (found) return found.label;
  }
  const main = MAIN_SERVICES.find((s) => s.key === serviceType);
  return main ? main.label : serviceType;
};

/* =============================================================
   💬 Main Component
   ============================================================= */
export default function AppointmentsScreen() {
  const [patientID, setPatientID] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [step, setStep] = useState(1);
  const [selectedMain, setSelectedMain] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [markedDates, setMarkedDates] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [slotStatus, setSlotStatus] = useState({});
  const [myAppointments, setMyAppointments] = useState([]);
  const [rebookTarget, setRebookTarget] = useState(null);
  const [doctorAvailability, setDoctorAvailability] = useState([]);
// 🩺 Doctor unavailability data (same as web)
const [doctorBlocks, setDoctorBlocks] = useState([]);

const loadDoctorBlocks = async (doctorId) => {
  try {
    const { data } = await api.get(`/availability/doctor/${doctorId}`);
    setDoctorBlocks(data || []);
  } catch (err) {
    console.error("❌ Failed to load doctor availability:", err.message);
    setDoctorBlocks([]);
  }
};

  const todayISO = moment().format("YYYY-MM-DD");

  useEffect(() => {
    (async () => {
      const cachedID = await AsyncStorage.getItem("patient_id");
      if (cachedID) {
        setPatientID(cachedID);
        try {
          const { data } = await api.get(`/patients/${cachedID}`);
          if (data) {
            setFirstName(data.first_name || "");
            setLastName(data.last_name || "");
          }
        } catch (err) {
          console.error("❌ Failed to fetch patient profile:", err?.message);
        }
        loadMyAppointments(cachedID);
      }
    })();
  }, []);

  useEffect(() => {
  if (!selectedService || step !== 3) return; // ✅ Only fetch when entering Step 3

  (async () => {
    try {
      console.log("🩺 Fetching doctors for service:", selectedService);

      // 🧩 Special handling for Vaccinations (show both vax-children & vax-adult)
      if (selectedService.startsWith("vax")) {
        const response = await api.get("/doctors");
        const allDoctors = Array.isArray(response.data) ? response.data : [];
        const filtered = allDoctors.filter((doc) =>
          (doc.service_type || "").toLowerCase().startsWith("vax")
        );
        console.log("✅ Filtered vaccination doctors:", filtered);
        setDoctors(filtered);
        return;
      }

      // 🧩 Default behavior for all other services (including TB)
      const { data } = await api.get("/doctors", {
        params: { service_type: selectedService },
      });
      console.log("✅ Doctor data received:", data);
      setDoctors(data || []);
    } catch (err) {
      console.error("❌ Failed to load doctors:", err.message);
      setDoctors([]);
    }
  })();
}, [selectedService, step]);



useEffect(() => {
  if (!selectedDoctor?.id) return; // ✅ safe optional chaining

  (async () => {
    try {
      const { data } = await api.get(`/availability/doctor/${selectedDoctor.id}/generated`);

      // Group by date to use in calendar and time slots
      const formatted = Array.isArray(data)
  ? data.map((d) => ({
      date: moment(d.date).format("YYYY-MM-DD"),
      start: d.start_time,
      end: d.end_time,
      status: d.status || "Available",
    }))
  : [];

      setDoctorAvailability(formatted);
    } catch (err) {
      console.error("❌ Failed to load doctor availability:", err.message);
      setDoctorAvailability([]);
    }
  })();
}, [selectedDoctor]);

  /* ---------- Book / Rebook ---------- */
  const book = async (time) => {
    if (!patientID) {
      Alert.alert("Error", "You must be logged in to book.");
      return;
    }

    const activeSameService = myAppointments.find(
      (a) =>
        a.service_type === (rebookTarget?.service_type || selectedService) &&
        moment(a.date).isSameOrAfter(moment(), "day") &&
        a.id !== rebookTarget?.id
    );
    if (activeSameService) {
      return Alert.alert(
        "Limit Reached",
        "You already have an active appointment for this service. Cancel or rebook it first."
      );
    }

    const serviceToUse = rebookTarget?.service_type || selectedService;

    const create = async () =>
  api.post("/appointments", {
    patient_id: patientID,
    first_name: firstName,
    last_name: lastName,
    date: selectedDate,
    time,
    status: "scheduled",
    service_type: serviceToUse,
    doctor_id: selectedDoctor?.id, // ✅ added
  });


    if (rebookTarget) {
      try {
        // Cancel old notifications
        const oldNotifKey = `apptNotif:${patientID}-${rebookTarget.date}-${normalizeTime(rebookTarget.time)}`;
        const oldStoredIds = await AsyncStorage.getItem(oldNotifKey);
        if (oldStoredIds) {
          try {
            const ids = JSON.parse(oldStoredIds);
            await cancelAppointmentRemindersByIds(ids);
            await AsyncStorage.removeItem(oldNotifKey);
          } catch (err) {
            console.warn("⚠️ Failed to cancel old notifications:", err.message);
          }
        }

        await create();
        await api.delete(`/appointments/${rebookTarget.id}`);
        
        // Schedule new notifications for the rebooked appointment
        const startISO = moment(
          `${selectedDate} ${time}`,
          "YYYY-MM-DD HH:mm:ss"
        ).toISOString();

        const ids = await scheduleAppointmentReminders(
          {
            id: patientID + "-" + selectedDate + "-" + time,
            startISO,
          },
          getServiceLabel(serviceToUse)
        );
        await AsyncStorage.setItem(
          `apptNotif:${patientID}-${selectedDate}-${time}`,
          JSON.stringify(ids)
        );

        setRebookTarget(null);
        loadMyAppointments(patientID);
        onDayPress({ dateString: selectedDate });
        Alert.alert("Rebooked!", `${getServiceLabel(serviceToUse)} - New time: ${toDisplay(time)}`);
      } catch (e) {
        Alert.alert("Error", e?.response?.data?.message || e.message);
      }
      return;
    }

    Alert.alert(
      "Confirm Appointment",
      `Book ${getServiceLabel(serviceToUse)} at ${toDisplay(time)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              await create();
              loadMyAppointments(patientID);
              onDayPress({ dateString: selectedDate });
              Alert.alert("Booked!", `${getServiceLabel(serviceToUse)}\nDate: ${moment(selectedDate).format("MMM D, YYYY")}\nTime: ${toDisplay(time)}`);

              const startISO = moment(
                `${selectedDate} ${time}`,
                "YYYY-MM-DD HH:mm:ss"
              ).toISOString();

              const ids = await scheduleAppointmentReminders(
                {
                  id: patientID + "-" + selectedDate + "-" + time,
                  startISO,
                },
                getServiceLabel(serviceToUse)
              );
              await AsyncStorage.setItem(
                `apptNotif:${patientID}-${selectedDate}-${time}`,
                JSON.stringify(ids)
              );
            } catch (e) {
              Alert.alert("Error", e?.response?.data?.message || e.message);
            }
          },
        },
      ]
    );
  };

  const cancelAppointment = async (id) => {
    const appointment = myAppointments.find((a) => a.id === id);
    if (!appointment) return;

    Alert.alert("Cancel Appointment", "Are you sure you want to cancel this appointment?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          try {
            // Cancel notifications for this appointment
            const notifKey = `apptNotif:${patientID}-${appointment.date}-${normalizeTime(appointment.time)}`;
            const storedIds = await AsyncStorage.getItem(notifKey);
            if (storedIds) {
              try {
                const ids = JSON.parse(storedIds);
                await cancelAppointmentRemindersByIds(ids);
                await AsyncStorage.removeItem(notifKey);
              } catch (err) {
                console.warn("⚠️ Failed to cancel notifications:", err.message);
              }
            }

            // Call the CANCEL endpoint from your backend
            const response = await api.delete(`/appointments/${id}`);  // Cancels the appointment
  
            // Log the response to ensure the cancellation was successful
            console.log("Appointment canceled:", response.data);
  
            // Optimistically remove the canceled appointment from the state
            setMyAppointments((prevAppointments) =>
              prevAppointments.filter((appt) => appt.id !== id)  // Remove the canceled appointment from the list
            );
  
            // Update the calendar's markedDates to reflect that the canceled appointment's date is no longer available
            setMarkedDates((prevMarkedDates) => {
              const updatedMarkedDates = { ...prevMarkedDates };
  
              // Remove the canceled appointment's date from the calendar
              if (updatedMarkedDates[selectedDate]) {
                delete updatedMarkedDates[selectedDate];  // Remove the canceled appointment's date
              }
  
              return updatedMarkedDates;
            });
  
            // Show success message
            Alert.alert("Canceled", "Your appointment has been canceled.");
          } catch (e) {
            // Error handling if the API call fails
            Alert.alert("Error", e?.response?.data?.message || e.message);
          }
        },
      },
    ]);
  };
  
  
  

  /* ---------- Load My Appointments ---------- */
  const loadMyAppointments = async (id) => {
    if (!id) return;
    try {
      const { data } = await api.get(`/appointments`, { params: { patient_id: id } });
      
      // Ensure canceled appointments are filtered out
      const mine = (data || []).filter((a) => a.status !== "cancelled");  // Explicitly filter canceled ones
      
      // Restore notifications for existing appointments
      for (const appt of mine) {
        const notifKey = `apptNotif:${id}-${appt.date}-${normalizeTime(appt.time)}`;
        const storedIds = await AsyncStorage.getItem(notifKey);
        
        // If no stored notification IDs, schedule new ones
        if (!storedIds) {
          try {
            const startISO = moment(
              `${appt.date} ${normalizeTime(appt.time)}`,
              "YYYY-MM-DD HH:mm:ss"
            ).toISOString();
            
            const ids = await scheduleAppointmentReminders(
              {
                id: id + "-" + appt.date + "-" + normalizeTime(appt.time),
                startISO,
              },
              getServiceLabel(appt.service_type)
            );
            
            if (ids.length > 0) {
              await AsyncStorage.setItem(notifKey, JSON.stringify(ids));
            }
          } catch (err) {
            console.warn("⚠️ Failed to restore notifications for appointment:", err.message);
          }
        }
      }
      
      // Update the state
      setMyAppointments(mine);
    } catch (err) {
      console.error("❌ loadMyAppointments error:", err?.message);
      setMyAppointments([]);  // In case of error, clear the list
    }
  };
  
  
  
  

  /* ---------- Calendar Behavior ---------- */
const refreshMonth = useCallback(
  async (startISO, endISO) => {
    if (!selectedDoctor) return;

    const marks = {};
    let cursor = moment(startISO);
    const end = moment(endISO);

    while (cursor.isSameOrBefore(end, "day")) {
      const ds = cursor.format("YYYY-MM-DD");
      const past = isPastDate(ds);
      const doctorHasDay = doctorAvailability.some((a) => a.date === ds);

      marks[ds] = {
        marked: doctorHasDay,
        dotColor: doctorHasDay ? "#22c55e" : "#9ca3af",
        disabled: past || !doctorHasDay,
        disableTouchEvent: past || !doctorHasDay,
        textColor: past || !doctorHasDay ? "#9ca3af" : undefined,
      };

      cursor.add(1, "day");
    }

    setMarkedDates(marks);
  },
  [selectedDoctor, doctorAvailability]
);

const onDayPress = useCallback(
  async (day) => {
    if (!selectedDoctor || !selectedService) return;
    if (isPastDate(day.dateString)) return;

    const weekday = moment(day.dateString).isoWeekday();
    const allowed = allowedDays[selectedService] || [];
    if (!allowed.includes(weekday)) {
      Alert.alert("Not Available", "This service is not offered on that day.");
      setSlotStatus({});
      return;
    }

    setSelectedDate(day.dateString);

    try {
      const { data: allAppts } = await api.get("/appointments", {
        params: { date: day.dateString, doctor_id: selectedDoctor.id },
      });

      const bookedByOthers = new Set(
        (allAppts || [])
          .filter((a) => !a.patient_id || a.patient_id !== patientID)
          .map((a) => normalizeTime(a.time))
      );

      const patientConflicts = new Set(
        (allAppts || [])
          .filter((a) => a.patient_id && a.patient_id === patientID)
          .map((a) => normalizeTime(a.time))
      );

      // 🧱 Get doctor’s blocked times for this day
      const blockedForDay = doctorBlocks.filter((b) => b.date === day.dateString);

      const allSlots = generateSlots(selectedService).filter(
        (t) =>
          !(
            moment(day.dateString).isSame(moment(), "day") &&
            isPastDateTime(day.dateString, t)
          )
      );

      const statusMap = {};

      for (const t of allSlots) {
        const time = moment(t, "HH:mm:ss");

        // ⛔ Check if time falls within a blocked period
        const isBlocked = blockedForDay.some(
          (b) =>
            time.isSameOrAfter(moment(b.start_time, "HH:mm")) &&
            time.isBefore(moment(b.end_time, "HH:mm"))
        );

        console.log("Blocked slot check:", t, isBlocked, blockedForDay);

        if (isBlocked) {
          statusMap[t] = "blocked";
          continue;
        }

        if (patientConflicts.has(t)) statusMap[t] = "conflict";
        else if (bookedByOthers.has(t)) continue;
        else statusMap[t] = "available";
      }

      setSlotStatus(statusMap);
    } catch (e) {
      console.error("❌ onDayPress error:", e?.message);
    }
  },
  [selectedDoctor, selectedService, patientID, doctorBlocks]
);

  const groupedSlots = useMemo(() => {
    const parts = { morning: [], afternoon: [] };
    Object.keys(slotStatus).forEach((t) => {
      const hour = Number(t.slice(0, 2));
      if (hour < 12) parts.morning.push(t);
      else parts.afternoon.push(t);
    });
    return parts;
  }, [slotStatus]);

  /* =============================================================
     🖼️ UI Rendering
     ============================================================= */
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Service Selection */}
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Choose Service</Text>
          {MAIN_SERVICES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.serviceBtn}
              onPress={async () => {
  setSelectedMain(s.key);
  
  if (SUB_SERVICES[s.key]) {
    setStep(2);
  } else {
    // set the service first
    setSelectedService(s.key);

    try {
      // 🩺 Directly fetch doctors here instead of waiting for useEffect
      const { data } = await api.get("/doctors", { params: { service_type: s.key } });
      console.log("✅ Doctors fetched for:", s.key, data);
      setDoctors(data || []);
    } catch (err) {
      console.error("❌ Doctor fetch failed:", err.message);
      setDoctors([]);
    }

    // move to doctor selection step
    setStep(3);
  }
}}
            >
              <Text style={styles.serviceBtnText}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sub-services */}
        {step === 2 && selectedMain && SUB_SERVICES[selectedMain] && (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Choose {selectedMain} Service</Text>
            {SUB_SERVICES[selectedMain].map((s) => (
              <TouchableOpacity
                key={s.key}
                style={styles.serviceBtn}
                onPress={() => {
                  setSelectedService(s.key);
                  setStep(3);
                }}
              >
                <Text style={styles.serviceBtnText}>{s.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
              <Text style={styles.backBtnText}>⬅ Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Doctor Selection */}
{step === 3 && selectedService && (
  <View style={styles.stepCard}>
    <Text style={styles.stepTitle}>Choose Doctor</Text>

    {/* Loading indicator */}
    {doctors === null && (
      <Text style={{ color: "#6b7280", fontStyle: "italic" }}>
        Loading doctors...
      </Text>
    )}

    {/* No doctors */}
    {Array.isArray(doctors) && doctors.length === 0 && (
      <Text style={{ color: "#6b7280" }}>No doctors available for this service.</Text>
    )}

    {/* Doctor list */}
    {Array.isArray(doctors) && doctors.length > 0 && (
      <>
        {doctors.map((doc) => (
          <TouchableOpacity
            key={doc.id}
            style={[
              styles.serviceBtn,
              selectedDoctor?.id === doc.id && { backgroundColor: "#16a34a" },
            ]}
            onPress={() => {
              setSelectedDoctor(doc);
              loadDoctorBlocks(doc.id);
              setStep(4); // Move to calendar
            }}
          >
            <Text style={styles.serviceBtnText}>{doc.name}</Text>
            {doc.specialization && (
              <Text style={{ color: "#e0f2fe", fontSize: 12 }}>
                {doc.specialization}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </>
    )}

    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
      <Text style={styles.backBtnText}>⬅ Back</Text>
    </TouchableOpacity>
  </View>
)}
        {/* Calendar and Time Slots */}
        {step === 4 && selectedDoctor && (
          <>
            <Calendar
              markedDates={{
                ...markedDates,
                ...(selectedDate
                  ? {
                      [selectedDate]: {
                        ...(markedDates[selectedDate] || {}),
                        selected: true,
                        selectedColor: "#1e40af",
                      },
                    }
                  : {}),
              }}
              minDate={todayISO}
              disableAllTouchEventsForDisabledDays
              disabledDaysIndexes={[0, 6]}
              theme={{
                textDisabledColor: "#9ca3af",
                disabledArrowColor: "#9ca3af",
              }}
              onDayPress={onDayPress}
              onMonthChange={({ year, month }) => {
                const base = `${year}-${String(month).padStart(2, "0")}-01`;
                const start = moment(base)
                  .startOf("month")
                  .startOf("week")
                  .format("YYYY-MM-DD");
                const end = moment(base)
                  .endOf("month")
                  .endOf("week")
                  .format("YYYY-MM-DD");
                refreshMonth(start, end);
              }}
            />

            {selectedDate && Object.keys(slotStatus).length > 0 && (
              <View style={styles.dayCard}>
                <Text style={styles.dayTitle}>
                  {moment(selectedDate).format("dddd, MMM D, YYYY")}
                </Text>
                {["morning", "afternoon"].map((period) => (
  <View key={period}>
    {groupedSlots[period].length > 0 && (
      <>
        <Text style={styles.slotSection}>
          {period === "morning" ? "Morning" : "Afternoon"}
        </Text>
        {groupedSlots[period].map((item) => {
  const status = slotStatus[item];
  const isBlocked = status === "blocked";
  const isAvailable = status === "available";
  const isConflict = status === "conflict";

  return (
    <TouchableOpacity
      key={item}
      style={[
        styles.slotButton,
        isAvailable && styles.slotAvailable,
        isConflict && styles.slotConflict,
        isBlocked && styles.slotBlocked, // 👈 make sure this comes last
      ]}
      disabled={!isAvailable}
      onPress={() => isAvailable && book(item)}
    >
      <Text
        style={[
          styles.slotText,
          isBlocked && { color: "#6b7280", fontStyle: "italic" }, // muted gray text
        ]}
      >
        {toDisplay(item)}{" "}
        {isConflict
          ? "(You booked)"
          : isBlocked
          ? "(Unavailable)"
          : ""}
      </Text>
    </TouchableOpacity>
  );
})}

      </>
    )}
  </View>
))}
              </View>
            )}
          </>
        )}

        {/* My Appointments */}
        {myAppointments.length > 0 && (
  <View style={styles.myCard}>
    <Text style={styles.myTitle}>My Appointments</Text>
    {myAppointments
      .filter((a) => a.status !== "cancelled")  // Only show appointments that are not canceled
      .map((a) => (
        <View key={a.id} style={styles.myItem}>
          <Text style={styles.myText}>
            {moment(a.date).format("MMM D, YYYY")} • {toDisplay(normalizeTime(a.time))}
          </Text>
          <Text style={styles.serviceLabel}>{getServiceLabel(a.service_type)}</Text>
          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#dc2626" }]}
              onPress={() => cancelAppointment(a.id)}
            >
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#1e40af" }]}
              onPress={() => {
                setRebookTarget(a);
                setSelectedService(a.service_type);
                setStep(3);
                const ds = moment(a.date).format("YYYY-MM-DD");
                setSelectedDate(ds);
                setTimeout(() => onDayPress({ dateString: ds }), 0);
              }}
            >
              <Text style={styles.actionBtnText}>Rebook</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
  </View>
)}

        
      </ScrollView>
    </SafeAreaView>
  );
}

/* =============================================================
   🎨 Styles
   ============================================================= */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f7fb" },
  container: { padding: 16 },
  stepCard: { backgroundColor: "#fff", padding: 20, borderRadius: 12, marginTop: 20 },
  stepTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  serviceBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: "center",
  },
  serviceBtnText: { color: "#fff", fontWeight: "700" },
  backBtn: { marginTop: 10 },
  backBtnText: { color: "#2563eb", fontWeight: "600" },
  dayCard: { backgroundColor: "#fff", padding: 16, marginTop: 16, borderRadius: 12 },
  dayTitle: { fontWeight: "700", fontSize: 16, marginBottom: 8 },
  slotSection: { fontSize: 14, fontWeight: "700", marginVertical: 6 },
  slotButton: { padding: 14, borderRadius: 12, marginVertical: 6, alignItems: "center" },
  slotAvailable: { backgroundColor: "#1e40af" },
  slotConflict: { backgroundColor: "#dc2626" },
  slotText: { color: "#fff", fontWeight: "700" },
  slotBooked: { backgroundColor: "#dc2626" },      // red for booked
  slotUnavailable: { backgroundColor: "#9ca3af" }, // grey for unavailable
  myCard: { backgroundColor: "#fff", padding: 16, marginTop: 20, borderRadius: 12 },
  myTitle: { fontWeight: "700", fontSize: 16, marginBottom: 10 },
  myItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  myText: { fontWeight: "600", fontSize: 15 },
  mySub: { fontSize: 13, color: "#6b7280" },
  serviceLabel: { fontSize: 15, fontWeight: "700", color: "#1e40af", marginTop: 4 },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 },
  actionBtnText: { color: "#fff", fontWeight: "700" },
  slotBlocked: {
  backgroundColor: "#d1d5db", // 👈 light gray background
  borderColor: "#9ca3af",
  borderWidth: 1,
  opacity: 0.8,
},
});