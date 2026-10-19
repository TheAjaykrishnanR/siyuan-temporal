import { useEffect, useState } from "react";
import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  addYears,
  format,
} from "date-fns";
import { showMessage, hideMessage } from "siyuan";
import type { Plugin } from "siyuan";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function notifySiyuan(
  text: string,
  timeout = 4000,
  type: "info" | "error" = "info",
  id?: string
) {
  try {
    showMessage(text, timeout, type, id);
  } catch {
    // ignore outside SiYuan runtime
  }
}
import {
  AlarmItem,
  CalendarEventItem,
  ClockSubTab,
  CustomReminder,
  DayOfWeek,
  GoogleCalendarAccount,
  RingingAlert,
  TemporalDataStore,
  TemporalSection,
  TemporalSettings,
  TimerItem,
  WorldClockItem,
} from "@/types/temporal";
import { generateId } from "@/lib/utils";
import { audioEngine } from "@/services/audio";
import {
  createGoogleCalendarEventRemote,
  syncGoogleCalendarAccount,
} from "@/services/googleCalendar";

const STORAGE_KEY = "temporal-store.json";

const DEFAULT_SETTINGS: TemporalSettings = {
  use24HourFormat: false,
  defaultSoundId: "marimba-chime",
  defaultVolume: 0.85,
  defaultSnoozeMinutes: 5,
  googleAutoSyncMinutes: 15,
  showRemindersInCalendar: true,
  showStatusBarWidget: true,
  themeMode: "auto",
};

function createInitialStore(): TemporalDataStore {
  const now = new Date();
  const tomorrowNineAm = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    9,
    0,
    0
  );
  const inTwoHours = new Date(now.getTime() + 2 * 3600 * 1000);

  return {
    alarms: [
      {
        id: "alarm_morning",
        time: "07:30",
        label: "Morning Deep Work & Review",
        enabled: false,
        repeatDays: [1, 2, 3, 4, 5],
        soundId: "marimba-chime",
        snoozeMinutes: 10,
        volume: 0.85,
      },
      {
        id: "alarm_evening",
        time: "21:00",
        label: "Daily Note Reflection",
        enabled: false,
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
        soundId: "zen-bowl",
        snoozeMinutes: 5,
        volume: 0.75,
      },
    ],
    timers: [
      {
        id: "timer_pomodoro",
        label: "Pomodoro Focus (25m)",
        durationMs: 25 * 60 * 1000,
        remainingMs: 25 * 60 * 1000,
        status: "idle",
        soundId: "marimba-chime",
        category: "focus",
      },
      {
        id: "timer_short_break",
        label: "Short Recharge Break (5m)",
        durationMs: 5 * 60 * 1000,
        remainingMs: 5 * 60 * 1000,
        status: "idle",
        soundId: "gentle-harp",
        category: "break",
      },
      {
        id: "timer_deep_sprint",
        label: "Deep Work Sprint (50m)",
        durationMs: 50 * 60 * 1000,
        remainingMs: 50 * 60 * 1000,
        status: "idle",
        soundId: "zen-bowl",
        category: "focus",
      },
    ],
    stopwatch: {
      status: "idle",
      elapsedMs: 0,
      laps: [],
    },
    worldClocks: [
      {
        id: "wc_utc",
        city: "UTC / GMT",
        country: "Universal Time",
        timezone: "UTC",
      },
      {
        id: "wc_ny",
        city: "New York",
        country: "United States",
        timezone: "America/New_York",
      },
      {
        id: "wc_london",
        city: "London",
        country: "United Kingdom",
        timezone: "Europe/London",
      },
      {
        id: "wc_tokyo",
        city: "Tokyo",
        country: "Japan",
        timezone: "Asia/Tokyo",
      },
    ],
    reminders: [
      {
        id: "rem_welcome",
        title: "Review Weekly Goals in SiYuan",
        description: "Check pinned documents and plan upcoming milestones",
        datetimeISO: tomorrowNineAm.toISOString(),
        recurrence: "weekly",
        priority: "high",
        category: "Planning",
        soundId: "marimba-chime",
        completed: false,
      },
    ],
    localEvents: [
      {
        id: "ev_sample_1",
        title: "SiYuan Knowledge Base Sync & Planning",
        description: "Organize notes, tags, and upcoming tasks",
        location: "SiYuan Workspace",
        startISO: inTwoHours.toISOString(),
        endISO: new Date(inTwoHours.getTime() + 3600 * 1000).toISOString(),
        allDay: false,
        color: "#6366f1",
        source: "local",
      },
    ],
    googleEvents: [],
    googleAccounts: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

class TemporalStoreManager {
  private plugin: Plugin | null = null;
  private state: TemporalDataStore = createInitialStore();
  private activeAlerts: RingingAlert[] = [];
  private activeSection: TemporalSection = "clock";
  private activeClockSubTab: ClockSubTab = "alarms";
  private selectedCalendarDateISO: string = new Date().toISOString();
  private isSyncingGoogle = false;
  private version = 0;
  private notifiedEventKeys = new Set<string>();
  private listeners = new Set<() => void>();
  private tickIntervalId: number | null = null;
  private googleSyncIntervalId: number | null = null;
  private saveTimeoutId: number | null = null;
  private messageObserver: MutationObserver | null = null;

  private readonly handleDocumentNotificationClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. Check custom action buttons inside SiYuan's #message notification box
    const actionBtn = target.closest(
      "[data-temporal-alert-action]"
    ) as HTMLElement | null;
    if (actionBtn) {
      e.preventDefault();
      e.stopPropagation();
      const action = actionBtn.getAttribute("data-temporal-alert-action");
      const alertId = actionBtn.getAttribute("data-alert-id");
      if (!alertId) return;
      if (action === "dismiss") {
        this.dismissAlert(alertId);
      } else if (action === "snooze") {
        const mins =
          Number(actionBtn.getAttribute("data-snooze-mins")) ||
          this.state.settings.defaultSnoozeMinutes ||
          5;
        this.snoozeAlert(alertId, mins);
      }
      return;
    }

    // 2. Check if user clicked SiYuan's native close button (.b3-snackbar__close) on an alert notification
    const closeBtn = target.closest(".b3-snackbar__close") as HTMLElement | null;
    if (closeBtn) {
      const snackbar = closeBtn.closest(".b3-snackbar") as HTMLElement | null;
      const alertEl = snackbar?.querySelector(
        "[data-temporal-alert-id]"
      ) as HTMLElement | null;
      const alertId =
        alertEl?.getAttribute("data-temporal-alert-id") ||
        snackbar?.getAttribute("data-id");
      if (alertId && this.activeAlerts.some((a) => a.id === alertId)) {
        this.dismissAlert(alertId);
      }
    }
  };

  public async init(plugin: Plugin) {
    this.plugin = plugin;
    try {
      const saved = await plugin.loadData(STORAGE_KEY);
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        this.state = {
          ...createInitialStore(),
          ...saved,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(saved.settings || {}),
          },
          stopwatch: {
            status: "idle",
            elapsedMs: 0,
            laps: [],
            ...(saved.stopwatch || {}),
          },
        };

        // Reconcile running timers after reload
        const now = Date.now();
        this.state.timers = (this.state.timers || []).map((t) => {
          if (t.status === "running" && t.targetEndTime) {
            const rem = Math.max(0, t.targetEndTime - now);
            return {
              ...t,
              remainingMs: rem,
              status: rem === 0 ? "completed" : "running",
            };
          }
          return t;
        });

        // Deduplicate googleEvents on init
        if (Array.isArray(this.state.googleEvents)) {
          const seen = new Set<string>();
          this.state.googleEvents = this.state.googleEvents.filter((e) => {
            const key = `${e.calendarId || ""}|${(e.title || "").trim().toLowerCase()}|${e.startISO}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }
    } catch (e) {
      console.warn("[SiYuan Temporal] Failed to load saved store, using defaults:", e);
    }

    this.bindSiyuanNotificationListeners();
    this.startBackgroundScheduler();
    this.setupGoogleAutoSync();
    this.notify();

    // Perform an initial Google Calendar sync if accounts exist
    if (this.state.googleAccounts.some((a) => a.enabled)) {
      this.syncAllGoogleCalendars(true).catch(() => {});
    }
  }

  private bindSiyuanNotificationListeners() {
    if (typeof document === "undefined") return;
    document.removeEventListener(
      "click",
      this.handleDocumentNotificationClick,
      true
    );
    document.addEventListener(
      "click",
      this.handleDocumentNotificationClick,
      true
    );

    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }

    const messageRoot = document.getElementById("message");
    if (messageRoot && typeof MutationObserver !== "undefined") {
      this.messageObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.removedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            const alertEl = node.matches("[data-temporal-alert-id]")
              ? node
              : (node.querySelector(
                  "[data-temporal-alert-id]"
                ) as HTMLElement | null);
            const alertId =
              alertEl?.getAttribute("data-temporal-alert-id") ||
              node.getAttribute("data-id");
            if (alertId && this.activeAlerts.some((a) => a.id === alertId)) {
              this.dismissAlert(alertId);
            }
          });
        }
      });
      this.messageObserver.observe(messageRoot, {
        childList: true,
        subtree: true,
      });
    }
  }

  public destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "click",
        this.handleDocumentNotificationClick,
        true
      );
    }
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
    }
    if (this.tickIntervalId !== null) {
      window.clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.googleSyncIntervalId !== null) {
      window.clearInterval(this.googleSyncIntervalId);
      this.googleSyncIntervalId = null;
    }
    if (this.saveTimeoutId !== null) {
      window.clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
    for (const alert of this.activeAlerts) {
      try {
        hideMessage(alert.id);
      } catch {
        // ignore
      }
    }
    audioEngine.stopAllSounds();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.version += 1;
    this.state = {
      ...this.state,
      alarms: [...this.state.alarms],
      timers: [...this.state.timers],
      worldClocks: [...this.state.worldClocks],
      reminders: [...this.state.reminders],
      localEvents: [...this.state.localEvents],
      googleEvents: [...this.state.googleEvents],
      googleAccounts: [...this.state.googleAccounts],
      settings: { ...this.state.settings },
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  public async reloadFromDisk() {
    if (!this.plugin) return;
    try {
      const saved = await this.plugin.loadData(STORAGE_KEY);
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        this.state = {
          ...createInitialStore(),
          ...saved,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(saved.settings || {}),
          },
          stopwatch: {
            status: "idle",
            elapsedMs: 0,
            laps: [],
            ...(saved.stopwatch || {}),
          },
        };

        if (Array.isArray(this.state.googleEvents)) {
          const seen = new Set<string>();
          this.state.googleEvents = this.state.googleEvents.filter((e) => {
            const key = `${e.calendarId || ""}|${(e.title || "").trim().toLowerCase()}|${e.startISO}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        this.notify();
      }
    } catch {
      // ignore
    }
  }

  private schedulePersist() {
    if (!this.plugin) return;
    if (this.saveTimeoutId !== null) {
      window.clearTimeout(this.saveTimeoutId);
    }
    this.saveTimeoutId = window.setTimeout(() => {
      this.plugin?.saveData(STORAGE_KEY, this.state).catch((e) => {
        console.warn("[SiYuan Temporal] Failed to persist store:", e);
      });
    }, 300);
  }

  public getState(): TemporalDataStore {
    return this.state;
  }

  public getVersion(): number {
    return this.version;
  }

  public getActiveAlerts(): RingingAlert[] {
    return this.activeAlerts;
  }

  public getNavigation(): {
    section: TemporalSection;
    clockSubTab: ClockSubTab;
    selectedCalendarDateISO: string;
    isSyncingGoogle: boolean;
  } {
    return {
      section: this.activeSection,
      clockSubTab: this.activeClockSubTab,
      selectedCalendarDateISO: this.selectedCalendarDateISO,
      isSyncingGoogle: this.isSyncingGoogle,
    };
  }

  public setSection(section: TemporalSection, clockSubTab?: ClockSubTab) {
    this.activeSection = section;
    if (clockSubTab) {
      this.activeClockSubTab = clockSubTab;
    }
    this.notify();
  }

  public setClockSubTab(subTab: ClockSubTab) {
    this.activeClockSubTab = subTab;
    this.notify();
  }

  public setSelectedCalendarDate(date: Date | string) {
    const dt = typeof date === "string" ? new Date(date) : date;
    if (!isNaN(dt.getTime())) {
      this.selectedCalendarDateISO = dt.toISOString();
      this.notify();
    }
  }

  public navigateToCalendarDate(date: Date | string) {
    const dt = typeof date === "string" ? new Date(date) : date;
    if (!isNaN(dt.getTime())) {
      this.selectedCalendarDateISO = dt.toISOString();
    }
    this.activeSection = "calendar";
    this.notify();
  }

  // ==================== BACKGROUND SCHEDULER ====================

  private startBackgroundScheduler() {
    if (this.tickIntervalId !== null) {
      window.clearInterval(this.tickIntervalId);
    }
    this.tickIntervalId = window.setInterval(() => {
      this.tick();
    }, 250);
  }

  private setupGoogleAutoSync() {
    if (this.googleSyncIntervalId !== null) {
      window.clearInterval(this.googleSyncIntervalId);
      this.googleSyncIntervalId = null;
    }
    const mins = this.state.settings.googleAutoSyncMinutes;
    if (mins > 0) {
      this.googleSyncIntervalId = window.setInterval(() => {
        if (this.state.googleAccounts.some((a) => a.enabled)) {
          this.syncAllGoogleCalendars(true).catch(() => {});
        }
      }, mins * 60 * 1000);
    }
  }

  private tick() {
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);
    let hasChanges = false;
    let shouldPersist = false;

    // 1. Check Running Timers
    this.state.timers = this.state.timers.map((timer) => {
      if (timer.status === "running" && timer.targetEndTime) {
        const remaining = Math.max(0, timer.targetEndTime - nowMs);
        if (remaining === 0) {
          hasChanges = true;
          shouldPersist = true;
          this.triggerAlert({
            id: `alert_timer_${timer.id}_${nowMs}`,
            sourceType: "timer",
            sourceId: timer.id,
            title: `Timer Finished: ${timer.label}`,
            subtitle: `Completed ${Math.round(timer.durationMs / 60000)}m timer`,
            triggeredAt: nowDate.toISOString(),
            soundId: timer.soundId || this.state.settings.defaultSoundId,
            customSoundUrl: timer.customSoundUrl,
            volume: this.state.settings.defaultVolume,
            loop: true,
          });
          return {
            ...timer,
            remainingMs: 0,
            status: "completed",
            targetEndTime: undefined,
          };
        }
        if (Math.abs(timer.remainingMs - remaining) >= 200) {
          hasChanges = true;
          return { ...timer, remainingMs: remaining };
        }
      }
      return timer;
    });

    // 2. Check Stopwatch live elapsed
    if (
      this.state.stopwatch.status === "running" &&
      this.state.stopwatch.startedAtEpoch
    ) {
      hasChanges = true;
    }

    // 3. Check Alarms (once per minute key "YYYY-MM-DDTHH:mm")
    const currentMinuteKey = format(nowDate, "yyyy-MM-dd'T'HH:mm");
    const currentHHmm = format(nowDate, "HH:mm");
    const currentDay = nowDate.getDay() as DayOfWeek;

    this.state.alarms = this.state.alarms.map((alarm) => {
      if (!alarm.enabled) return alarm;

      // Check snoozed alarm first
      if (alarm.snoozedUntil) {
        const snoozeTime = new Date(alarm.snoozedUntil).getTime();
        if (nowMs >= snoozeTime) {
          hasChanges = true;
          shouldPersist = true;
          this.triggerAlert({
            id: `alert_alarm_${alarm.id}_${nowMs}`,
            sourceType: "alarm",
            sourceId: alarm.id,
            title: alarm.label || "Alarm",
            subtitle: `Snoozed alarm (${alarm.time})`,
            triggeredAt: nowDate.toISOString(),
            soundId: alarm.soundId,
            customSoundUrl: alarm.customSoundUrl,
            volume: alarm.volume,
            loop: true,
            snoozeMinutes: alarm.snoozeMinutes,
          });
          return {
            ...alarm,
            snoozedUntil: undefined,
            lastTriggeredKey: currentMinuteKey,
          };
        }
      }

      if (
        alarm.time === currentHHmm &&
        alarm.lastTriggeredKey !== currentMinuteKey
      ) {
        const matchesDay =
          alarm.repeatDays.length === 0 ||
          alarm.repeatDays.includes(currentDay);

        if (matchesDay) {
          hasChanges = true;
          shouldPersist = true;
          this.triggerAlert({
            id: `alert_alarm_${alarm.id}_${nowMs}`,
            sourceType: "alarm",
            sourceId: alarm.id,
            title: alarm.label || "Alarm",
            subtitle: `Scheduled for ${alarm.time}`,
            triggeredAt: nowDate.toISOString(),
            soundId: alarm.soundId,
            customSoundUrl: alarm.customSoundUrl,
            volume: alarm.volume,
            loop: true,
            snoozeMinutes: alarm.snoozeMinutes,
          });

          // If one-time alarm (empty repeatDays), disable after firing unless snoozed
          const keepEnabled = alarm.repeatDays.length > 0;
          return {
            ...alarm,
            enabled: keepEnabled,
            lastTriggeredKey: currentMinuteKey,
          };
        }
      }
      return alarm;
    });

    // 4. Check Custom Reminders
    this.state.reminders = this.state.reminders.map((rem) => {
      if (rem.completed) return rem;

      const targetISO = rem.snoozedUntil || rem.datetimeISO;
      const targetMs = new Date(targetISO).getTime();
      if (isNaN(targetMs)) return rem;

      // Fire when current time reaches targetMs (within last 24h window and not already triggered for this targetISO)
      if (
        nowMs >= targetMs &&
        rem.lastTriggeredISO !== targetISO &&
        nowMs - targetMs < 24 * 3600 * 1000
      ) {
        hasChanges = true;
        shouldPersist = true;
        this.triggerAlert({
          id: `alert_reminder_${rem.id}_${nowMs}`,
          sourceType: "reminder",
          sourceId: rem.id,
          title: rem.title,
          subtitle: rem.description || format(new Date(rem.datetimeISO), "PPp"),
          triggeredAt: nowDate.toISOString(),
          soundId: rem.soundId || this.state.settings.defaultSoundId,
          customSoundUrl: rem.customSoundUrl,
          volume: this.state.settings.defaultVolume,
          loop: true,
          snoozeMinutes: this.state.settings.defaultSnoozeMinutes,
        });
        return {
          ...rem,
          lastTriggeredISO: targetISO,
        };
      }
      return rem;
    });

    // 5. Check Calendar Events (localEvents + enabled googleEvents) at start time
    const enabledAccIds = new Set(
      this.state.googleAccounts.filter((a) => a.enabled).map((a) => a.id)
    );
    const activeCalendarEvents = [
      ...this.state.localEvents,
      ...this.state.googleEvents.filter(
        (e) => !e.calendarId || enabledAccIds.has(e.calendarId)
      ),
    ];

    for (const ev of activeCalendarEvents) {
      if (ev.allDay) continue;
      const startMs = new Date(ev.startISO).getTime();
      if (isNaN(startMs)) continue;
      const eventTriggerKey = `${ev.id}_${ev.startISO}`;

      // Trigger if event started within the last 60 seconds and hasn't been notified yet
      if (
        nowMs >= startMs &&
        nowMs - startMs < 60 * 1000 &&
        !this.notifiedEventKeys.has(eventTriggerKey) &&
        ev.lastNotifiedISO !== ev.startISO
      ) {
        this.notifiedEventKeys.add(eventTriggerKey);
        if (ev.source === "local") {
          this.state.localEvents = this.state.localEvents.map((le) =>
            le.id === ev.id ? { ...le, lastNotifiedISO: ev.startISO } : le
          );
          shouldPersist = true;
        }
        hasChanges = true;
        this.triggerAlert({
          id: `alert_event_${ev.id}_${nowMs}`,
          sourceType: "event",
          sourceId: ev.id,
          title: ev.title,
          subtitle: ev.location
            ? `${format(new Date(ev.startISO), "p")} · ${ev.location}`
            : `Calendar event starting at ${format(new Date(ev.startISO), "p")}`,
          triggeredAt: nowDate.toISOString(),
          soundId: this.state.settings.defaultSoundId,
          volume: this.state.settings.defaultVolume,
          loop: false,
          snoozeMinutes: this.state.settings.defaultSnoozeMinutes,
        });
      }
    }

    if (shouldPersist) {
      this.schedulePersist();
    }
    if (hasChanges) {
      this.notify();
    }
  }

  public triggerAlert(alert: RingingAlert) {
    // Avoid duplicate active alert for same sourceId
    const existing = this.activeAlerts.find(
      (a) => a.sourceId === alert.sourceId && a.sourceType === alert.sourceType
    );
    if (existing) {
      audioEngine.stopAlertSound(existing.id);
      try {
        hideMessage(existing.id);
      } catch {
        // ignore
      }
      this.activeAlerts = this.activeAlerts.filter((a) => a.id !== existing.id);
    }

    this.activeAlerts = [alert, ...this.activeAlerts];
    audioEngine.startAlertSound(
      alert.id,
      alert.soundId,
      alert.volume,
      alert.loop,
      alert.customSoundUrl
    );

    const snoozeMins =
      alert.snoozeMinutes || this.state.settings.defaultSnoozeMinutes || 5;
    const dismissLabel =
      alert.sourceType === "reminder" ? "Complete" : "Dismiss";
    const badgeLabel = alert.sourceType.toUpperCase();

    const msgHtml = `<div data-temporal-alert-id="${escapeHtml(
      alert.id
    )}" style="display:flex;flex-direction:column;gap:6px;min-width:220px;">
      <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
        <span>🔔 [${badgeLabel}] ${escapeHtml(alert.title)}</span>
      </div>
      <div style="font-size:12px;opacity:0.85;">${escapeHtml(
        alert.subtitle
      )}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <button type="button" class="b3-button b3-button--text" style="padding:2px 10px;font-size:12px;" data-temporal-alert-action="dismiss" data-alert-id="${escapeHtml(
          alert.id
        )}">${dismissLabel}</button>
        <button type="button" class="b3-button b3-button--cancel" style="padding:2px 10px;font-size:12px;" data-temporal-alert-action="snooze" data-alert-id="${escapeHtml(
          alert.id
        )}" data-snooze-mins="${snoozeMins}">Snooze ${snoozeMins}m</button>
      </div>
    </div>`;

    notifySiyuan(msgHtml, 0, "info", alert.id);
    this.notify();
  }

  public dismissAlert(alertId: string) {
    const alert = this.activeAlerts.find((a) => a.id === alertId);
    audioEngine.stopAlertSound(alertId);
    this.activeAlerts = this.activeAlerts.filter((a) => a.id !== alertId);

    try {
      hideMessage(alertId);
    } catch {
      // ignore
    }

    if (alert?.sourceType === "timer") {
      // Reset completed timer back to idle duration
      this.resetTimer(alert.sourceId);
    } else if (alert?.sourceType === "reminder") {
      this.completeReminder(alert.sourceId, true);
    }

    this.notify();
  }

  public snoozeAlert(alertId: string, minutes = 5) {
    const alert = this.activeAlerts.find((a) => a.id === alertId);
    if (!alert) return;

    audioEngine.stopAlertSound(alertId);
    this.activeAlerts = this.activeAlerts.filter((a) => a.id !== alertId);

    try {
      hideMessage(alertId);
    } catch {
      // ignore
    }

    const snoozedUntil = addMinutes(new Date(), minutes).toISOString();

    if (alert.sourceType === "alarm") {
      this.state.alarms = this.state.alarms.map((a) =>
        a.id === alert.sourceId
          ? { ...a, enabled: true, snoozedUntil }
          : a
      );
    } else if (alert.sourceType === "reminder") {
      this.state.reminders = this.state.reminders.map((r) =>
        r.id === alert.sourceId
          ? { ...r, snoozedUntil, lastTriggeredISO: undefined }
          : r
      );
    } else if (alert.sourceType === "timer") {
      const snoozeMs = minutes * 60 * 1000;
      this.state.timers = this.state.timers.map((t) =>
        t.id === alert.sourceId
          ? {
              ...t,
              remainingMs: snoozeMs,
              status: "running",
              targetEndTime: Date.now() + snoozeMs,
            }
          : t
      );
    }

    this.schedulePersist();
    this.notify();
    notifySiyuan(
      `💤 Snoozed "${escapeHtml(alert.title)}" for ${minutes} minutes`,
      4000,
      "info"
    );
  }

  // ==================== ALARMS CRUD ====================

  public addAlarm(alarm: Omit<AlarmItem, "id">) {
    const newAlarm: AlarmItem = {
      ...alarm,
      id: generateId("alarm"),
    };
    this.state.alarms = [newAlarm, ...this.state.alarms];
    this.schedulePersist();
    this.notify();
    notifySiyuan(
      `⏰ Alarm "${escapeHtml(newAlarm.label || newAlarm.time)}" set for ${escapeHtml(newAlarm.time)}`,
      3000,
      "info"
    );
  }

  public updateAlarm(id: string, patch: Partial<AlarmItem>) {
    this.state.alarms = this.state.alarms.map((a) =>
      a.id === id
        ? { ...a, ...patch, snoozedUntil: undefined, lastTriggeredKey: undefined }
        : a
    );
    this.schedulePersist();
    this.notify();
    notifySiyuan("⏰ Alarm updated", 2500, "info");
  }

  public toggleAlarm(id: string) {
    let toggledAlarm: AlarmItem | undefined;
    this.state.alarms = this.state.alarms.map((a) => {
      if (a.id !== id) return a;
      toggledAlarm = {
        ...a,
        enabled: !a.enabled,
        snoozedUntil: undefined,
        lastTriggeredKey: undefined,
      };
      return toggledAlarm;
    });
    this.schedulePersist();
    this.notify();
    if (toggledAlarm) {
      notifySiyuan(
        `⏰ Alarm "${escapeHtml(toggledAlarm.label || toggledAlarm.time)}" ${
          toggledAlarm.enabled ? "enabled" : "disabled"
        }`,
        2500,
        "info"
      );
    }
  }

  public deleteAlarm(id: string) {
    this.state.alarms = this.state.alarms.filter((a) => a.id !== id);
    this.schedulePersist();
    this.notify();
    notifySiyuan("🗑️ Alarm deleted", 2500, "info");
  }

  // ==================== TIMERS CRUD ====================

  public addTimer(params: {
    label: string;
    durationMs: number;
    soundId?: TimerItem["soundId"];
    customSoundUrl?: string;
    autoStart?: boolean;
  }) {
    const now = Date.now();
    const newTimer: TimerItem = {
      id: generateId("timer"),
      label: params.label || "Custom Timer",
      durationMs: params.durationMs,
      remainingMs: params.durationMs,
      status: params.autoStart ? "running" : "idle",
      targetEndTime: params.autoStart ? now + params.durationMs : undefined,
      soundId: params.soundId || this.state.settings.defaultSoundId,
      customSoundUrl: params.customSoundUrl,
    };
    this.state.timers = [newTimer, ...this.state.timers];
    this.schedulePersist();
    this.notify();
  }

  public startOrResumeTimer(id: string) {
    const now = Date.now();
    this.state.timers = this.state.timers.map((t) => {
      if (t.id !== id) return t;
      const rem = t.remainingMs > 0 ? t.remainingMs : t.durationMs;
      return {
        ...t,
        remainingMs: rem,
        status: "running",
        targetEndTime: now + rem,
      };
    });
    this.schedulePersist();
    this.notify();
  }

  public pauseTimer(id: string) {
    const now = Date.now();
    this.state.timers = this.state.timers.map((t) => {
      if (t.id !== id || t.status !== "running") return t;
      const rem = t.targetEndTime
        ? Math.max(0, t.targetEndTime - now)
        : t.remainingMs;
      return {
        ...t,
        remainingMs: rem,
        status: "paused",
        targetEndTime: undefined,
      };
    });
    this.schedulePersist();
    this.notify();
  }

  public resetTimer(id: string) {
    this.state.timers = this.state.timers.map((t) =>
      t.id === id
        ? {
            ...t,
            remainingMs: t.durationMs,
            status: "idle",
            targetEndTime: undefined,
          }
        : t
    );
    this.schedulePersist();
    this.notify();
  }

  public addTimeToTimer(id: string, extraMs: number) {
    this.state.timers = this.state.timers.map((t) => {
      if (t.id !== id) return t;
      const nextRem = Math.max(0, t.remainingMs + extraMs);
      const nextTarget =
        t.status === "running" && t.targetEndTime
          ? t.targetEndTime + extraMs
          : undefined;
      return {
        ...t,
        durationMs: Math.max(t.durationMs, nextRem),
        remainingMs: nextRem,
        targetEndTime: nextTarget,
      };
    });
    this.schedulePersist();
    this.notify();
  }

  public deleteTimer(id: string) {
    this.state.timers = this.state.timers.filter((t) => t.id !== id);
    this.schedulePersist();
    this.notify();
  }

  // ==================== STOPWATCH ====================

  public getStopwatchElapsedMs(): number {
    const sw = this.state.stopwatch;
    if (sw.status === "running" && sw.startedAtEpoch) {
      return sw.elapsedMs + (Date.now() - sw.startedAtEpoch);
    }
    return sw.elapsedMs;
  }

  public startStopwatch() {
    if (this.state.stopwatch.status === "running") return;
    this.state.stopwatch = {
      ...this.state.stopwatch,
      status: "running",
      startedAtEpoch: Date.now(),
    };
    this.schedulePersist();
    this.notify();
  }

  public pauseStopwatch() {
    if (this.state.stopwatch.status !== "running") return;
    const total = this.getStopwatchElapsedMs();
    this.state.stopwatch = {
      ...this.state.stopwatch,
      status: "paused",
      elapsedMs: total,
      startedAtEpoch: undefined,
    };
    this.schedulePersist();
    this.notify();
  }

  public lapStopwatch() {
    if (this.state.stopwatch.status !== "running") return;
    const total = this.getStopwatchElapsedMs();
    const prevTotal =
      this.state.stopwatch.laps.length > 0
        ? this.state.stopwatch.laps[0].totalTimeMs
        : 0;
    const lapTime = Math.max(0, total - prevTotal);
    const lapNumber = this.state.stopwatch.laps.length + 1;

    this.state.stopwatch = {
      ...this.state.stopwatch,
      laps: [
        {
          id: generateId("lap"),
          lapNumber,
          lapTimeMs: lapTime,
          totalTimeMs: total,
        },
        ...this.state.stopwatch.laps,
      ],
    };
    this.schedulePersist();
    this.notify();
  }

  public resetStopwatch() {
    this.state.stopwatch = {
      status: "idle",
      elapsedMs: 0,
      startedAtEpoch: undefined,
      laps: [],
    };
    this.schedulePersist();
    this.notify();
  }

  // ==================== WORLD CLOCK ====================

  public addWorldClock(item: Omit<WorldClockItem, "id">) {
    this.state.worldClocks = [
      ...this.state.worldClocks,
      { ...item, id: generateId("wc") },
    ];
    this.schedulePersist();
    this.notify();
  }

  public removeWorldClock(id: string) {
    this.state.worldClocks = this.state.worldClocks.filter((w) => w.id !== id);
    this.schedulePersist();
    this.notify();
  }

  // ==================== CUSTOM REMINDERS ====================

  public addReminder(
    rem: Omit<CustomReminder, "id" | "completed" | "completedAt">
  ) {
    const newRem: CustomReminder = {
      ...rem,
      id: generateId("rem"),
      completed: false,
    };
    this.state.reminders = [newRem, ...this.state.reminders];
    this.schedulePersist();
    this.notify();
  }

  public updateReminder(id: string, patch: Partial<CustomReminder>) {
    this.state.reminders = this.state.reminders.map((r) =>
      r.id === id
        ? { ...r, ...patch, snoozedUntil: undefined, lastTriggeredISO: undefined }
        : r
    );
    this.schedulePersist();
    this.notify();
  }

  public completeReminder(id: string, completed: boolean) {
    this.state.reminders = this.state.reminders.map((r) => {
      if (r.id !== id) return r;

      // If completing a recurring reminder, advance it to the next occurrence!
      if (completed && r.recurrence !== "none") {
        const curDate = new Date(r.datetimeISO);
        let nextDate = curDate;
        if (r.recurrence === "daily") nextDate = addDays(curDate, 1);
        else if (r.recurrence === "weekly") nextDate = addWeeks(curDate, 1);
        else if (r.recurrence === "monthly") nextDate = addMonths(curDate, 1);
        else if (r.recurrence === "yearly") nextDate = addYears(curDate, 1);

        try {
          showMessage(
            `🔁 Recurring reminder "${r.title}" scheduled for ${format(
              nextDate,
              "PPp"
            )}`,
            4000,
            "info"
          );
        } catch {
          // ignore
        }

        return {
          ...r,
          datetimeISO: nextDate.toISOString(),
          snoozedUntil: undefined,
          lastTriggeredISO: undefined,
          completed: false,
        };
      }

      return {
        ...r,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
        snoozedUntil: undefined,
      };
    });
    this.schedulePersist();
    this.notify();
  }

  public snoozeReminder(id: string, minutes: number) {
    const snoozedUntil = addMinutes(new Date(), minutes).toISOString();
    this.state.reminders = this.state.reminders.map((r) =>
      r.id === id
        ? { ...r, snoozedUntil, lastTriggeredISO: undefined, completed: false }
        : r
    );
    this.schedulePersist();
    this.notify();
  }

  public deleteReminder(id: string) {
    this.state.reminders = this.state.reminders.filter((r) => r.id !== id);
    this.schedulePersist();
    this.notify();
  }

  // ==================== CALENDAR & GOOGLE CALENDAR ====================

  public addLocalEvent(
    ev: Omit<CalendarEventItem, "id" | "source"> & {
      pushToGoogleAccountId?: string;
    }
  ) {
    const newEv: CalendarEventItem = {
      id: generateId("ev"),
      title: ev.title,
      description: ev.description,
      location: ev.location,
      startISO: ev.startISO,
      endISO: ev.endISO,
      allDay: ev.allDay,
      color: ev.color || "#3b82f6",
      source: "local",
    };

    if (ev.pushToGoogleAccountId) {
      const account = this.state.googleAccounts.find(
        (a) => a.id === ev.pushToGoogleAccountId
      );
      if (account && account.mode === "oauth") {
        createGoogleCalendarEventRemote(account, newEv)
          .then((remoteEv) => {
            this.state.googleEvents = [remoteEv, ...this.state.googleEvents];
            this.schedulePersist();
            this.notify();
            showMessage("Synced new event to Google Calendar!", 4000, "info");
          })
          .catch((err) => {
            // Fallback to local event if remote creation fails
            this.state.localEvents = [newEv, ...this.state.localEvents];
            this.schedulePersist();
            this.notify();
            showMessage(
              `Saved locally (Google API error: ${err.message})`,
              5000,
              "error"
            );
          });
        return;
      }
    }

    this.state.localEvents = [newEv, ...this.state.localEvents];
    this.schedulePersist();
    this.notify();
    notifySiyuan(`📅 Event "${escapeHtml(newEv.title)}" added`, 2500, "info");
  }

  public updateLocalEvent(
    id: string,
    patch: Partial<Omit<CalendarEventItem, "id" | "source">>
  ) {
    this.state.localEvents = this.state.localEvents.map((ev) =>
      ev.id === id
        ? {
            ...ev,
            ...patch,
            lastNotifiedISO: undefined,
          }
        : ev
    );
    this.schedulePersist();
    this.notify();
    notifySiyuan("📅 Event updated", 2500, "info");
  }

  public deleteCalendarEvent(id: string) {
    if (id.startsWith("cal_rem_")) {
      const remId = id.replace(/^cal_rem_/, "").split("__")[0];
      this.deleteReminder(remId);
      return;
    }
    this.state.localEvents = this.state.localEvents.filter((e) => e.id !== id);
    this.state.googleEvents = this.state.googleEvents.filter((e) => e.id !== id);
    this.schedulePersist();
    this.notify();
    notifySiyuan("🗑️ Event deleted", 2500, "info");
  }

  public getUnifiedCalendarItemsForRange(
    rangeStart?: Date,
    rangeEnd?: Date
  ): CalendarEventItem[] {
    const enabledAccountIds = new Set(
      this.state.googleAccounts.filter((a) => a.enabled).map((a) => a.id)
    );
    const activeGoogleEvents = this.state.googleEvents.filter(
      (e) => !e.calendarId || enabledAccountIds.has(e.calendarId)
    );

    const reminderEvents: CalendarEventItem[] = [];
    if (this.state.settings.showRemindersInCalendar) {
      const windowStartMs = rangeStart
        ? rangeStart.getTime()
        : Date.now() - 90 * 24 * 3600 * 1000;
      const windowEndMs = rangeEnd
        ? rangeEnd.getTime()
        : Date.now() + 365 * 24 * 3600 * 1000;

      for (const r of this.state.reminders) {
        const baseISO = r.snoozedUntil || r.datetimeISO;
        const baseDt = new Date(baseISO);
        if (isNaN(baseDt.getTime())) continue;

        const remColor = r.completed
          ? "#71717a"
          : r.priority === "urgent"
          ? "#e11d48"
          : r.priority === "high"
          ? "#d97706"
          : "#7c3aed";

        // Always include the primary scheduled occurrence
        reminderEvents.push({
          id: `cal_rem_${r.id}`,
          reminderId: r.id,
          title: r.title,
          description: r.description,
          startISO: baseISO,
          endISO: baseISO,
          allDay: false,
          color: remColor,
          source: "reminder",
          calendarName: `Reminder · ${r.category}`,
          completed: r.completed,
          recurrence: r.recurrence,
          priority: r.priority,
        });

        // Project recurring occurrences within the requested calendar range for active reminders
        if (!r.completed && r.recurrence !== "none") {
          let cursor = new Date(baseDt);
          let guard = 0;
          while (guard < 400) {
            guard += 1;
            if (r.recurrence === "daily") cursor = addDays(cursor, 1);
            else if (r.recurrence === "weekly") cursor = addWeeks(cursor, 1);
            else if (r.recurrence === "monthly") cursor = addMonths(cursor, 1);
            else if (r.recurrence === "yearly") cursor = addYears(cursor, 1);
            else break;

            const t = cursor.getTime();
            if (t > windowEndMs) break;
            if (t >= windowStartMs) {
              const iso = cursor.toISOString();
              reminderEvents.push({
                id: `cal_rem_${r.id}__${guard}`,
                reminderId: r.id,
                title: r.title,
                description: r.description,
                startISO: iso,
                endISO: iso,
                allDay: false,
                color: remColor,
                source: "reminder",
                calendarName: `Reminder (${r.recurrence})`,
                completed: false,
                recurrence: r.recurrence,
                priority: r.priority,
              });
            }
          }
        }
      }
    }

    const combined = [
      ...this.state.localEvents,
      ...activeGoogleEvents,
      ...reminderEvents,
    ];

    const seenEventKeys = new Set<string>();
    const deduped: CalendarEventItem[] = [];

    for (const item of combined) {
      const primaryKey = item.id;
      const normalizedTitle = (item.title || "").trim().toLowerCase();
      const startMs = new Date(item.startISO).getTime();
      const compositeKey = `${normalizedTitle}|${isNaN(startMs) ? item.startISO : Math.floor(startMs / 60000)}`;

      if (seenEventKeys.has(primaryKey) || seenEventKeys.has(compositeKey)) {
        continue;
      }
      seenEventKeys.add(primaryKey);
      seenEventKeys.add(compositeKey);
      deduped.push(item);
    }

    return deduped.sort(
      (a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime()
    );
  }

  public addGoogleAccount(account: Omit<GoogleCalendarAccount, "id">) {
    const newAcc: GoogleCalendarAccount = {
      ...account,
      id: generateId("gcal"),
    };
    this.state.googleAccounts = [...this.state.googleAccounts, newAcc];
    this.schedulePersist();
    this.notify();
    // Immediately sync the newly added account
    this.syncSingleGoogleAccount(newAcc.id).catch(() => {});
  }

  public updateGoogleAccount(
    id: string,
    patch: Partial<GoogleCalendarAccount>
  ) {
    this.state.googleAccounts = this.state.googleAccounts.map((a) =>
      a.id === id ? { ...a, ...patch } : a
    );
    this.schedulePersist();
    this.notify();
  }

  public removeGoogleAccount(id: string) {
    this.state.googleAccounts = this.state.googleAccounts.filter(
      (a) => a.id !== id
    );
    this.state.googleEvents = this.state.googleEvents.filter(
      (e) => e.calendarId !== id
    );
    this.schedulePersist();
    this.notify();
  }

  public async syncSingleGoogleAccount(accountId: string): Promise<number> {
    const account = this.state.googleAccounts.find((a) => a.id === accountId);
    if (!account) return 0;

    this.isSyncingGoogle = true;
    this.notify();

    try {
      const fetched = await syncGoogleCalendarAccount(account);
      const otherEvents = this.state.googleEvents.filter(
        (e) => e.calendarId !== accountId
      );
      const combined = [...otherEvents, ...fetched];
      const seen = new Set<string>();
      const cleanEvents: CalendarEventItem[] = [];
      for (const e of combined) {
        const key = `${e.calendarId || ""}|${(e.title || "").trim().toLowerCase()}|${e.startISO}`;
        if (!seen.has(key)) {
          seen.add(key);
          cleanEvents.push(e);
        }
      }
      this.state.googleEvents = cleanEvents;
      this.state.googleAccounts = this.state.googleAccounts.map((a) =>
        a.id === accountId
          ? {
              ...a,
              accessToken: account.accessToken || a.accessToken,
              lastSyncedAt: new Date().toISOString(),
              lastSyncError: undefined,
            }
          : a
      );
      this.schedulePersist();
      return fetched.length;
    } catch (err: any) {
      const msg = err?.message || "Failed to sync Google Calendar";
      this.state.googleAccounts = this.state.googleAccounts.map((a) =>
        a.id === accountId ? { ...a, lastSyncError: msg } : a
      );
      this.schedulePersist();
      throw err;
    } finally {
      this.isSyncingGoogle = false;
      this.notify();
    }
  }

  public async syncAllGoogleCalendars(silent = false): Promise<number> {
    const enabledAccounts = this.state.googleAccounts.filter((a) => a.enabled);
    if (enabledAccounts.length === 0) return 0;

    this.isSyncingGoogle = true;
    this.notify();

    let totalSynced = 0;
    const disabledAccountIds = new Set(
      this.state.googleAccounts.filter((a) => !a.enabled).map((a) => a.id)
    );
    let accumulatedEvents: CalendarEventItem[] = this.state.googleEvents.filter(
      (e) => e.calendarId && disabledAccountIds.has(e.calendarId)
    );

    for (const acc of enabledAccounts) {
      try {
        const events = await syncGoogleCalendarAccount(acc);
        accumulatedEvents = [...accumulatedEvents, ...events];
        totalSynced += events.length;
        this.state.googleAccounts = this.state.googleAccounts.map((a) =>
          a.id === acc.id
            ? {
                ...a,
                lastSyncedAt: new Date().toISOString(),
                lastSyncError: undefined,
              }
            : a
        );
      } catch (err: any) {
        const msg = err?.message || "Sync failed";
        // Retain previous events for this account if refresh failed
        const prevEvents = this.state.googleEvents.filter(
          (e) => e.calendarId === acc.id
        );
        accumulatedEvents = [...accumulatedEvents, ...prevEvents];
        this.state.googleAccounts = this.state.googleAccounts.map((a) =>
          a.id === acc.id ? { ...a, lastSyncError: msg } : a
        );
        if (!silent) {
          try {
            showMessage(`Google Calendar (${acc.name}): ${msg}`, 5000, "error");
          } catch {
            // ignore
          }
        }
      }
    }

    const seen = new Set<string>();
    const cleanEvents: CalendarEventItem[] = [];
    for (const e of accumulatedEvents) {
      const key = `${e.calendarId || ""}|${(e.title || "").trim().toLowerCase()}|${e.startISO}`;
      if (!seen.has(key)) {
        seen.add(key);
        cleanEvents.push(e);
      }
    }

    this.state.googleEvents = cleanEvents;
    this.isSyncingGoogle = false;
    this.schedulePersist();
    this.notify();

    if (!silent) {
      try {
        showMessage(
          `✅ Synced ${totalSynced} events from ${enabledAccounts.length} Google Calendar(s)`,
          4000,
          "info"
        );
      } catch {
        // ignore
      }
    }

    return totalSynced;
  }

  // ==================== SETTINGS ====================

  public updateSettings(patch: Partial<TemporalSettings>) {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
    };
    if (patch.googleAutoSyncMinutes !== undefined) {
      this.setupGoogleAutoSync();
    }
    this.schedulePersist();
    this.notify();
  }
}

export const temporalStore = new TemporalStoreManager();

export function useTemporalStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return temporalStore.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, []);

  return {
    state: temporalStore.getState(),
    version: temporalStore.getVersion(),
    activeAlerts: temporalStore.getActiveAlerts(),
    navigation: temporalStore.getNavigation(),
    store: temporalStore,
  };
}
