export type SoundToneId =
  | "classic-beep"
  | "marimba-chime"
  | "zen-bowl"
  | "urgent-pulse"
  | "gentle-harp"
  | "cosmic-synth"
  | "custom-url";

export interface SoundToneOption {
  id: SoundToneId;
  name: string;
  description: string;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday

export interface AlarmItem {
  id: string;
  time: string; // "HH:mm" (24-hour format)
  label: string;
  enabled: boolean;
  repeatDays: DayOfWeek[]; // Empty array = one-time alarm
  soundId: SoundToneId;
  customSoundUrl?: string;
  snoozeMinutes: number;
  volume: number; // 0 to 1
  lastTriggeredKey?: string; // "YYYY-MM-DDTHH:mm" to prevent double firing in the same minute
  snoozedUntil?: string; // ISO string if currently snoozed
}

export interface TimerItem {
  id: string;
  label: string;
  durationMs: number;
  remainingMs: number;
  status: "idle" | "running" | "paused" | "completed";
  soundId: SoundToneId;
  customSoundUrl?: string;
  targetEndTime?: number; // epoch ms when running
  category?: "focus" | "break" | "general";
}

export interface StopwatchLap {
  id: string;
  lapNumber: number;
  lapTimeMs: number; // delta from previous lap
  totalTimeMs: number; // cumulative time
  note?: string;
}

export interface StopwatchState {
  status: "idle" | "running" | "paused";
  elapsedMs: number;
  startedAtEpoch?: number; // epoch ms when last resumed
  laps: StopwatchLap[];
}

export interface WorldClockItem {
  id: string;
  city: string;
  country: string;
  timezone: string; // e.g., "America/New_York", "Asia/Tokyo", "Europe/London"
}

export type ReminderRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type ReminderPriority = "low" | "medium" | "high" | "urgent";

export interface CustomReminder {
  id: string;
  title: string;
  description?: string;
  datetimeISO: string; // Full ISO timestamp or local "YYYY-MM-DDTHH:mm"
  recurrence: ReminderRecurrence;
  priority: ReminderPriority;
  category: string;
  soundId: SoundToneId;
  customSoundUrl?: string;
  completed: boolean;
  completedAt?: string;
  snoozedUntil?: string;
  lastTriggeredISO?: string;
  linkedBlockId?: string;
}

export type CalendarEventSource = "local" | "google" | "reminder";

export interface CalendarEventItem {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startISO: string;
  endISO: string;
  allDay: boolean;
  color: string;
  source: CalendarEventSource;
  calendarId?: string;
  calendarName?: string;
  htmlLink?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  reminderId?: string;
  completed?: boolean;
  recurrence?: ReminderRecurrence;
  priority?: ReminderPriority;
  lastNotifiedISO?: string;
}

export type GoogleIntegrationMode = "ical" | "oauth" | "apikey";

export interface GoogleCalendarAccount {
  id: string;
  name: string;
  mode: GoogleIntegrationMode;
  icalUrl?: string; // Secret address in iCal format (.ics)
  calendarId?: string; // e.g. "primary" or "user@gmail.com"
  apiKey?: string;
  accessToken?: string;
  clientId?: string;
  color: string;
  enabled: boolean;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

export interface RingingAlert {
  id: string;
  sourceType: "alarm" | "timer" | "reminder" | "event";
  sourceId: string;
  title: string;
  subtitle: string;
  triggeredAt: string;
  soundId: SoundToneId;
  customSoundUrl?: string;
  volume: number;
  loop: boolean;
  snoozeMinutes?: number;
}

export type TemporalSection = "clock" | "reminders" | "calendar" | "settings";
export type ClockSubTab = "alarms" | "timer" | "stopwatch" | "worldclock";

export interface TemporalSettings {
  use24HourFormat: boolean;
  defaultSoundId: SoundToneId;
  defaultVolume: number;
  defaultSnoozeMinutes: number;
  googleAutoSyncMinutes: number;
  showRemindersInCalendar: boolean;
  showStatusBarWidget: boolean;
  themeMode: "auto" | "light" | "dark";
}

export interface TemporalDataStore {
  alarms: AlarmItem[];
  timers: TimerItem[];
  stopwatch: StopwatchState;
  worldClocks: WorldClockItem[];
  reminders: CustomReminder[];
  localEvents: CalendarEventItem[];
  googleEvents: CalendarEventItem[];
  googleAccounts: GoogleCalendarAccount[];
  settings: TemporalSettings;
}
