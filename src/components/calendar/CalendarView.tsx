import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  AlertCircle,
  Bell,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudDownload,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  Info,
  KeyRound,
  Link2,
  Lock,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  Users,
  UserX,
  Video,
} from "lucide-react";
import { showMessage } from "siyuan";
import type { App } from "siyuan";
import { LinkifiedText } from "@/components/common/LinkifiedText";
import {
  CalendarEventItem,
  EventAttachment,
  EventAttendee,
  GoogleCalendarAccount,
  GoogleIntegrationMode,
  ReminderPriority,
  ReminderRecurrence,
} from "@/types/temporal";
import { useTemporalStore } from "@/services/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

type CalendarDisplayMode = "month" | "week" | "agenda";
type CreationItemType = "event" | "reminder";

const EVENT_COLORS = [
  { name: "Blue", value: "#2563eb" },
  { name: "Zinc", value: "#3f3f46" },
  { name: "Emerald", value: "#059669" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Amber", value: "#d97706" },
  { name: "Rose", value: "#e11d48" },
];

interface CalendarViewProps {
  siyuanApp?: App;
}

function formatDurationString(startISO: string, endISO?: string, allDay?: boolean): string {
  if (allDay) return "All day";
  if (!endISO) return "";
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const diffMinutes = Math.round((end - start) / 60000);
  if (diffMinutes <= 0) return "";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ siyuanApp }) => {
  const { state, navigation, version, store } = useTemporalStore();

  const [displayMode, setDisplayMode] = useState<CalendarDisplayMode>("month");
  const [showInspector, setShowInspector] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);
  const userExplicitToggledRef = useRef<boolean>(false);
  const prevWidthRef = useRef<number | null>(null);

  // Auto-hide threshold: below 980px, side-by-side squishes calendar & inspector
  const SIDE_BY_SIDE_THRESHOLD = 980;
  const isWideContainer = containerWidth >= SIDE_BY_SIDE_THRESHOLD;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = (width: number) => {
      if (width <= 0) return;
      setContainerWidth(width);
      const prevWidth = prevWidthRef.current;
      prevWidthRef.current = width;

      if (prevWidth !== null) {
        // When manually resized smaller past threshold -> automatically hide inspector to prevent squishing
        if (prevWidth >= SIDE_BY_SIDE_THRESHOLD && width < SIDE_BY_SIDE_THRESHOLD) {
          setShowInspector(false);
        }
        // When resized larger past threshold -> restore inspector if user didn't explicitly close it
        else if (prevWidth < SIDE_BY_SIDE_THRESHOLD && width >= SIDE_BY_SIDE_THRESHOLD) {
          if (!userExplicitToggledRef.current) {
            setShowInspector(true);
          }
        }
      } else {
        // Initial check on mount
        if (width < SIDE_BY_SIDE_THRESHOLD) {
          setShowInspector(false);
        }
      }
    };

    const initialWidth = Math.round(containerRef.current.clientWidth);
    if (initialWidth > 0) {
      updateWidth(initialWidth);
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        updateWidth(width);
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleToggleInspector = () => {
    setShowInspector((prev) => {
      const next = !prev;
      if (isWideContainer && !next) {
        userExplicitToggledRef.current = true;
      } else if (next) {
        userExplicitToggledRef.current = false;
      }
      return next;
    });
  };

  const [detailsEvent, setDetailsEvent] = useState<CalendarEventItem | null>(null);
  const [attendeeFilter, setAttendeeFilter] = useState<
    "all" | "accepted" | "declined" | "tentative" | "needsAction"
  >("all");
  const [viewDate, setViewDate] = useState<Date>(() =>
    navigation.selectedCalendarDateISO
      ? new Date(navigation.selectedCalendarDateISO)
      : new Date()
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() =>
    navigation.selectedCalendarDateISO
      ? new Date(navigation.selectedCalendarDateISO)
      : new Date()
  );

  useEffect(() => {
    if (!navigation.selectedCalendarDateISO) return;
    const dt = new Date(navigation.selectedCalendarDateISO);
    if (!isNaN(dt.getTime())) {
      setSelectedDate(dt);
      setViewDate(dt);
    }
  }, [navigation.selectedCalendarDateISO]);

  const handleSelectDate = (day: Date) => {
    setSelectedDate(day);
    store.setSelectedCalendarDate(day);
  };

  // ==================== EVENT / REMINDER DIALOG STATE ====================
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [creationType, setCreationType] = useState<CreationItemType>("event");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evLocation, setEvLocation] = useState("");
  const [evDateStr, setEvDateStr] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [evStartTime, setEvStartTime] = useState("10:00");
  const [evEndTime, setEvEndTime] = useState("11:00");
  const [evAllDay, setEvAllDay] = useState(false);
  const [evColor, setEvColor] = useState("#2563eb");
  const [evTargetAccount, setEvTargetAccount] = useState("local");

  // Reminder-specific fields when creating a reminder from Calendar
  const [remRecurrence, setRemRecurrence] =
    useState<ReminderRecurrence>("none");
  const [remPriority, setRemPriority] = useState<ReminderPriority>("medium");
  const [remCategory, setRemCategory] = useState("Personal");

  // ==================== GOOGLE CALENDAR DIALOG STATE ====================
  const [gcalDialogOpen, setGcalDialogOpen] = useState(false);
  const [gcalHelpOpen, setGcalHelpOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [gcalName, setGcalName] = useState("Personal Google Calendar");
  const [gcalMode, setGcalMode] = useState<GoogleIntegrationMode>("ical");
  const [gcalIcalUrl, setGcalIcalUrl] = useState("");
  const [gcalCalendarId, setGcalCalendarId] = useState("primary");
  const [gcalAccessToken, setGcalAccessToken] = useState("");
  const [gcalRefreshToken, setGcalRefreshToken] = useState("");
  const [gcalClientId, setGcalClientId] = useState("");
  const [gcalClientSecret, setGcalClientSecret] = useState("");
  const [gcalApiKey, setGcalApiKey] = useState("");
  const [gcalColor, setGcalColor] = useState("#2563eb");

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const monthDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weekStart = startOfWeek(viewDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(viewDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const allUnifiedEvents = useMemo<CalendarEventItem[]>(() => {
    const rangeStart = startOfDay(subDays(gridStart, 7));
    const rangeEnd = endOfDay(addDays(gridEnd, 60));
    return store.getUnifiedCalendarItemsForRange(rangeStart, rangeEnd);
  }, [
    gridStart.getTime(),
    gridEnd.getTime(),
    state.localEvents,
    state.googleEvents,
    state.googleAccounts,
    state.reminders,
    state.settings.showRemindersInCalendar,
    version,
  ]);

  const getEventsForDay = (day: Date): CalendarEventItem[] => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + 24 * 3600 * 1000 - 1;

    return allUnifiedEvents.filter((ev) => {
      const s = new Date(ev.startISO).getTime();
      const e = new Date(ev.endISO || ev.startISO).getTime();
      if (isNaN(s)) return false;
      return (
        isSameDay(new Date(s), day) || (s <= dayEnd && Math.max(s, e) >= dayStart)
      );
    });
  };

  const selectedDayEvents = useMemo(
    () => getEventsForDay(selectedDate),
    [selectedDate, allUnifiedEvents, version]
  );

  const openAddEventForDate = (
    date: Date,
    defaultType: CreationItemType = "event"
  ) => {
    setEditingEventId(null);
    setCreationType(defaultType);
    setEvTitle("");
    setEvDesc("");
    setEvLocation("");
    setEvDateStr(format(date, "yyyy-MM-dd"));
    setEvStartTime("10:00");
    setEvEndTime("11:00");
    setEvAllDay(false);
    setEvColor("#2563eb");
    setEvTargetAccount("local");
    setRemRecurrence("none");
    setRemPriority("medium");
    setRemCategory("Personal");
    setEventDialogOpen(true);
  };

  const openEditLocalEvent = (ev: CalendarEventItem) => {
    const sDt = new Date(ev.startISO);
    const eDt = new Date(ev.endISO || ev.startISO);
    setEditingEventId(ev.id);
    setCreationType("event");
    setEvTitle(ev.title);
    setEvDesc(ev.description || "");
    setEvLocation(ev.location || "");
    setEvDateStr(format(sDt, "yyyy-MM-dd"));
    setEvStartTime(format(sDt, "HH:mm"));
    setEvEndTime(format(eDt, "HH:mm"));
    setEvAllDay(ev.allDay);
    setEvColor(ev.color || "#2563eb");
    setEvTargetAccount("local");
    setEventDialogOpen(true);
  };

  const handleSaveEvent = () => {
    if (!evTitle.trim()) {
      showMessage("Please enter a title", 3000, "error");
      return;
    }
    const [y, m, d] = evDateStr.split("-").map(Number);
    const [sH, sM] = evStartTime.split(":").map(Number);
    const [eH, eM] = evEndTime.split(":").map(Number);

    if (creationType === "reminder" && !editingEventId) {
      const remDt = new Date(y, m - 1, d, sH || 9, sM || 0, 0);
      store.addReminder({
        title: evTitle.trim(),
        description: evDesc.trim() || undefined,
        datetimeISO: remDt.toISOString(),
        recurrence: remRecurrence,
        priority: remPriority,
        category: remCategory.trim() || "Personal",
        soundId: state.settings.defaultSoundId,
      });
      setEventDialogOpen(false);
      return;
    }

    const startDt = evAllDay
      ? new Date(y, m - 1, d, 0, 0, 0)
      : new Date(y, m - 1, d, sH || 0, sM || 0, 0);
    const endDt = evAllDay
      ? new Date(y, m - 1, d, 23, 59, 59)
      : new Date(y, m - 1, d, eH || (sH || 0) + 1, eM || 0, 0);

    if (editingEventId) {
      store.updateLocalEvent(editingEventId, {
        title: evTitle.trim(),
        description: evDesc.trim() || undefined,
        location: evLocation.trim() || undefined,
        startISO: startDt.toISOString(),
        endISO: endDt.toISOString(),
        allDay: evAllDay,
        color: evColor,
      });
      showMessage(`Updated "${evTitle.trim()}"`, 2500, "info");
    } else {
      store.addLocalEvent({
        title: evTitle.trim(),
        description: evDesc.trim() || undefined,
        location: evLocation.trim() || undefined,
        startISO: startDt.toISOString(),
        endISO: endDt.toISOString(),
        allDay: evAllDay,
        color: evColor,
        pushToGoogleAccountId:
          evTargetAccount !== "local" ? evTargetAccount : undefined,
      });
    }

    setEventDialogOpen(false);
  };

  const handleStartEditAccount = (acc: GoogleCalendarAccount) => {
    setEditingAccountId(acc.id);
    setGcalName(acc.name);
    setGcalMode(acc.mode);
    setGcalColor(acc.color || "#2563eb");
    setGcalIcalUrl(acc.icalUrl || "");
    setGcalCalendarId(acc.calendarId || "primary");
    setGcalAccessToken(acc.accessToken || "");
    setGcalRefreshToken(acc.refreshToken || "");
    setGcalClientId(acc.clientId || "");
    setGcalClientSecret(acc.clientSecret || "");
    setGcalApiKey(acc.apiKey || "");
  };

  const handleCancelEditAccount = () => {
    setEditingAccountId(null);
    setGcalName("Personal Google Calendar");
    setGcalMode("ical");
    setGcalColor("#2563eb");
    setGcalIcalUrl("");
    setGcalCalendarId("primary");
    setGcalAccessToken("");
    setGcalRefreshToken("");
    setGcalClientId("");
    setGcalClientSecret("");
    setGcalApiKey("");
  };

  const handleConnectGoogleAccount = () => {
    if (!gcalName.trim()) {
      showMessage("Please provide a calendar name", 3000, "error");
      return;
    }
    if (gcalMode === "ical" && !gcalIcalUrl.trim()) {
      showMessage("Please paste your Google Calendar .ics URL", 3500, "error");
      return;
    }
    if (
      gcalMode === "oauth" &&
      !gcalAccessToken.trim() &&
      !gcalRefreshToken.trim()
    ) {
      showMessage(
        "Please provide an OAuth Access Token or Refresh Token",
        3500,
        "error"
      );
      return;
    }
    if (
      gcalMode === "oauth" &&
      gcalRefreshToken.trim() &&
      (!gcalClientId.trim() || !gcalClientSecret.trim())
    ) {
      showMessage(
        "Permanent auto-refresh requires both OAuth Client ID and Client Secret",
        4000,
        "error"
      );
      return;
    }
    if (gcalMode === "apikey" && !gcalApiKey.trim()) {
      showMessage("Please provide your Google API Key", 3500, "error");
      return;
    }

    if (editingAccountId) {
      store.updateGoogleAccount(editingAccountId, {
        name: gcalName.trim(),
        mode: gcalMode,
        icalUrl: gcalMode === "ical" ? gcalIcalUrl.trim() || undefined : undefined,
        calendarId: gcalCalendarId.trim() || "primary",
        accessToken:
          gcalMode === "oauth" ? gcalAccessToken.trim() || undefined : undefined,
        refreshToken:
          gcalMode === "oauth" ? gcalRefreshToken.trim() || undefined : undefined,
        clientId:
          gcalMode === "oauth" ? gcalClientId.trim() || undefined : undefined,
        clientSecret:
          gcalMode === "oauth" ? gcalClientSecret.trim() || undefined : undefined,
        apiKey:
          gcalMode === "apikey" ? gcalApiKey.trim() || undefined : undefined,
        color: gcalColor,
      });

      store
        .syncSingleGoogleAccount(editingAccountId)
        .then((count) =>
          showMessage(
            `Updated and synced ${count} events from "${gcalName.trim()}"`,
            3500,
            "info"
          )
        )
        .catch((e) => showMessage(e.message, 4000, "error"));

      handleCancelEditAccount();
      return;
    }

    store.addGoogleAccount({
      name: gcalName.trim(),
      mode: gcalMode,
      icalUrl: gcalIcalUrl.trim() || undefined,
      calendarId: gcalCalendarId.trim() || "primary",
      accessToken: gcalAccessToken.trim() || undefined,
      refreshToken: gcalRefreshToken.trim() || undefined,
      clientId: gcalClientId.trim() || undefined,
      clientSecret: gcalClientSecret.trim() || undefined,
      apiKey: gcalApiKey.trim() || undefined,
      color: gcalColor,
      enabled: true,
    });

    handleCancelEditAccount();
    showMessage(`Added "${gcalName.trim()}" and started syncing`, 3500, "info");
  };

  const handleNavigatePrev = () => {
    if (displayMode === "week") setViewDate(subWeeks(viewDate, 1));
    else setViewDate(subMonths(viewDate, 1));
  };

  const handleNavigateNext = () => {
    if (displayMode === "week") setViewDate(addWeeks(viewDate, 1));
    else setViewDate(addMonths(viewDate, 1));
  };

  const handleNavigateToday = () => {
    const today = new Date();
    setViewDate(today);
    handleSelectDate(today);
  };

  const oauthAccounts = state.googleAccounts.filter(
    (a) => a.enabled && a.mode === "oauth" && a.accessToken
  );

  return (
    <div ref={containerRef} className="space-y-6 min-w-0 max-w-full">
      {/* Top Toolbar */}
      <div
        className={cn(
          "flex justify-between gap-4",
          isWideContainer ? "flex-row items-center" : "flex-col"
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNavigatePrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleNavigateToday}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNavigateNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-lg font-semibold tracking-tight">
            {displayMode === "week"
              ? `${format(weekStart, "MMM d")} – ${format(
                  weekEnd,
                  "MMM d, yyyy"
                )}`
              : format(viewDate, "MMMM yyyy")}
          </h2>

          <Tabs
            value={displayMode}
            onValueChange={(v) => setDisplayMode(v as CalendarDisplayMode)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="month" className="text-xs">
                Month
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs">
                Week
              </TabsTrigger>
              <TabsTrigger value="agenda" className="text-xs">
                Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 h-8 rounded-md border text-xs text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            <span>Show Reminders</span>
            <Switch
              checked={state.settings.showRemindersInCalendar}
              onCheckedChange={(checked) =>
                store.updateSettings({ showRemindersInCalendar: checked })
              }
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setGcalDialogOpen(true)}
          >
            <CloudDownload className="h-4 w-4" />
            Google Calendar
            {state.googleAccounts.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {state.googleAccounts.filter((a) => a.enabled).length}
              </Badge>
            )}
          </Button>

          {state.googleAccounts.some((a) => a.enabled) && (
            <Button
              variant="outline"
              size="sm"
              disabled={navigation.isSyncingGoogle}
              onClick={() => store.syncAllGoogleCalendars(false)}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  navigation.isSyncingGoogle && "animate-spin"
                )}
              />
              {navigation.isSyncingGoogle ? "Syncing..." : "Sync"}
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => openAddEventForDate(selectedDate, "event")}
          >
            <Plus className="h-4 w-4" />
            New Item
          </Button>

          <Button
            variant={showInspector ? "secondary" : "outline"}
            size="icon"
            onClick={handleToggleInspector}
            className="h-8 w-8 shrink-0"
            title={showInspector ? "Hide side panel" : "Show side panel"}
            aria-label={showInspector ? "Hide side panel" : "Show side panel"}
          >
            {showInspector ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Calendar Grid + Inspector */}
      <div
        className={cn(
          "grid gap-6 min-w-0 max-w-full",
          isWideContainer && showInspector ? "grid-cols-12" : "grid-cols-1"
        )}
      >
        <Card
          className={cn(
            "overflow-hidden min-w-0 shadow-sm",
            isWideContainer && showInspector ? "col-span-7 xl:col-span-8" : "col-span-12"
          )}
        >
          {displayMode === "month" && (
            <CardContent className="p-0">
              <div className="grid grid-cols-7 border-b bg-muted/40">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="py-2.5 text-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {monthDays.map((day, idx) => {
                  const dayEvents = getEventsForDay(day);
                  const inMonth = isSameMonth(day, monthStart);
                  const selected = isSameDay(day, selectedDate);
                  const today = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => handleSelectDate(day)}
                      onDoubleClick={() => openAddEventForDate(day, "event")}
                      className={cn(
                        "h-[128px] p-2 border-b border-r transition-colors cursor-pointer flex flex-col group overflow-hidden",
                        idx % 7 === 6 && "border-r-0",
                        !inMonth && "bg-muted/20 text-muted-foreground/50",
                        selected && "bg-accent/50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5 shrink-0">
                        <span
                          className={cn(
                            "text-xs font-medium w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                            today && "bg-primary text-primary-foreground font-semibold shadow-xs",
                            !today && selected && "font-semibold underline"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded-full bg-muted/80">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                        {dayEvents.map((ev) => (
                          <div
                            key={ev.id}
                            title={`${ev.title}${ev.allDay ? " (All Day)" : ` (${format(new Date(ev.startISO), "HH:mm")})`}${ev.location ? ` • ${ev.location}` : ""}\nClick to view full event info`}
                            className={cn(
                              "px-2 py-1 rounded-md text-[11px] font-medium text-white flex items-center gap-1.5 shadow-xs transition-opacity hover:opacity-90 select-none cursor-pointer",
                              ev.completed && "line-through opacity-55"
                            )}
                            style={{
                              backgroundColor: ev.color || "#2563eb",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDate(day);
                              setDetailsEvent(ev);
                            }}
                          >
                            {ev.source === "reminder" && (
                              <Bell className="h-3 w-3 shrink-0 opacity-95" />
                            )}
                            {ev.meetLink && (
                              <Video className="h-3 w-3 shrink-0 opacity-95" />
                            )}
                            {!ev.allDay && (
                              <span className="opacity-90 font-mono text-[10px] shrink-0">
                                {format(new Date(ev.startISO), "HH:mm")}
                              </span>
                            )}
                            <span className="truncate min-w-0 flex-1 leading-tight">{ev.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}

          {displayMode === "week" && (
            <CardContent className="p-0">
              <div className="grid grid-cols-7 divide-x h-[520px]">
                {weekDays.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const today = isToday(day);
                  const selected = isSameDay(day, selectedDate);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => handleSelectDate(day)}
                      onDoubleClick={() => openAddEventForDate(day, "event")}
                      className={cn(
                        "flex flex-col p-2.5 cursor-pointer transition-colors h-full overflow-hidden",
                        selected && "bg-accent/40"
                      )}
                    >
                      <div className="text-center pb-2.5 mb-2 border-b shrink-0">
                        <div className="text-xs text-muted-foreground font-medium">
                          {format(day, "EEE")}
                        </div>
                        <div
                          className={cn(
                            "mx-auto mt-1 h-7 w-7 rounded-md flex items-center justify-center text-xs font-semibold transition-colors",
                            today && "bg-primary text-primary-foreground shadow-xs"
                          )}
                        >
                          {format(day, "d")}
                        </div>
                        {dayEvents.length > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {dayEvents.length} item{dayEvents.length > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 flex-1 overflow-y-auto pr-1 pb-2">
                        {dayEvents.length === 0 ? (
                          <div className="py-8 text-center text-xs text-muted-foreground/60 italic">
                            No items
                          </div>
                        ) : (
                          dayEvents.map((ev) => (
                            <div
                              key={ev.id}
                              title={`${ev.title}${ev.allDay ? " (All Day)" : ` (${format(new Date(ev.startISO), "HH:mm")})`}${ev.location ? ` • ${ev.location}` : ""}\nClick to view full event info`}
                              className={cn(
                                "p-2 rounded-md text-xs text-white shadow-xs transition-opacity hover:opacity-90 select-none cursor-pointer",
                                ev.completed && "line-through opacity-60"
                              )}
                              style={{ backgroundColor: ev.color || "#2563eb" }}
                              onClick={() => {
                                handleSelectDate(day);
                                setDetailsEvent(ev);
                              }}
                            >
                              <div className="font-medium truncate flex items-center gap-1.5 leading-tight">
                                {ev.source === "reminder" && (
                                  <Bell className="h-3 w-3 shrink-0 opacity-95" />
                                )}
                                <span className="truncate min-w-0 flex-1">{ev.title}</span>
                              </div>
                              <div className="text-[10px] opacity-90 font-mono mt-1">
                                {ev.allDay
                                  ? "All Day"
                                  : `${format(new Date(ev.startISO), "HH:mm")}${ev.endISO ? ` – ${format(new Date(ev.endISO), "HH:mm")}` : ""}`}
                              </div>
                              {ev.location && (
                                <div className="text-[10px] opacity-80 truncate mt-0.5 flex items-center gap-1">
                                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{ev.location}</span>
                                </div>
                              )}
                              {ev.meetLink && (
                                <a
                                  href={ev.meetLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-semibold truncate mt-1 flex items-center gap-1 text-emerald-100 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Video className="h-3 w-3 shrink-0" />
                                  <span>Join Meeting</span>
                                </a>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}

          {displayMode === "agenda" && (
            <CardContent className="p-0">
              {allUnifiedEvents.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No upcoming events or reminders scheduled.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date &amp; Time</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUnifiedEvents.map((ev) => {
                      const startDt = new Date(ev.startISO);
                      return (
                        <TableRow
                          key={ev.id}
                          className={cn(
                            "cursor-pointer",
                            ev.completed && "opacity-60"
                          )}
                          onClick={() => {
                            handleSelectDate(startDt);
                            setDetailsEvent(ev);
                          }}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            <div>{format(startDt, "yyyy-MM-dd")}</div>
                            <div className="text-muted-foreground">
                              {ev.allDay
                                ? "All Day"
                                : ev.source === "reminder"
                                ? format(startDt, "HH:mm")
                                : `${format(startDt, "HH:mm")} – ${format(
                                    new Date(ev.endISO),
                                    "HH:mm"
                                  )}`}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {ev.source === "reminder" && ev.reminderId ? (
                                <Checkbox
                                  checked={Boolean(ev.completed)}
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={(checked) =>
                                    store.completeReminder(
                                      ev.reminderId!,
                                      Boolean(checked)
                                    )
                                  }
                                />
                              ) : (
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: ev.color || "#2563eb",
                                  }}
                                />
                              )}
                              <span
                                className={cn(
                                  "font-medium",
                                  ev.completed && "line-through text-muted-foreground"
                                )}
                              >
                                <LinkifiedText text={ev.title} siyuanApp={siyuanApp} />
                              </span>
                            </div>
                            {ev.location && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <LinkifiedText text={ev.location} siyuanApp={siyuanApp} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {ev.calendarName || ev.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="View All Event Details"
                                onClick={() => setDetailsEvent(ev)}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </Button>
                              {ev.source === "reminder" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => store.setSection("reminders")}
                                >
                                  Reminders
                                </Button>
                              )}
                              {ev.source === "local" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditLocalEvent(ev)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {ev.meetLink && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-600 hover:text-white"
                                  title="Join Video Meeting"
                                  asChild
                                >
                                  <a
                                    href={ev.meetLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    Join
                                  </a>
                                </Button>
                              )}
                              {ev.htmlLink && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Open in Google Calendar"
                                  asChild
                                >
                                  <a
                                    href={ev.htmlLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => store.deleteCalendarEvent(ev.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          )}
        </Card>

        {/* Right Day Inspector & Google Calendars */}
        {showInspector && (
          <div
            className={cn(
              "space-y-6 min-w-0 max-w-full",
              isWideContainer ? "col-span-5 xl:col-span-4" : "col-span-12"
            )}
          >
            <Card className="min-w-0 max-w-full overflow-hidden shadow-sm">
              <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0 pb-3 min-w-0">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">
                    {format(selectedDate, "EEEE, MMM d")}
                  </CardTitle>
                  <CardDescription className="truncate">
                    {selectedDayEvents.length} scheduled item
                    {selectedDayEvents.length === 1 ? "" : "s"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => openAddEventForDate(selectedDate, "reminder")}
                    title="Add Reminder on this date"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    <span>+ Reminder</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => openAddEventForDate(selectedDate, "event")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+ Event</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="min-w-0">
                {selectedDayEvents.length === 0 ? (
                  <div className="py-8 text-center border border-dashed rounded-md">
                    <CalendarDays className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      No events or reminders on {format(selectedDate, "MMM d")}.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-y-auto overflow-x-hidden max-h-[480px] space-y-2.5 pr-1 min-w-0 max-w-full">
                    {selectedDayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className={cn(
                          "p-3 rounded-xl border bg-card/60 backdrop-blur-sm space-y-2 transition-all hover:bg-card/90 shadow-xs min-w-0 max-w-full overflow-hidden",
                          ev.completed && "opacity-60 bg-muted/30"
                        )}
                      >
                        {/* Top row: Checkbox/Dot + Full Title + Action Buttons */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {ev.source === "reminder" && ev.reminderId ? (
                              <div className="pt-0.5 shrink-0">
                                <Checkbox
                                  checked={Boolean(ev.completed)}
                                  onCheckedChange={(checked) =>
                                    store.completeReminder(
                                      ev.reminderId!,
                                      Boolean(checked)
                                    )
                                  }
                                />
                              </div>
                            ) : (
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5"
                                style={{ backgroundColor: ev.color || "#2563eb" }}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <h4
                                className={cn(
                                  "text-sm font-semibold text-foreground leading-snug break-words",
                                  ev.completed && "line-through text-muted-foreground"
                                )}
                              >
                                <LinkifiedText text={ev.title} siyuanApp={siyuanApp} />
                              </h4>
                            </div>
                          </div>

                          {/* Actions: compact, contained icon buttons that wrap cleanly inside card */}
                          <div className="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => setDetailsEvent(ev)}
                              title="View All Event Details"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                            {ev.htmlLink && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                title="Open in Google Calendar"
                                asChild
                              >
                                <a
                                  href={ev.htmlLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            {ev.source === "reminder" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => store.setSection("reminders")}
                                title="Open in Reminders view"
                              >
                                <Bell className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {ev.source === "local" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => openEditLocalEvent(ev)}
                                title="Edit Event"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => store.deleteCalendarEvent(ev.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Time, Recurrence & Calendar badges */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground min-w-0 max-w-full">
                          <span className="inline-flex items-center gap-1.5 font-mono bg-muted/60 px-2 py-0.5 rounded-md text-[11px]">
                            <Clock className="h-3 w-3 text-primary shrink-0" />
                            {ev.allDay
                              ? "All Day"
                              : ev.source === "reminder"
                              ? format(new Date(ev.startISO), "HH:mm")
                              : `${format(new Date(ev.startISO), "HH:mm")}${ev.endISO ? ` – ${format(new Date(ev.endISO), "HH:mm")}` : ""}`}
                            {!ev.allDay && ev.endISO && (
                              <span className="opacity-70 ml-0.5">
                                ({formatDurationString(ev.startISO, ev.endISO, ev.allDay)})
                              </span>
                            )}
                          </span>

                          {ev.recurrence && ev.recurrence !== "none" && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1 px-1.5 py-0.5 capitalize"
                            >
                              <Repeat className="h-2.5 w-2.5 text-primary" />
                              {ev.recurrence}
                            </Badge>
                          )}

                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            {ev.calendarName || ev.source}
                          </Badge>

                          {ev.status && ev.status !== "confirmed" && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0.5 capitalize"
                            >
                              {ev.status}
                            </Badge>
                          )}

                          {ev.transparency && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 capitalize">
                              <Briefcase className="h-2.5 w-2.5 mr-1 opacity-70" />
                              {ev.transparency === "opaque" ? "Busy" : "Free"}
                            </Badge>
                          )}

                          {ev.visibility && ev.visibility !== "default" && ev.visibility !== "public" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 capitalize">
                              <Lock className="h-2.5 w-2.5 mr-1 opacity-70" />
                              {ev.visibility}
                            </Badge>
                          )}
                        </div>

                        {/* Video Meeting Callout if present */}
                        {ev.meetLink && (
                          <div className="pt-0.5 space-y-1 min-w-0 max-w-full">
                            <a
                              href={ev.meetLink}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-xs text-foreground transition-all group min-w-0 max-w-full overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="h-6 w-6 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                  <Video className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-emerald-700 dark:text-emerald-300 leading-tight truncate">
                                    Join Video Meeting
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                                    {ev.meetLink}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform shrink-0 ml-1">
                                Join <ExternalLink className="h-3 w-3" />
                              </span>
                            </a>

                            {(ev.conferenceDetails?.phoneUri || ev.conferenceDetails?.phonePin) && (
                              <div className="text-[11px] text-muted-foreground px-1.5 flex items-center gap-1.5 min-w-0 max-w-full truncate">
                                <Phone className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="truncate">
                                  Dial-in: {ev.conferenceDetails.phoneUri || ""}{" "}
                                  {ev.conferenceDetails.phonePin ? `• PIN: ${ev.conferenceDetails.phonePin}` : ""}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Attachments & Files if present */}
                        {ev.attachments && ev.attachments.length > 0 && (
                          <div className="pt-0.5 space-y-1 min-w-0 max-w-full">
                            <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                              <Paperclip className="h-3 w-3 text-primary shrink-0" />
                              <span>Attachments ({ev.attachments.length})</span>
                            </div>
                            <div className="flex flex-col gap-1 min-w-0 max-w-full">
                              {ev.attachments.map((att, idx) => (
                                <a
                                  key={idx}
                                  href={att.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted text-xs transition-colors group min-w-0 max-w-full overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <span className="truncate font-medium flex-1">{att.title}</span>
                                  </div>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0 ml-1" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Organizer / Host if present */}
                        {ev.organizer && (
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5 min-w-0 max-w-full truncate">
                            <User className="h-3 w-3 text-primary shrink-0" />
                            <span className="truncate">
                              Host: {ev.organizer.displayName || ev.organizer.email}
                              {ev.organizer.self ? " (You)" : ""}
                            </span>
                          </div>
                        )}

                        {/* Attendees preview if present */}
                        {ev.attendees && ev.attendees.length > 0 && (
                          <button
                            type="button"
                            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 pt-0.5 text-left transition-colors cursor-pointer min-w-0 max-w-full truncate"
                            onClick={() => setDetailsEvent(ev)}
                          >
                            <Users className="h-3 w-3 text-primary shrink-0" />
                            <span className="truncate">
                              {ev.attendees.length} Attendees
                              {(() => {
                                const acc = ev.attendees.filter((a) => a.responseStatus === "accepted").length;
                                const dec = ev.attendees.filter((a) => a.responseStatus === "declined").length;
                                const parts: string[] = [];
                                if (acc) parts.push(`${acc} accepted`);
                                if (dec) parts.push(`${dec} declined`);
                                return parts.length > 0 ? ` (${parts.join(", ")})` : "";
                              })()}
                              {" • View roster"}
                            </span>
                          </button>
                        )}

                        {/* Location if present */}
                        {ev.location && (
                          <div className="text-xs text-muted-foreground flex items-center justify-between gap-1.5 pt-0.5 min-w-0 max-w-full">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="truncate flex-1">
                                <LinkifiedText
                                  text={ev.location}
                                  siyuanApp={siyuanApp}
                                  className="truncate leading-tight"
                                />
                              </span>
                            </div>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary hover:underline shrink-0 ml-1"
                              onClick={(e) => e.stopPropagation()}
                              title="Open in Google Maps"
                            >
                              Maps
                            </a>
                          </div>
                        )}

                        {/* Description / Notes if present */}
                        {ev.description && (
                          <div className="text-xs text-muted-foreground pt-1.5 border-t border-border/60 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto overflow-x-hidden min-w-0 max-w-full">
                            <LinkifiedText
                              text={ev.description}
                              siyuanApp={siyuanApp}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 max-w-full overflow-hidden shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 min-w-0">
                <div className="min-w-0">
                  <CardTitle className="text-sm truncate">Google Calendars</CardTitle>
                  <CardDescription className="text-xs truncate">
                    Connected personal feeds
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0 ml-2"
                  onClick={() => setGcalDialogOpen(true)}
                >
                  Manage
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-56 overflow-y-auto overflow-x-hidden pr-1 min-w-0">
                {state.googleAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No Google Calendar connected yet.
                  </p>
                ) : (
                  state.googleAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md border text-xs min-w-0 max-w-full overflow-hidden"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: acc.color }}
                        />
                        <div className="truncate flex-1">
                          <div className="font-medium truncate">{acc.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {acc.lastSyncError ? (
                              <span className="text-destructive truncate">
                                {acc.lastSyncError}
                              </span>
                            ) : acc.lastSyncedAt ? (
                              `Synced ${format(new Date(acc.lastSyncedAt), "HH:mm")}`
                            ) : (
                              "Ready"
                            )}
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={acc.enabled}
                        className="shrink-0 ml-2"
                        onCheckedChange={(checked) =>
                          store.updateGoogleAccount(acc.id, { enabled: checked })
                        }
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ==================== DIALOG: NEW / EDIT CALENDAR ITEM ==================== */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEventId
                ? "Edit Calendar Event"
                : creationType === "reminder"
                ? "New Custom Reminder"
                : "New Calendar Event"}
            </DialogTitle>
            <DialogDescription>
              {editingEventId
                ? "Update this calendar event."
                : "Create an event or a custom reminder synchronized across Calendar and Reminders."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0 pr-1">
            {!editingEventId && (
              <Tabs
                value={creationType}
                onValueChange={(v) => setCreationType(v as CreationItemType)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="event" className="gap-1.5 text-xs">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Calendar Event
                  </TabsTrigger>
                  <TabsTrigger value="reminder" className="gap-1.5 text-xs">
                    <Bell className="h-3.5 w-3.5" />
                    Custom Reminder
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder={
                  creationType === "reminder"
                    ? "Submit tax documents, Call dentist..."
                    : "Product Sync, Flight..."
                }
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
              />
            </div>

            {creationType === "reminder" && !editingEventId ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={evDateStr}
                      onChange={(e) => setEvDateStr(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={evStartTime}
                      onChange={(e) => setEvStartTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Repeat</Label>
                    <Select
                      value={remRecurrence}
                      onValueChange={(v) =>
                        setRemRecurrence(v as ReminderRecurrence)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">One-Time</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={remPriority}
                      onValueChange={(v) =>
                        setRemPriority(v as ReminderPriority)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={remCategory}
                      onChange={(e) => setRemCategory(e.target.value)}
                      placeholder="Personal"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    placeholder="Additional details..."
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={evDateStr}
                      onChange={(e) => setEvDateStr(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end">
                    <div className="flex items-center justify-between h-9 px-3 rounded-md border">
                      <Label>All-Day</Label>
                      <Switch checked={evAllDay} onCheckedChange={setEvAllDay} />
                    </div>
                  </div>
                </div>

                {!evAllDay && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={evStartTime}
                        onChange={(e) => setEvStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={evEndTime}
                        onChange={(e) => setEvEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Location (Optional)</Label>
                  <Input
                    placeholder="Google Meet, Office..."
                    value={evLocation}
                    onChange={(e) => setEvLocation(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea
                    placeholder="Notes..."
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Select value={evColor} onValueChange={setEvColor}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_COLORS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!editingEventId && oauthAccounts.length > 0 && (
                    <div className="space-y-2">
                      <Label>Destination</Label>
                      <Select
                        value={evTargetAccount}
                        onValueChange={setEvTargetAccount}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local Calendar</SelectItem>
                          {oauthAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              Google: {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEventDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEvent}>
              {editingEventId
                ? "Save Changes"
                : creationType === "reminder"
                ? "Create Reminder"
                : "Save Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: GOOGLE CALENDAR INTEGRATION ==================== */}
      <Dialog
        open={gcalDialogOpen}
        onOpenChange={(open) => {
          setGcalDialogOpen(open);
          if (!open) handleCancelEditAccount();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <div className="flex items-start justify-between gap-4 pr-6">
              <div>
                <DialogTitle>Google Calendar Integration</DialogTitle>
                <DialogDescription>
                  Connect your Google Calendar via Private iCal (.ics) URL, OAuth
                  2.0 Access Token, or Google Cloud API Key.
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs shrink-0"
                onClick={() => setGcalHelpOpen(true)}
              >
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                Setup &amp; Token Guide
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
            {editingAccountId && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-xs">
                <div className="flex items-center gap-2 min-w-0 font-medium text-foreground">
                  <Pencil className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">
                    Editing: <strong>{gcalName || "Calendar"}</strong>
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs hover:bg-background/80 shrink-0"
                  onClick={handleCancelEditAccount}
                >
                  Cancel Edit
                </Button>
              </div>
            )}

            <Tabs
              value={gcalMode}
              onValueChange={(v) => setGcalMode(v as GoogleIntegrationMode)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="ical" className="gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" />
                  Private iCal (.ics)
                </TabsTrigger>
                <TabsTrigger value="oauth" className="gap-1.5 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  OAuth 2.0 Token
                </TabsTrigger>
                <TabsTrigger value="apikey" className="gap-1.5 text-xs">
                  <KeyRound className="h-3.5 w-3.5" />
                  API Key
                </TabsTrigger>
              </TabsList>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <Label>Display Name</Label>
                    <Input
                      placeholder="Personal Google Calendar"
                      value={gcalName}
                      onChange={(e) => setGcalName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Select value={gcalColor} onValueChange={setGcalColor}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_COLORS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <TabsContent value="ical" className="space-y-2 mt-0">
                  <Label>Secret Address in iCal Format (.ics URL)</Label>
                  <Input
                    placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                    value={gcalIcalUrl}
                    onChange={(e) => setGcalIcalUrl(e.target.value)}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      In Google Calendar Settings &rarr; Integrate calendar &rarr;
                      copy &ldquo;Secret address in iCal format&rdquo;.
                    </span>
                    <button
                      type="button"
                      onClick={() => setGcalHelpOpen(true)}
                      className="text-[11px] text-primary hover:underline shrink-0 ml-2"
                    >
                      No iCal visible?
                    </button>
                  </div>
                </TabsContent>

                <TabsContent value="oauth" className="space-y-3.5 mt-0">
                  <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary shrink-0" />
                      <span>Shared calendar without iCal? Connect with your Calendar ID and OAuth.</span>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary shrink-0 font-medium"
                      onClick={() => setGcalHelpOpen(true)}
                    >
                      View Token Guide &rarr;
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Calendar ID</Label>
                    <Input
                      placeholder="e.g. c_xxxxxxxx@group.calendar.google.com or primary"
                      value={gcalCalendarId}
                      onChange={(e) => setGcalCalendarId(e.target.value)}
                    />
                  </div>

                  {/* Permanent Background Sync Box */}
                  <div className="p-3 rounded-lg border bg-card/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>Permanent Background Sync (Refresh Token)</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        Never Expires
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Refresh Token</Label>
                        <span className="text-[10px] text-muted-foreground">Begins with 1//04...</span>
                      </div>
                      <Input
                        type="password"
                        placeholder="1//04..."
                        value={gcalRefreshToken}
                        onChange={(e) => setGcalRefreshToken(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">OAuth Client ID</Label>
                        <Input
                          placeholder="...apps.googleusercontent.com"
                          value={gcalClientId}
                          onChange={(e) => setGcalClientId(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">OAuth Client Secret</Label>
                        <Input
                          type="password"
                          placeholder="GOCSPX-..."
                          value={gcalClientSecret}
                          onChange={(e) => setGcalClientSecret(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Temporary Access Token (Optional) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        OAuth 2.0 Access Token (Optional if Refresh Token provided)
                      </Label>
                      <button
                        type="button"
                        onClick={() => setGcalHelpOpen(true)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        How to get token?
                      </button>
                    </div>
                    <Input
                      type="password"
                      placeholder="ya29.a0... (Optional 1-hour token)"
                      value={gcalAccessToken}
                      onChange={(e) => setGcalAccessToken(e.target.value)}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="apikey" className="space-y-3 mt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Calendar ID</Label>
                      <Input
                        placeholder="you@gmail.com"
                        value={gcalCalendarId}
                        onChange={(e) => setGcalCalendarId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Google API Key</Label>
                      <Input
                        type="password"
                        placeholder="AIzaSy..."
                        value={gcalApiKey}
                        onChange={(e) => setGcalApiKey(e.target.value)}
                      />
                    </div>
                  </div>
                </TabsContent>

                <div className="flex justify-end gap-2">
                  {editingAccountId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEditAccount}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button size="sm" onClick={handleConnectGoogleAccount}>
                    {editingAccountId ? (
                      <>
                        <Check className="h-4 w-4" />
                        Update &amp; Sync
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Connect &amp; Sync
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Tabs>

            {state.googleAccounts.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Connected Accounts ({state.googleAccounts.length})
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      Click an account or pencil to edit
                    </span>
                  </div>
                  <div className="overflow-y-auto max-h-60 space-y-2 pr-1.5 focus:outline-none">
                    {state.googleAccounts.map((acc) => {
                      const isEditingThis = editingAccountId === acc.id;
                      return (
                        <div
                          key={acc.id}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-md border text-xs cursor-pointer transition-all hover:bg-accent/40",
                            isEditingThis
                              ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                              : "bg-card/40"
                          )}
                          onClick={() => handleStartEditAccount(acc)}
                          title="Click to edit account details"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: acc.color }}
                            />
                            <div className="min-w-0">
                              <div className="font-medium flex items-center gap-1.5">
                                <span className="truncate">{acc.name}</span>
                                <Badge
                                  variant="outline"
                                  className="uppercase text-[10px]"
                                >
                                  {acc.mode}
                                </Badge>
                                {acc.refreshToken && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  >
                                    Auto-refresh
                                  </Badge>
                                )}
                                {isEditingThis && (
                                  <Badge className="text-[10px] bg-primary text-primary-foreground py-0 h-4">
                                    Editing
                                  </Badge>
                                )}
                              </div>
                              {acc.lastSyncError ? (
                                <div className="text-[11px] text-destructive flex items-center gap-1 mt-0.5">
                                  <AlertCircle className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {acc.lastSyncError}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[11px] text-muted-foreground">
                                  {acc.lastSyncedAt
                                    ? `Last synced: ${format(
                                        new Date(acc.lastSyncedAt),
                                        "MMM d, HH:mm:ss"
                                      )}`
                                    : "Not synced yet"}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Edit Calendar Settings"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditAccount(acc);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={navigation.isSyncingGoogle}
                              onClick={(e) => {
                                e.stopPropagation();
                                store
                                  .syncSingleGoogleAccount(acc.id)
                                  .then((count) =>
                                    showMessage(
                                      `Synced ${count} events from ${acc.name}`,
                                      3000,
                                      "info"
                                    )
                                  )
                                  .catch((err) =>
                                    showMessage(err.message, 4000, "error")
                                  );
                              }}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Sync
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Delete Calendar"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (editingAccountId === acc.id) {
                                  handleCancelEditAccount();
                                }
                                store.removeGoogleAccount(acc.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGcalDialogOpen(false);
                handleCancelEditAccount();
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: GOOGLE CALENDAR SETUP GUIDE ==================== */}
      <Dialog open={gcalHelpOpen} onOpenChange={setGcalHelpOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Google Calendar Setup &amp; Token Guide
            </DialogTitle>
            <DialogDescription>
              Step-by-step instructions for shared calendars, OAuth 2.0 tokens, and iCal feeds.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4 text-xs leading-relaxed">
            {/* Shared calendars section */}
            <div className="p-3.5 rounded-lg border bg-card/60 space-y-2.5">
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                1. Shared &amp; Work Calendars (Where iCal is Disabled)
              </div>
              <p className="text-muted-foreground">
                Google intentionally hides the &ldquo;Secret address in iCal format&rdquo; on calendars shared with you by other accounts or inside Google Workspace/work organizations. You can connect them using their <strong>Calendar ID</strong> and an <strong>OAuth 2.0 Access Token</strong>.
              </p>
              <div className="space-y-1.5 pl-3 border-l-2 border-primary/40">
                <p className="font-medium text-foreground">How to find the shared Calendar ID:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>
                    Open{" "}
                    <a
                      href="https://calendar.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-0.5 font-medium"
                    >
                      Google Calendar <ExternalLink className="h-2.5 w-2.5" />
                    </a>{" "}
                    on your browser.
                  </li>
                  <li>In the left sidebar, find the shared calendar (under <em>My calendars</em> or <em>Other calendars</em>).</li>
                  <li>Click the three dots (<strong>⋮</strong>) next to the calendar name &rarr; <strong>Settings and sharing</strong>.</li>
                  <li>Scroll down to the <strong>Integrate calendar</strong> section.</li>
                  <li>
                    Copy the <strong>Calendar ID</strong> (looks like{" "}
                    <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
                      c_xxxxxxxx@group.calendar.google.com
                    </code>{" "}
                    or{" "}
                    <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
                      colleague@domain.com
                    </code>
                    ).
                  </li>
                </ol>
              </div>
            </div>

            {/* OAuth Playground section */}
            <div className="p-3.5 rounded-lg border bg-card/60 space-y-2.5">
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                2. How to Generate an OAuth 2.0 Access Token
              </div>
              <p className="text-muted-foreground">
                Generate a ready-to-use access token in 60 seconds with Google&rsquo;s official developer tool:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground pl-1">
                <li>
                  Go to{" "}
                  <a
                    href="https://developers.google.com/oauthplayground/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5 font-semibold"
                  >
                    Google OAuth 2.0 Playground <ExternalLink className="h-2.5 w-2.5" />
                  </a>.
                </li>
                <li>
                  In <strong>Step 1 (Select &amp; authorize APIs)</strong>, scroll down to <strong>Google Calendar API v3</strong>.
                </li>
                <li>
                  Select{" "}
                  <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
                    https://www.googleapis.com/auth/calendar.readonly
                  </code>{" "}
                  (or{" "}
                  <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
                    .../auth/calendar
                  </code>{" "}
                  to also create events from Temporal).
                </li>
                <li>
                  Click the blue <strong>Authorize APIs</strong> button and sign into the Google Account that has access to the calendar.
                </li>
                <li>
                  In <strong>Step 2</strong>, click the blue{" "}
                  <strong>Exchange authorization code for tokens</strong> button.
                </li>
                <li>
                  In <strong>Step 2</strong>, you will see both <strong>Refresh token</strong> and <strong>Access token</strong>.
                </li>
                <li>
                  <strong>For Permanent Background Sync (Never Expires):</strong> Copy your <strong>Refresh token</strong> (begins with <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">1//04...</code>) along with your <strong>OAuth Client ID</strong> and <strong>Client Secret</strong> into Temporal&rsquo;s Permanent Sync box. Temporal will automatically refresh your credentials in the background forever!
                </li>
                <li>
                  <strong>For Quick 1-Hour Testing:</strong> You can also just paste the <strong>Access token</strong> (begins with <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">ya29.a0...</code>).
                </li>
              </ol>
            </div>

            {/* Private iCal section */}
            <div className="p-3.5 rounded-lg border bg-card/60 space-y-2">
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                3. Private iCal (.ics) Feeds (Personal Calendars)
              </div>
              <p className="text-muted-foreground">
                If you are the owner of the calendar (e.g. your personal Gmail calendar):
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground pl-1">
                <li>Open Google Calendar Settings &rarr; Select your calendar under &ldquo;Settings for my calendars&rdquo;.</li>
                <li>Scroll to <strong>Integrate calendar</strong> &rarr; copy <strong>Secret address in iCal format</strong>.</li>
                <li>Paste into Temporal&rsquo;s <strong>Private iCal</strong> tab.</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setGcalHelpOpen(false)}>
              Close Guide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== EVENT DETAILS MODAL ==================== */}
      <Dialog
        open={Boolean(detailsEvent)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsEvent(null);
            setAttendeeFilter("all");
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0">
          {detailsEvent && (
            <>
              {/* Header with color banner */}
              <div
                className="p-5 border-b relative"
                style={{
                  borderTop: `5px solid ${detailsEvent.color || "#2563eb"}`,
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-medium"
                        style={{
                          backgroundColor: `${detailsEvent.color || "#2563eb"}20`,
                          color: detailsEvent.color || "#2563eb",
                        }}
                      >
                        {detailsEvent.calendarName || detailsEvent.source}
                      </Badge>
                      {detailsEvent.status && (
                        <Badge
                          variant={detailsEvent.status === "confirmed" ? "outline" : "secondary"}
                          className="text-[11px] capitalize"
                        >
                          {detailsEvent.status}
                        </Badge>
                      )}
                      {detailsEvent.transparency && (
                        <Badge variant="outline" className="text-[11px] capitalize">
                          <Briefcase className="h-3 w-3 mr-1 opacity-70" />
                          {detailsEvent.transparency === "opaque" ? "Busy" : "Free"}
                        </Badge>
                      )}
                      {detailsEvent.visibility && detailsEvent.visibility !== "default" && (
                        <Badge variant="outline" className="text-[11px] capitalize">
                          <Lock className="h-3 w-3 mr-1 opacity-70" />
                          {detailsEvent.visibility}
                        </Badge>
                      )}
                      {detailsEvent.recurrence && detailsEvent.recurrence !== "none" && (
                        <Badge variant="outline" className="text-[11px] capitalize">
                          <Repeat className="h-3 w-3 mr-1 text-primary" />
                          {detailsEvent.recurrence}
                        </Badge>
                      )}
                    </div>
                    <DialogTitle className="text-xl font-bold leading-snug break-words">
                      {detailsEvent.title}
                    </DialogTitle>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono pt-0.5">
                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>
                        {format(new Date(detailsEvent.startISO), "EEEE, MMMM d, yyyy")}
                        {" • "}
                        {detailsEvent.allDay
                          ? "All Day"
                          : `${format(new Date(detailsEvent.startISO), "HH:mm")}${
                              detailsEvent.endISO
                                ? ` – ${format(new Date(detailsEvent.endISO), "HH:mm")}`
                                : ""
                            } (${formatDurationString(
                              detailsEvent.startISO,
                              detailsEvent.endISO,
                              detailsEvent.allDay
                            )})`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(88vh-140px)]">
                {/* 1. Video Meeting Section */}
                {detailsEvent.meetLink && (
                  <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Video className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-emerald-800 dark:text-emerald-200">
                            {detailsEvent.conferenceDetails?.solutionName || "Video Meeting"}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground truncate">
                            {detailsEvent.meetLink}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(detailsEvent.meetLink!);
                            showMessage("Meeting link copied to clipboard");
                          }}
                          title="Copy meeting URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          asChild
                        >
                          <a
                            href={detailsEvent.meetLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Video className="h-3.5 w-3.5" />
                            <span>Join Now</span>
                            <ExternalLink className="h-3 w-3 ml-0.5" />
                          </a>
                        </Button>
                      </div>
                    </div>

                    {/* Dial-in phone number & PIN */}
                    {(detailsEvent.conferenceDetails?.phoneUri ||
                      detailsEvent.conferenceDetails?.phonePin) && (
                      <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>
                            Dial-in:{" "}
                            <strong className="font-mono text-foreground">
                              {detailsEvent.conferenceDetails.phoneUri || "Available"}
                            </strong>
                            {detailsEvent.conferenceDetails.phonePin && (
                              <>
                                {" • PIN: "}
                                <strong className="font-mono text-foreground">
                                  {detailsEvent.conferenceDetails.phonePin}
                                </strong>
                              </>
                            )}
                          </span>
                        </div>
                        {detailsEvent.conferenceDetails.phonePin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px] gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `${detailsEvent.conferenceDetails?.phoneUri || ""} PIN: ${detailsEvent.conferenceDetails?.phonePin || ""}`
                              );
                              showMessage("Dial-in information copied");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                            <span>Copy Dial-in</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Attachments & Course Materials */}
                {detailsEvent.attachments && detailsEvent.attachments.length > 0 && (
                  <div className="space-y-2 p-3.5 rounded-xl border bg-muted/30">
                    <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Paperclip className="h-4 w-4 text-primary" />
                        Attached Files &amp; Resources ({detailsEvent.attachments.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {detailsEvent.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-card hover:bg-accent/60 transition-colors group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                                {att.title}
                              </div>
                              {att.mimeType && (
                                <div className="text-[10px] text-muted-foreground truncate font-mono">
                                  {att.mimeType.split("/").pop()}
                                </div>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Location / Room */}
                {detailsEvent.location && (
                  <div className="p-3.5 rounded-xl border bg-card/60 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-foreground">Location</div>
                        <div className="text-xs text-muted-foreground break-words">
                          <LinkifiedText
                            text={detailsEvent.location}
                            siyuanApp={siyuanApp}
                          />
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1 shrink-0"
                      asChild
                    >
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          detailsEvent.location
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MapPin className="h-3 w-3" />
                        <span>Maps</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </Button>
                  </div>
                )}

                {/* 4. Host & Organizer */}
                {(detailsEvent.organizer || detailsEvent.creator) && (
                  <div className="p-3.5 rounded-xl border bg-card/60 flex flex-wrap items-center gap-4 text-xs">
                    {detailsEvent.organizer && (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {(detailsEvent.organizer.displayName || detailsEvent.organizer.email || "H")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-muted-foreground">Organizer: </span>
                          <span className="font-semibold text-foreground">
                            {detailsEvent.organizer.displayName || detailsEvent.organizer.email}
                          </span>
                          {detailsEvent.organizer.displayName && detailsEvent.organizer.email && (
                            <span className="text-muted-foreground ml-1">
                              &lt;{detailsEvent.organizer.email}&gt;
                            </span>
                          )}
                          {detailsEvent.organizer.self && (
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                              You
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    {detailsEvent.creator &&
                      detailsEvent.creator.email !== detailsEvent.organizer?.email && (
                        <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
                          <span>Created by:</span>
                          <span className="font-medium text-foreground">
                            {detailsEvent.creator.displayName || detailsEvent.creator.email}
                          </span>
                        </div>
                      )}
                  </div>
                )}

                {/* 5. Full Description */}
                {detailsEvent.description && (
                  <div className="p-3.5 rounded-xl border bg-card/60 space-y-1.5">
                    <div className="text-xs font-semibold text-foreground">
                      Description &amp; Notes
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                      <LinkifiedText
                        text={detailsEvent.description}
                        siyuanApp={siyuanApp}
                      />
                    </div>
                  </div>
                )}

                {/* 6. Attendees Roster */}
                {detailsEvent.attendees && detailsEvent.attendees.length > 0 && (
                  <div className="p-3.5 rounded-xl border bg-card/60 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-primary" />
                        <span>Attendees ({detailsEvent.attendees.length})</span>
                      </div>
                      {/* Filter tabs */}
                      <div className="flex items-center gap-1 text-[11px]">
                        {(
                          [
                            { id: "all", label: "All" },
                            {
                              id: "accepted",
                              label: `Yes (${
                                detailsEvent.attendees.filter(
                                  (a) => a.responseStatus === "accepted"
                                ).length
                              })`,
                            },
                            {
                              id: "tentative",
                              label: `Maybe (${
                                detailsEvent.attendees.filter(
                                  (a) => a.responseStatus === "tentative"
                                ).length
                              })`,
                            },
                            {
                              id: "declined",
                              label: `No (${
                                detailsEvent.attendees.filter(
                                  (a) => a.responseStatus === "declined"
                                ).length
                              })`,
                            },
                            {
                              id: "needsAction",
                              label: `Awaiting (${
                                detailsEvent.attendees.filter(
                                  (a) =>
                                    !a.responseStatus ||
                                    a.responseStatus === "needsAction"
                                ).length
                              })`,
                            },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            className={cn(
                              "px-2 py-0.5 rounded-md transition-colors cursor-pointer",
                              attendeeFilter === tab.id
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "hover:bg-muted text-muted-foreground"
                            )}
                            onClick={() => setAttendeeFilter(tab.id)}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {detailsEvent.attendees
                        .filter((att) => {
                          if (attendeeFilter === "all") return true;
                          if (attendeeFilter === "needsAction") {
                            return (
                              !att.responseStatus || att.responseStatus === "needsAction"
                            );
                          }
                          return att.responseStatus === attendeeFilter;
                        })
                        .map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center font-bold text-[10px] shrink-0 text-muted-foreground">
                                {(att.displayName || att.email).charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium truncate leading-tight">
                                  {att.displayName || att.email}
                                  {att.self && " (You)"}
                                </div>
                                {att.displayName && (
                                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                                    {att.email}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0">
                              {att.responseStatus === "accepted" && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-1.5 py-0"
                                >
                                  <UserCheck className="h-2.5 w-2.5 mr-0.5" /> Yes
                                </Badge>
                              )}
                              {att.responseStatus === "declined" && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 px-1.5 py-0"
                                >
                                  <UserX className="h-2.5 w-2.5 mr-0.5" /> No
                                </Badge>
                              )}
                              {att.responseStatus === "tentative" && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 px-1.5 py-0"
                                >
                                  Maybe
                                </Badge>
                              )}
                              {(!att.responseStatus ||
                                att.responseStatus === "needsAction") && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground px-1.5 py-0"
                                >
                                  Pending
                                </Badge>
                              )}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 7. Event Metadata (ID, Timestamps) */}
                <div className="pt-2 border-t text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {detailsEvent.createdISO && (
                      <span>
                        Created:{" "}
                        {format(new Date(detailsEvent.createdISO), "MMM d, yyyy HH:mm")}
                      </span>
                    )}
                    {detailsEvent.updatedISO && (
                      <span>
                        Updated:{" "}
                        {format(new Date(detailsEvent.updatedISO), "MMM d, yyyy HH:mm")}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] opacity-70">
                    ID: {detailsEvent.id}
                  </span>
                </div>
              </div>

              {/* Dialog Footer Actions */}
              <div className="p-4 border-t bg-muted/20 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const textLines = [
                      `Title: ${detailsEvent.title}`,
                      `When: ${format(new Date(detailsEvent.startISO), "PPpp")}${
                        detailsEvent.endISO
                          ? ` to ${format(new Date(detailsEvent.endISO), "PPpp")}`
                          : ""
                      }`,
                    ];
                    if (detailsEvent.location) {
                      textLines.push(`Location: ${detailsEvent.location}`);
                    }
                    if (detailsEvent.meetLink) {
                      textLines.push(`Meeting Link: ${detailsEvent.meetLink}`);
                    }
                    if (detailsEvent.organizer) {
                      textLines.push(
                        `Organizer: ${detailsEvent.organizer.displayName || ""} <${detailsEvent.organizer.email || ""}>`
                      );
                    }
                    if (detailsEvent.description) {
                      textLines.push(`\nDescription:\n${detailsEvent.description}`);
                    }
                    navigator.clipboard.writeText(textLines.join("\n"));
                    showMessage("Event summary copied to clipboard");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Summary</span>
                </Button>

                <div className="flex items-center gap-2">
                  {detailsEvent.htmlLink && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      asChild
                    >
                      <a
                        href={detailsEvent.htmlLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open in Google Calendar</span>
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      setDetailsEvent(null);
                      setAttendeeFilter("all");
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
