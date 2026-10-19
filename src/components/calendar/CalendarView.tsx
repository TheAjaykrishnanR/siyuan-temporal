import React, { useEffect, useMemo, useState } from "react";
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
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudDownload,
  ExternalLink,
  KeyRound,
  Link2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { showMessage } from "siyuan";
import type { App } from "siyuan";
import { LinkifiedText } from "@/components/common/LinkifiedText";
import {
  CalendarEventItem,
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

export const CalendarView: React.FC<CalendarViewProps> = ({ siyuanApp }) => {
  const { state, navigation, version, store } = useTemporalStore();

  const [displayMode, setDisplayMode] = useState<CalendarDisplayMode>("month");
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
  const [gcalName, setGcalName] = useState("Personal Google Calendar");
  const [gcalMode, setGcalMode] = useState<GoogleIntegrationMode>("ical");
  const [gcalIcalUrl, setGcalIcalUrl] = useState("");
  const [gcalCalendarId, setGcalCalendarId] = useState("primary");
  const [gcalAccessToken, setGcalAccessToken] = useState("");
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

  const handleConnectGoogleAccount = () => {
    if (!gcalName.trim()) {
      showMessage("Please provide a calendar name", 3000, "error");
      return;
    }
    if (gcalMode === "ical" && !gcalIcalUrl.trim()) {
      showMessage("Please paste your Google Calendar .ics URL", 3500, "error");
      return;
    }
    if (gcalMode === "oauth" && !gcalAccessToken.trim()) {
      showMessage(
        "Please provide your Google OAuth 2.0 Access Token",
        3500,
        "error"
      );
      return;
    }
    if (gcalMode === "apikey" && !gcalApiKey.trim()) {
      showMessage("Please provide your Google API Key", 3500, "error");
      return;
    }

    store.addGoogleAccount({
      name: gcalName.trim(),
      mode: gcalMode,
      icalUrl: gcalIcalUrl.trim() || undefined,
      calendarId: gcalCalendarId.trim() || "primary",
      accessToken: gcalAccessToken.trim() || undefined,
      apiKey: gcalApiKey.trim() || undefined,
      color: gcalColor,
      enabled: true,
    });

    setGcalIcalUrl("");
    setGcalAccessToken("");
    setGcalApiKey("");
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
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
        </div>
      </div>

      {/* Main Calendar Grid + Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-8 overflow-hidden">
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
                            title={`${ev.title}${ev.allDay ? " (All Day)" : ` (${format(new Date(ev.startISO), "HH:mm")})`}${ev.location ? ` • ${ev.location}` : ""}`}
                            className={cn(
                              "px-2 py-1 rounded-md text-[11px] font-medium text-white flex items-center gap-1.5 shadow-xs transition-opacity hover:opacity-90 select-none",
                              ev.completed && "line-through opacity-55"
                            )}
                            style={{
                              backgroundColor: ev.color || "#2563eb",
                            }}
                          >
                            {ev.source === "reminder" && (
                              <Bell className="h-3 w-3 shrink-0 opacity-95" />
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
                              title={`${ev.title}${ev.allDay ? " (All Day)" : ` (${format(new Date(ev.startISO), "HH:mm")})`}${ev.location ? ` • ${ev.location}` : ""}`}
                              className={cn(
                                "p-2 rounded-md text-xs text-white shadow-xs transition-opacity hover:opacity-90 select-none",
                                ev.completed && "line-through opacity-60"
                              )}
                              style={{ backgroundColor: ev.color || "#2563eb" }}
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
                          onClick={() => handleSelectDate(startDt)}
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
                              {ev.htmlLink && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
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
        <div className="xl:col-span-4 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">
                  {format(selectedDate, "EEEE, MMM d")}
                </CardTitle>
                <CardDescription>
                  {selectedDayEvents.length} scheduled item
                  {selectedDayEvents.length === 1 ? "" : "s"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => openAddEventForDate(selectedDate, "reminder")}
                  title="Add Reminder on this date"
                >
                  <Bell className="h-3.5 w-3.5" />
                  + Reminder
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => openAddEventForDate(selectedDate, "event")}
                >
                  <Plus className="h-3.5 w-3.5" /> Event
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {selectedDayEvents.length === 0 ? (
                <div className="py-8 text-center border border-dashed rounded-md">
                  <CalendarDays className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No events or reminders on {format(selectedDate, "MMM d")}.
                  </p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[460px] space-y-3 pr-2">
                  {selectedDayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className={cn(
                        "p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm space-y-2.5 transition-all hover:bg-card/90 shadow-xs",
                        ev.completed && "opacity-60 bg-muted/30"
                      )}
                    >
                      {/* Top row: Checkbox/Dot + Full Title + Action Buttons */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
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
                              className="h-3 w-3 rounded-full shrink-0 mt-1"
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

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {ev.source === "reminder" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => store.setSection("reminders")}
                              title="Open in Reminders view"
                            >
                              Open
                            </Button>
                          )}
                          {ev.source === "local" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditLocalEvent(ev)}
                              title="Edit Event"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => store.deleteCalendarEvent(ev.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Time, Recurrence & Calendar badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-mono bg-muted/60 px-2 py-0.5 rounded-md text-[11px]">
                          <Clock className="h-3 w-3 text-primary shrink-0" />
                          {ev.allDay
                            ? "All Day"
                            : ev.source === "reminder"
                            ? format(new Date(ev.startISO), "HH:mm")
                            : `${format(new Date(ev.startISO), "HH:mm")}${ev.endISO ? ` – ${format(new Date(ev.endISO), "HH:mm")}` : ""}`}
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
                      </div>

                      {/* Location if present */}
                      {ev.location && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-0.5">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                          <LinkifiedText
                            text={ev.location}
                            siyuanApp={siyuanApp}
                            className="break-words leading-tight"
                          />
                        </div>
                      )}

                      {/* Description / Notes if present */}
                      {ev.description && (
                        <div className="text-xs text-muted-foreground pt-1.5 border-t border-border/60 leading-relaxed whitespace-pre-wrap break-words">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm">Google Calendars</CardTitle>
                <CardDescription className="text-xs">
                  Connected personal feeds
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setGcalDialogOpen(true)}
              >
                Manage
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {state.googleAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Google Calendar connected yet.
                </p>
              ) : (
                state.googleAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md border text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color }}
                      />
                      <div className="truncate">
                        <div className="font-medium truncate">{acc.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {acc.lastSyncError ? (
                            <span className="text-destructive">
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

          <div className="space-y-4 py-2">
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
      <Dialog open={gcalDialogOpen} onOpenChange={setGcalDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Google Calendar Integration</DialogTitle>
            <DialogDescription>
              Connect your Google Calendar via Private iCal (.ics) URL, OAuth
              2.0 Access Token, or Google Cloud API Key.
            </DialogDescription>
          </DialogHeader>

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
                <p className="text-xs text-muted-foreground">
                  In Google Calendar Settings &rarr; Integrate calendar &rarr;
                  copy &ldquo;Secret address in iCal format&rdquo;.
                </p>
              </TabsContent>

              <TabsContent value="oauth" className="space-y-3 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Calendar ID</Label>
                    <Input
                      placeholder="primary or email"
                      value={gcalCalendarId}
                      onChange={(e) => setGcalCalendarId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OAuth 2.0 Access Token</Label>
                    <Input
                      type="password"
                      placeholder="ya29.a0..."
                      value={gcalAccessToken}
                      onChange={(e) => setGcalAccessToken(e.target.value)}
                    />
                  </div>
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

              <div className="flex justify-end">
                <Button size="sm" onClick={handleConnectGoogleAccount}>
                  <Plus className="h-4 w-4" />
                  Connect &amp; Sync
                </Button>
              </div>
            </div>
          </Tabs>

          {state.googleAccounts.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">
                  Connected Accounts ({state.googleAccounts.length})
                </Label>
                <ScrollArea className="max-h-40 pr-2">
                  <div className="space-y-2">
                    {state.googleAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between p-2.5 rounded-md border text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: acc.color }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium flex items-center gap-1.5">
                              <span className="truncate">{acc.name}</span>
                              <Badge variant="outline" className="uppercase text-[10px]">
                                {acc.mode}
                              </Badge>
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
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={navigation.isSyncingGoogle}
                            onClick={() =>
                              store
                                .syncSingleGoogleAccount(acc.id)
                                .then((count) =>
                                  showMessage(
                                    `Synced ${count} events from ${acc.name}`,
                                    3000,
                                    "info"
                                  )
                                )
                                .catch((e) =>
                                  showMessage(e.message, 4000, "error")
                                )
                            }
                          >
                            <RefreshCw className="h-3 w-3" />
                            Sync
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => store.removeGoogleAccount(acc.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGcalDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
