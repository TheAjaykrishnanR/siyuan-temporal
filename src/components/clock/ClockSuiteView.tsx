import React, { useEffect, useMemo, useState } from "react";
import { endOfDay, format, startOfDay } from "date-fns";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Copy,
  Flag,
  Globe,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sun,
  Moon,
  Timer as TimerIcon,
  Trash2,
  Volume2,
  Watch,
} from "lucide-react";
import { showMessage } from "siyuan";
import {
  AlarmItem,
  ClockSubTab,
  DayOfWeek,
  SoundToneId,
} from "@/types/temporal";
import { SOUND_TONE_OPTIONS, audioEngine } from "@/services/audio";
import { useTemporalStore } from "@/services/store";
import { cn, formatDurationMs } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const DAY_LABELS: { day: DayOfWeek; short: string; full: string }[] = [
  { day: 0, short: "Su", full: "Sun" },
  { day: 1, short: "Mo", full: "Mon" },
  { day: 2, short: "Tu", full: "Tue" },
  { day: 3, short: "We", full: "Wed" },
  { day: 4, short: "Th", full: "Thu" },
  { day: 5, short: "Fr", full: "Fri" },
  { day: 6, short: "Sa", full: "Sat" },
];

const POPULAR_WORLD_CITIES = [
  { city: "San Francisco", country: "United States", timezone: "America/Los_Angeles" },
  { city: "New York", country: "United States", timezone: "America/New_York" },
  { city: "Toronto", country: "Canada", timezone: "America/Toronto" },
  { city: "São Paulo", country: "Brazil", timezone: "America/Sao_Paulo" },
  { city: "London", country: "United Kingdom", timezone: "Europe/London" },
  { city: "Paris", country: "France", timezone: "Europe/Paris" },
  { city: "Berlin", country: "Germany", timezone: "Europe/Berlin" },
  { city: "Dubai", country: "UAE", timezone: "Asia/Dubai" },
  { city: "Mumbai / New Delhi", country: "India", timezone: "Asia/Kolkata" },
  { city: "Singapore", country: "Singapore", timezone: "Asia/Singapore" },
  { city: "Shanghai / Beijing", country: "China", timezone: "Asia/Shanghai" },
  { city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo" },
  { city: "Seoul", country: "South Korea", timezone: "Asia/Seoul" },
  { city: "Sydney", country: "Australia", timezone: "Australia/Sydney" },
  { city: "Auckland", country: "New Zealand", timezone: "Pacific/Auckland" },
  { city: "UTC", country: "Coordinated Universal Time", timezone: "UTC" },
];

export const ClockSuiteView: React.FC = () => {
  const { state, navigation, version, store } = useTemporalStore();
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const intervalMs = state.stopwatch.status === "running" ? 40 : 500;
    const id = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [state.stopwatch.status]);

  // ==================== ALARM DIALOG STATE ====================
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmTime, setAlarmTime] = useState("08:00");
  const [alarmLabel, setAlarmLabel] = useState("");
  const [alarmDays, setAlarmDays] = useState<DayOfWeek[]>([1, 2, 3, 4, 5]);
  const [alarmSound, setAlarmSound] = useState<SoundToneId>(
    state.settings.defaultSoundId
  );
  const [alarmCustomUrl, setAlarmCustomUrl] = useState("");
  const [alarmSnooze, setAlarmSnooze] = useState("10");
  const [alarmVolume, setAlarmVolume] = useState(0.85);

  const openNewAlarmDialog = () => {
    setEditingAlarmId(null);
    setAlarmTime("08:00");
    setAlarmLabel("");
    setAlarmDays([1, 2, 3, 4, 5]);
    setAlarmSound(state.settings.defaultSoundId);
    setAlarmCustomUrl("");
    setAlarmSnooze(String(state.settings.defaultSnoozeMinutes || 10));
    setAlarmVolume(state.settings.defaultVolume || 0.85);
    setAlarmDialogOpen(true);
  };

  const openEditAlarmDialog = (alarm: AlarmItem) => {
    setEditingAlarmId(alarm.id);
    setAlarmTime(alarm.time);
    setAlarmLabel(alarm.label);
    setAlarmDays([...alarm.repeatDays]);
    setAlarmSound(alarm.soundId);
    setAlarmCustomUrl(alarm.customSoundUrl || "");
    setAlarmSnooze(String(alarm.snoozeMinutes));
    setAlarmVolume(alarm.volume);
    setAlarmDialogOpen(true);
  };

  const handleSaveAlarm = () => {
    if (!alarmTime) return;
    const payload = {
      time: alarmTime,
      label: alarmLabel.trim() || "Alarm",
      enabled: true,
      repeatDays: [...alarmDays].sort(),
      soundId: alarmSound,
      customSoundUrl: alarmCustomUrl.trim() || undefined,
      snoozeMinutes: Number(alarmSnooze) || 10,
      volume: alarmVolume,
    };
    if (editingAlarmId) {
      store.updateAlarm(editingAlarmId, payload);
    } else {
      store.addAlarm(payload);
    }
    setAlarmDialogOpen(false);
  };

  // ==================== TIMER DIALOG STATE ====================
  const [timerDialogOpen, setTimerDialogOpen] = useState(false);
  const [timerLabel, setTimerLabel] = useState("");
  const [timerHours, setTimerHours] = useState("0");
  const [timerMinutes, setTimerMinutes] = useState("15");
  const [timerSeconds, setTimerSeconds] = useState("0");
  const [timerSound, setTimerSound] = useState<SoundToneId>(
    state.settings.defaultSoundId
  );
  const [timerCustomUrl, setTimerCustomUrl] = useState("");

  const handleCreateTimer = (autoStart = true) => {
    const h = Math.max(0, parseInt(timerHours || "0", 10) || 0);
    const m = Math.max(0, parseInt(timerMinutes || "0", 10) || 0);
    const s = Math.max(0, parseInt(timerSeconds || "0", 10) || 0);
    const totalMs = (h * 3600 + m * 60 + s) * 1000;
    if (totalMs <= 0) {
      showMessage("Please enter a duration greater than 0 seconds", 3000, "error");
      return;
    }
    const defaultLabel =
      h > 0 ? `${h}h ${m}m Timer` : m > 0 ? `${m}m Timer` : `${s}s Timer`;
    store.addTimer({
      label: timerLabel.trim() || defaultLabel,
      durationMs: totalMs,
      soundId: timerSound,
      customSoundUrl: timerCustomUrl.trim() || undefined,
      autoStart,
    });
    setTimerDialogOpen(false);
    setTimerLabel("");
  };

  const handleQuickTimerPreset = (minutes: number, label: string) => {
    store.addTimer({
      label,
      durationMs: minutes * 60 * 1000,
      soundId: state.settings.defaultSoundId,
      autoStart: true,
    });
  };

  // ==================== WORLD CLOCK DIALOG STATE ====================
  const [wcDialogOpen, setWcDialogOpen] = useState(false);
  const [selectedPresetIdx, setSelectedPresetIdx] = useState("0");
  const [customCity, setCustomCity] = useState("");
  const [customCountry, setCustomCountry] = useState("");
  const [customTz, setCustomTz] = useState("");

  const handleAddWorldClock = () => {
    if (customCity.trim() && customTz.trim()) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: customTz.trim() });
        store.addWorldClock({
          city: customCity.trim(),
          country: customCountry.trim() || "Custom Timezone",
          timezone: customTz.trim(),
        });
        setCustomCity("");
        setCustomCountry("");
        setCustomTz("");
        setWcDialogOpen(false);
        return;
      } catch {
        showMessage("Invalid IANA timezone identifier (e.g. Europe/Zurich)", 4000, "error");
        return;
      }
    }

    const preset = POPULAR_WORLD_CITIES[Number(selectedPresetIdx)];
    if (preset) {
      store.addWorldClock(preset);
      setWcDialogOpen(false);
    }
  };

  // ==================== STOPWATCH COMPUTATIONS ====================
  const swElapsedMs = store.getStopwatchElapsedMs();
  const swFormatted = formatDurationMs(swElapsedMs, true);
  const currentLapElapsedMs =
    state.stopwatch.laps.length > 0
      ? Math.max(0, swElapsedMs - state.stopwatch.laps[0].totalTimeMs)
      : swElapsedMs;

  const lapStats = useMemo(() => {
    const laps = state.stopwatch.laps;
    if (laps.length < 2) {
      return { fastestId: null, slowestId: null, avgMs: laps[0]?.lapTimeMs || 0 };
    }
    let minMs = Infinity;
    let maxMs = -Infinity;
    let fastestId: string | null = null;
    let slowestId: string | null = null;
    let sum = 0;

    for (const l of laps) {
      sum += l.lapTimeMs;
      if (l.lapTimeMs < minMs) {
        minMs = l.lapTimeMs;
        fastestId = l.id;
      }
      if (l.lapTimeMs > maxMs) {
        maxMs = l.lapTimeMs;
        slowestId = l.id;
      }
    }
    return {
      fastestId,
      slowestId,
      avgMs: Math.round(sum / laps.length),
    };
  }, [state.stopwatch.laps]);

  const copyLapsToClipboard = () => {
    if (state.stopwatch.laps.length === 0) return;
    const rows = [...state.stopwatch.laps]
      .reverse()
      .map(
        (l) =>
          `| Lap ${l.lapNumber} | ${formatDurationMs(l.lapTimeMs, true).formatted} | ${
            formatDurationMs(l.totalTimeMs, true).formatted
          } |`
      );
    const md = `| Lap | Split Time | Total Time |\n| --- | --- | --- |\n${rows.join("\n")}`;
    navigator.clipboard.writeText(md).then(() => {
      showMessage("Copied stopwatch laps as Markdown table", 3000, "info");
    });
  };

  const formatAlarmDisplayTime = (hhmm: string) => {
    const [hStr, mStr] = hhmm.split(":");
    const h = Number(hStr);
    if (state.settings.use24HourFormat) {
      return { main: hhmm, period: "" };
    }
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return {
      main: `${String(h12).padStart(2, "0")}:${mStr}`,
      period,
    };
  };

  const todayKey = format(now, "yyyy-MM-dd");
  const todayScheduleItems = useMemo(() => {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());
    return store.getUnifiedCalendarItemsForRange(start, end);
  }, [
    todayKey,
    state.localEvents,
    state.googleEvents,
    state.googleAccounts,
    state.reminders,
    state.settings.showRemindersInCalendar,
    version,
  ]);

  return (
    <div className="space-y-6">
      {/* Daily Overview & Status Card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium text-foreground">
                {format(now, "EEEE, MMMM d, yyyy")}
              </span>
              <span className="opacity-40">&bull;</span>
              <span className="text-xs font-mono">
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
                <AlarmClock className="h-3.5 w-3.5" />
                {state.alarms.filter((a) => a.enabled).length} Active Alarms
              </Badge>
              <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
                <TimerIcon className="h-3.5 w-3.5" />
                {state.timers.filter((t) => t.status === "running").length} Running Timers
              </Badge>
              <Badge
                variant="secondary"
                className="gap-1.5 py-1 px-2.5 cursor-pointer"
                onClick={() => store.navigateToCalendarDate(new Date())}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {todayScheduleItems.filter((i) => !i.completed).length} Today
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  audioEngine.playPatternOnce(
                    state.settings.defaultSoundId,
                    state.settings.defaultVolume
                  )
                }
              >
                <Volume2 className="h-3.5 w-3.5" />
                Test Sound
              </Button>
            </div>
          </div>

          {todayScheduleItems.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Today&apos;s Synchronized Schedule ({todayScheduleItems.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => store.setSection("reminders")}
                    >
                      Reminders
                    </button>
                    <span>&middot;</span>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => store.navigateToCalendarDate(new Date())}
                    >
                      Calendar
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {todayScheduleItems.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs transition-colors",
                        item.completed && "opacity-55 line-through"
                      )}
                    >
                      {item.source === "reminder" && item.reminderId ? (
                        <Checkbox
                          checked={Boolean(item.completed)}
                          onCheckedChange={(checked) =>
                            store.completeReminder(
                              item.reminderId!,
                              Boolean(checked)
                            )
                          }
                        />
                      ) : (
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.color || "#2563eb" }}
                        />
                      )}
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-left"
                        onClick={() =>
                          item.source === "reminder"
                            ? store.setSection("reminders")
                            : store.navigateToCalendarDate(new Date(item.startISO))
                        }
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.allDay
                            ? "All Day"
                            : format(new Date(item.startISO), "HH:mm")}
                        </span>
                        <span className="font-medium truncate max-w-[180px]">
                          {item.title}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Clock Sub-Tabs */}
      <Tabs
        value={navigation.clockSubTab}
        onValueChange={(v) => store.setClockSubTab(v as ClockSubTab)}
        className="w-full"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="alarms" className="gap-1.5">
              <AlarmClock className="h-3.5 w-3.5" />
              Alarms
            </TabsTrigger>
            <TabsTrigger value="timer" className="gap-1.5">
              <TimerIcon className="h-3.5 w-3.5" />
              Timers
            </TabsTrigger>
            <TabsTrigger value="stopwatch" className="gap-1.5">
              <Watch className="h-3.5 w-3.5" />
              Stopwatch
            </TabsTrigger>
            <TabsTrigger value="worldclock" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              World Clock
            </TabsTrigger>
          </TabsList>

          {navigation.clockSubTab === "alarms" && (
            <Button onClick={openNewAlarmDialog} size="sm">
              <Plus className="h-4 w-4" />
              New Alarm
            </Button>
          )}
          {navigation.clockSubTab === "timer" && (
            <Button onClick={() => setTimerDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              New Timer
            </Button>
          )}
          {navigation.clockSubTab === "worldclock" && (
            <Button onClick={() => setWcDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Add City
            </Button>
          )}
        </div>

        {/* ==================== TAB 1: ALARMS ==================== */}
        <TabsContent value="alarms" className="space-y-4">
          {state.alarms.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlarmClock className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No alarms configured</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Create an alarm with real synthesized chimes or custom audio.
                </p>
                <Button onClick={openNewAlarmDialog} size="sm">
                  <Plus className="h-4 w-4" /> Add Alarm
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {state.alarms.map((alarm) => {
                const { main, period } = formatAlarmDisplayTime(alarm.time);
                const soundOption = SOUND_TONE_OPTIONS.find(
                  (s) => s.id === alarm.soundId
                );
                const isEveryDay = alarm.repeatDays.length === 7;
                const isWeekdays =
                  alarm.repeatDays.length === 5 &&
                  [1, 2, 3, 4, 5].every((d) =>
                    alarm.repeatDays.includes(d as DayOfWeek)
                  );

                return (
                  <Card
                    key={alarm.id}
                    className={cn(!alarm.enabled && "opacity-60")}
                  >
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                      <div>
                        <div className="flex items-baseline gap-1.5 font-mono">
                          <span className="text-3xl font-bold tracking-tight">
                            {main}
                          </span>
                          {period && (
                            <span className="text-xs font-medium text-muted-foreground">
                              {period}
                            </span>
                          )}
                        </div>
                        <CardTitle className="text-sm font-medium mt-1">
                          {alarm.label}
                        </CardTitle>
                      </div>
                      <Switch
                        checked={alarm.enabled}
                        onCheckedChange={() => store.toggleAlarm(alarm.id)}
                      />
                    </CardHeader>

                    <CardContent className="space-y-3 pb-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {alarm.repeatDays.length === 0 ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            One-time
                          </Badge>
                        ) : isEveryDay ? (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Every day
                          </Badge>
                        ) : isWeekdays ? (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Weekdays
                          </Badge>
                        ) : (
                          DAY_LABELS.map(({ day, short }) => (
                            <Badge
                              key={day}
                              variant={
                                alarm.repeatDays.includes(day)
                                  ? "default"
                                  : "outline"
                              }
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {short}
                            </Badge>
                          ))
                        )}
                      </div>

                      {alarm.snoozedUntil && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Bell className="h-3 w-3" />
                          Snoozed until{" "}
                          {format(new Date(alarm.snoozedUntil), "HH:mm")}
                        </Badge>
                      )}
                    </CardContent>

                    <Separator />

                    <CardFooter className="pt-3 pb-3 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          audioEngine.playPatternOnce(
                            alarm.soundId,
                            alarm.volume,
                            alarm.customSoundUrl
                          )
                        }
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[120px]">
                          {soundOption?.name || "Chime"}
                        </span>
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditAlarmDialog(alarm)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => store.deleteAlarm(alarm.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ==================== TAB 2: TIMERS ==================== */}
        <TabsContent value="timer" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Quick Presets
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { min: 1, label: "1m" },
                  { min: 3, label: "3m" },
                  { min: 5, label: "5m Break" },
                  { min: 10, label: "10m" },
                  { min: 15, label: "15m" },
                  { min: 25, label: "25m Pomodoro" },
                  { min: 45, label: "45m" },
                  { min: 60, label: "1h" },
                ].map((p) => (
                  <Button
                    key={p.min}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleQuickTimerPreset(p.min, p.label)}
                  >
                    + {p.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.timers.map((timer) => {
              const progressPct =
                timer.durationMs > 0
                  ? Math.max(
                      0,
                      Math.min(100, (timer.remainingMs / timer.durationMs) * 100)
                    )
                  : 0;
              const formatted = formatDurationMs(timer.remainingMs, false);

              return (
                <Card key={timer.id}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {timer.label}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Duration:{" "}
                        {formatDurationMs(timer.durationMs, false).formatted}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        timer.status === "running" ? "default" : "secondary"
                      }
                      className="capitalize"
                    >
                      {timer.status}
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-4 py-4">
                    <div className="text-center font-mono">
                      <div className="text-4xl font-bold tracking-tight">
                        {formatted.formatted}
                      </div>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                  </CardContent>

                  <CardFooter className="flex items-center gap-2 pt-0">
                    {timer.status === "running" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => store.pauseTimer(timer.id)}
                      >
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => store.startOrResumeTimer(timer.id)}
                      >
                        <Play className="h-3.5 w-3.5" />{" "}
                        {timer.status === "paused" ? "Resume" : "Start"}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => store.resetTimer(timer.id)}
                      title="Reset"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => store.addTimeToTimer(timer.id, 60 * 1000)}
                    >
                      +1m
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => store.deleteTimer(timer.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ==================== TAB 3: STOPWATCH ==================== */}
        <TabsContent value="stopwatch">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-5 flex flex-col justify-between">
              <CardHeader>
                <CardTitle>Stopwatch</CardTitle>
                <CardDescription>
                  Millisecond precision with lap split tracking
                </CardDescription>
              </CardHeader>

              <CardContent className="py-8 text-center space-y-2">
                <div className="font-mono text-5xl font-bold tracking-tight">
                  {swFormatted.hours !== "00"
                    ? `${swFormatted.hours}:${swFormatted.minutes}:${swFormatted.seconds}`
                    : `${swFormatted.minutes}:${swFormatted.seconds}`}
                  <span className="text-2xl text-muted-foreground">
                    .{swFormatted.centiseconds}
                  </span>
                </div>
                {state.stopwatch.laps.length > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Current Split:{" "}
                    {formatDurationMs(currentLapElapsedMs, true).formatted}
                  </p>
                )}
              </CardContent>

              <CardFooter className="flex items-center gap-2">
                {state.stopwatch.status === "running" ? (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => store.pauseStopwatch()}
                  >
                    <Pause className="h-4 w-4" /> Stop
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => store.startStopwatch()}
                  >
                    <Play className="h-4 w-4" />{" "}
                    {state.stopwatch.elapsedMs > 0 ? "Resume" : "Start"}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  disabled={state.stopwatch.status !== "running"}
                  onClick={() => store.lapStopwatch()}
                >
                  <Flag className="h-4 w-4" /> Lap
                </Button>

                <Button
                  variant="outline"
                  disabled={
                    state.stopwatch.elapsedMs === 0 &&
                    state.stopwatch.status === "idle"
                  }
                  onClick={() => store.resetStopwatch()}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>

            <Card className="lg:col-span-7">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle>Laps ({state.stopwatch.laps.length})</CardTitle>
                  <CardDescription>
                    {state.stopwatch.laps.length > 0
                      ? `Average split: ${
                          formatDurationMs(lapStats.avgMs, true).formatted
                        }`
                      : "Record laps while the stopwatch is running"}
                  </CardDescription>
                </div>
                {state.stopwatch.laps.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyLapsToClipboard}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Markdown
                  </Button>
                )}
              </CardHeader>

              <CardContent>
                {state.stopwatch.laps.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground border rounded-md border-dashed">
                    No laps recorded yet.
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-64 pr-1 focus:outline-none">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lap</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Split Time</TableHead>
                          <TableHead className="text-right">Total Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.stopwatch.laps.map((lap) => {
                          const isFastest = lap.id === lapStats.fastestId;
                          const isSlowest = lap.id === lapStats.slowestId;
                          return (
                            <TableRow key={lap.id}>
                              <TableCell className="font-medium">
                                #{lap.lapNumber}
                              </TableCell>
                              <TableCell>
                                {isFastest && (
                                  <Badge variant="default">Fastest</Badge>
                                )}
                                {isSlowest && (
                                  <Badge variant="destructive">Slowest</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                +{formatDurationMs(lap.lapTimeMs, true).formatted}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {formatDurationMs(lap.totalTimeMs, true).formatted}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== TAB 4: WORLD CLOCK ==================== */}
        <TabsContent value="worldclock">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {state.worldClocks.map((wc) => {
              let timeStr = "";
              let dateStr = "";
              let hour24 = 12;
              try {
                timeStr = new Intl.DateTimeFormat("en-US", {
                  timeZone: wc.timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: !state.settings.use24HourFormat,
                }).format(now);
                dateStr = new Intl.DateTimeFormat("en-US", {
                  timeZone: wc.timezone,
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                }).format(now);
                const hStr = new Intl.DateTimeFormat("en-US", {
                  timeZone: wc.timezone,
                  hour: "numeric",
                  hour12: false,
                }).format(now);
                hour24 = Number(hStr);
              } catch {
                timeStr = format(
                  now,
                  state.settings.use24HourFormat ? "HH:mm" : "hh:mm a"
                );
                dateStr = format(now, "EEE, MMM d");
              }
              const isDaytime = hour24 >= 6 && hour24 < 18;

              return (
                <Card key={wc.id}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        {isDaytime ? (
                          <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {wc.city}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {wc.country}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => store.removeWorldClock(wc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono tracking-tight">
                      {timeStr}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>{dateStr}</span>
                      <span className="font-mono text-[11px]">{wc.timezone}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOG: CREATE / EDIT ALARM ==================== */}
      <Dialog open={alarmDialogOpen} onOpenChange={setAlarmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAlarmId ? "Edit Alarm" : "Create Alarm"}
            </DialogTitle>
            <DialogDescription>
              Set the alarm time, recurrence days, and sound tone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={alarmTime}
                  onChange={(e) => setAlarmTime(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Snooze Duration</Label>
                <Select value={alarmSnooze} onValueChange={setAlarmSnooze}>
                  <SelectTrigger>
                    <SelectValue placeholder="Snooze" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 Minutes</SelectItem>
                    <SelectItem value="10">10 Minutes</SelectItem>
                    <SelectItem value="15">15 Minutes</SelectItem>
                    <SelectItem value="30">30 Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="Morning Standup, Medication..."
                value={alarmLabel}
                onChange={(e) => setAlarmLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Repeat Days</Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setAlarmDays([0, 1, 2, 3, 4, 5, 6])}
                  >
                    Daily
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setAlarmDays([1, 2, 3, 4, 5])}
                  >
                    Weekdays
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setAlarmDays([])}
                  >
                    Once
                  </Button>
                </div>
              </div>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={alarmDays.map(String)}
                onValueChange={(vals) =>
                  setAlarmDays(vals.map((v) => Number(v) as DayOfWeek))
                }
                className="justify-between"
              >
                {DAY_LABELS.map(({ day, full }) => (
                  <ToggleGroupItem
                    key={day}
                    value={String(day)}
                    className="flex-1 text-xs"
                  >
                    {full}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label>Alarm Sound</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={alarmSound}
                  onValueChange={(v) => setAlarmSound(v as SoundToneId)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_TONE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    audioEngine.playPatternOnce(
                      alarmSound,
                      alarmVolume,
                      alarmCustomUrl
                    )
                  }
                >
                  <Volume2 className="h-3.5 w-3.5" /> Test
                </Button>
              </div>
            </div>

            {alarmSound === "custom-url" && (
              <div className="space-y-2">
                <Label>Custom Audio URL or Asset Path</Label>
                <Input
                  placeholder="https://example.com/alarm.mp3 or /assets/chime.mp3"
                  value={alarmCustomUrl}
                  onChange={(e) => setAlarmCustomUrl(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Volume</Label>
                <span className="text-xs text-muted-foreground">
                  {Math.round(alarmVolume * 100)}%
                </span>
              </div>
              <Slider
                min={10}
                max={100}
                step={5}
                value={[Math.round(alarmVolume * 100)]}
                onValueChange={([v]) => setAlarmVolume((v || 80) / 100)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlarmDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAlarm}>
              {editingAlarmId ? "Update Alarm" : "Save Alarm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: CREATE CUSTOM TIMER ==================== */}
      <Dialog open={timerDialogOpen} onOpenChange={setTimerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Countdown Timer</DialogTitle>
            <DialogDescription>
              Configure duration and completion sound.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={timerHours}
                  onChange={(e) => setTimerHours(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Minutes</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Seconds</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="Deep Focus, Workout, Reading..."
                value={timerLabel}
                onChange={(e) => setTimerLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Completion Sound</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={timerSound}
                  onValueChange={(v) => setTimerSound(v as SoundToneId)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_TONE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    audioEngine.playPatternOnce(
                      timerSound,
                      state.settings.defaultVolume,
                      timerCustomUrl
                    )
                  }
                >
                  <Volume2 className="h-3.5 w-3.5" /> Test
                </Button>
              </div>
            </div>

            {timerSound === "custom-url" && (
              <div className="space-y-2">
                <Label>Custom Audio URL</Label>
                <Input
                  placeholder="https://example.com/sound.mp3"
                  value={timerCustomUrl}
                  onChange={(e) => setTimerCustomUrl(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateTimer(false)}>
              Save Preset
            </Button>
            <Button onClick={() => handleCreateTimer(true)}>
              <Play className="h-3.5 w-3.5" /> Start Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: ADD WORLD CLOCK ==================== */}
      <Dialog open={wcDialogOpen} onOpenChange={setWcDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add World Clock</DialogTitle>
            <DialogDescription>
              Select a global city or enter an IANA timezone identifier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-2">
              <Label>City</Label>
              <Select
                value={selectedPresetIdx}
                onValueChange={setSelectedPresetIdx}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_WORLD_CITIES.map((c, idx) => (
                    <SelectItem key={c.timezone + c.city} value={String(idx)}>
                      {c.city} ({c.country}) — {c.timezone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Custom City Name</Label>
                <Input
                  placeholder="e.g. Zurich"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>IANA Timezone</Label>
                <Input
                  placeholder="e.g. Europe/Zurich"
                  value={customTz}
                  onChange={(e) => setCustomTz(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWcDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddWorldClock}>Add Clock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
