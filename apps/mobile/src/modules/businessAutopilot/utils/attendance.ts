import { apiPost } from "@/core/api/http";

export type AttendanceAction = "in" | "out";

export type AttendanceRecord = {
  id: number;
  employee_name: string;
  attendance_date: string;
  checkin_time: string | null;
  checkout_time: string | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkin_accuracy: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
  checkout_accuracy: number | null;
  checkin_distance_meters: number | null;
  checkout_distance_meters: number | null;
  checkin_inside_geofence: boolean | null;
  checkout_inside_geofence: boolean | null;
  geo_status: string;
  outside_reason: string;
  device_info: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type AttendancePunchResponse = {
  ok: boolean;
  action: string;
  message?: string;
  attendance: AttendanceRecord;
  distance_meters?: number;
  inside_geofence?: boolean;
  gps_accuracy_warning?: boolean;
};

type GeoPayload = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

function getLocation(): Promise<GeoPayload> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location permission denied. Please enable GPS permission."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => reject(new Error("Location permission denied. Please enable GPS permission.")),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

async function submitPunch(action: AttendanceAction, payload: GeoPayload, outsideReason = "") {
  const endpoint = action === "in" ? "/api/hr/attendance/geo-checkin" : "/api/hr/attendance/geo-checkout";
  return apiPost<AttendancePunchResponse>(endpoint, {
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    outside_reason: outsideReason,
  });
}

export async function performAttendancePunch(action: AttendanceAction) {
  const location = await getLocation();
  if (Number(location.accuracy) > 200) {
    throw new Error("GPS accuracy is too low. Please try again.");
  }
  try {
    return await submitPunch(action, location);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save attendance.";
    if (!/outside reason is required/i.test(message)) {
      throw error;
    }
    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      throw error;
    }
    const outsideReason = window.prompt("You are outside allowed office location. Enter reason:");
    if (!outsideReason || !outsideReason.trim()) {
      throw new Error("You are outside the allowed office radius.");
    }
    return submitPunch(action, location, outsideReason.trim());
  }
}
