import React, { useMemo, useState } from "react";
import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  format,
  isPast,
  isSameDay,
  isToday,
} from "date-fns";
import {
  AlertTriangle,
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
  Volume2,
} from "lucide-react";
import { openTab, showMessage } from "siyuan";
import type { App } from "siyuan";
import { LinkifiedText } from "@/components/common/LinkifiedText";
import {
  CustomReminder,
  ReminderPriority,
  ReminderRecurrence,
  SoundToneId,
} from "@/types/temporal";
import { SOUND_TONE_OPTIONS, audioEngine } from "@/services/audio";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RemindersViewProps {
  siyuanApp?: App;
}

type ReminderFilter = "pending" | "today" | "upcoming" | "overdue" | "completed";

const PRIORITY_STYLES: Record<
  ReminderPriority,
  { label: string; badgeVariant: "secondary" | "default" | "outline" | "destructive" }
> = {
  low: { label: "Low", badgeVariant: "outline" },
  medium: { label: "Medium", badgeVariant: "secondary" },
  high: { label: "High", badgeVariant: "default" },
  urgent: { label: "Urgent", badgeVariant: "destructive" },
};

export const RemindersView: React.FC<RemindersViewProps> = ({ siyuanApp }) => {
  const { state, version, store } = useTemporalStore();

  const [filter, setFilter] = useState<ReminderFilter>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() =>
    addHours(new Date(), 1)
  );
  const [timeStr, setTimeStr] = useState(() =>
    format(addHours(new Date(), 1), "HH:mm")
  );
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>("none");
  const [priority, setPriority] = useState<ReminderPriority>("medium");
  const [category, setCategory] = useState("Personal");
  const [soundId, setSoundId] = useState<SoundToneId>(
    state.settings.defaultSoundId
  );
  const [customSoundUrl, setCustomSoundUrl] = useState("");
  const [linkedBlockId, setLinkedBlockId] = useState("");

  const openNewReminderModal = (presetDate?: Date) => {
    const base = presetDate || addHours(new Date(), 1);
    setEditingId(null);
    setTitle("");
    setDescription("");
    setSelectedDate(base);
    setTimeStr(format(base, "HH:mm"));
    setRecurrence("none");
    setPriority("medium");
    setCategory("Personal");
    setSoundId(state.settings.defaultSoundId);
    setCustomSoundUrl("");
    setLinkedBlockId("");
    setDialogOpen(true);
  };

  const openEditReminderModal = (rem: CustomReminder) => {
    const dt = new Date(rem.datetimeISO);
    const validDt = isNaN(dt.getTime()) ? new Date() : dt;
    setEditingId(rem.id);
    setTitle(rem.title);
    setDescription(rem.description || "");
    setSelectedDate(validDt);
    setTimeStr(format(validDt, "HH:mm"));
    setRecurrence(rem.recurrence);
    setPriority(rem.priority);
    setCategory(rem.category || "Personal");
    setSoundId(rem.soundId);
    setCustomSoundUrl(rem.customSoundUrl || "");
    setLinkedBlockId(rem.linkedBlockId || "");
    setDialogOpen(true);
  };

  const applyQuickTimePreset = (target: Date) => {
    setSelectedDate(target);
    setTimeStr(format(target, "HH:mm"));
  };

  const handleSaveReminder = () => {
    if (!title.trim()) {
      showMessage("Please enter a reminder title", 3000, "error");
      return;
    }

    const [hh, mm] = (timeStr || "09:00").split(":").map((n) => Number(n) || 0);
    const combined = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      hh,
      mm,
      0,
      0
    );

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      datetimeISO: combined.toISOString(),
      recurrence,
      priority,
      category: category.trim() || "General",
      soundId,
      customSoundUrl: customSoundUrl.trim() || undefined,
      linkedBlockId: linkedBlockId.trim() || undefined,
    };

    if (editingId) {
      store.updateReminder(editingId, payload);
      showMessage("Updated reminder", 2500, "info");
    } else {
      store.addReminder(payload);
      showMessage(
        `Scheduled for ${format(combined, "MMM d, yyyy 'at' p")}`,
        3500,
        "info"
      );
    }
    setDialogOpen(false);
  };

  const categories = useMemo(() => {
    const set = new Set<string>(["Personal", "Work", "Study", "Health"]);
    for (const r of state.reminders) {
      if (r.category) set.add(r.category);
    }
    return Array.from(set);
  }, [state.reminders, version]);

  const counts = useMemo(() => {
    const now = new Date();
    let pending = 0;
    let today = 0;
    let upcoming = 0;
    let overdue = 0;
    let completed = 0;

    for (const r of state.reminders) {
      if (r.completed) {
        completed++;
        continue;
      }
      pending++;
      const dt = new Date(r.snoozedUntil || r.datetimeISO);
      if (dt < now) overdue++;
      if (isSameDay(dt, now)) today++;
      if (dt >= now) upcoming++;
    }
    return { pending, today, upcoming, overdue, completed };
  }, [state.reminders, version]);

  const filteredReminders = useMemo(() => {
    const now = new Date();
    return state.reminders
      .filter((r) => {
        if (categoryFilter !== "all" && r.category !== categoryFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = r.title.toLowerCase().includes(q);
          const matchDesc = (r.description || "").toLowerCase().includes(q);
          const matchCat = (r.category || "").toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchCat) return false;
        }

        const dt = new Date(r.snoozedUntil || r.datetimeISO);
        switch (filter) {
          case "completed":
            return r.completed;
          case "overdue":
            return !r.completed && dt < now;
          case "today":
            return !r.completed && isSameDay(dt, now);
          case "upcoming":
            return !r.completed && dt >= now;
          case "pending":
          default:
            return !r.completed;
        }
      })
      .sort((a, b) => {
        const tA = new Date(a.snoozedUntil || a.datetimeISO).getTime();
        const tB = new Date(b.snoozedUntil || b.datetimeISO).getTime();
        return tA - tB;
      });
  }, [state.reminders, version, filter, searchQuery, categoryFilter]);

  const handleOpenLinkedBlock = (blockId: string) => {
    if (!siyuanApp || !blockId) return;
    const cleanId = blockId.replace(/^\(\(/, "").replace(/\)\)$/, "").trim();
    openTab({
      app: siyuanApp,
      doc: {
        id: cleanId,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{counts.pending}</div>
            <p className="text-xs text-muted-foreground">Pending reminders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{counts.today}</div>
            <p className="text-xs text-muted-foreground">Scheduled for today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{counts.overdue}</div>
            <p className="text-xs text-muted-foreground">Past scheduled time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{counts.completed}</div>
            <p className="text-xs text-muted-foreground">Finished items</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-2.5" />
            <Input
              placeholder="Filter reminders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as ReminderFilter)}
          >
            <TabsList>
              <TabsTrigger value="pending">Active</TabsTrigger>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="completed">Done</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Button onClick={() => openNewReminderModal()} size="sm">
          <Plus className="h-4 w-4" />
          New Reminder
        </Button>
      </div>

      {/* Reminders Table Card */}
      <Card>
        <CardContent className="p-0">
          {filteredReminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No reminders found</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Schedule a custom reminder for any day, time, month, or year.
              </p>
              <Button onClick={() => openNewReminderModal()} size="sm">
                <Plus className="h-4 w-4" /> Create Reminder
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Reminder</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Scheduled For</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReminders.map((rem) => {
                  const effectiveISO = rem.snoozedUntil || rem.datetimeISO;
                  const dt = new Date(effectiveISO);
                  const overdue = !rem.completed && isPast(dt);
                  const dueToday = isToday(dt);
                  const prio =
                    PRIORITY_STYLES[rem.priority] || PRIORITY_STYLES.medium;

                  return (
                    <TableRow key={rem.id}>
                      <TableCell>
                        <Checkbox
                          checked={rem.completed}
                          onCheckedChange={(checked) =>
                            store.completeReminder(rem.id, Boolean(checked))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-medium leading-snug",
                                rem.completed &&
                                  "line-through text-muted-foreground"
                              )}
                            >
                              <LinkifiedText text={rem.title} siyuanApp={siyuanApp} />
                            </span>
                            {rem.recurrence !== "none" && (
                              <Badge
                                variant="outline"
                                className="gap-1 text-[10px] capitalize shrink-0"
                              >
                                <Repeat className="h-2.5 w-2.5" />
                                {rem.recurrence}
                              </Badge>
                            )}
                          </div>
                          {rem.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              <LinkifiedText text={rem.description} siyuanApp={siyuanApp} />
                            </p>
                          )}
                          {rem.linkedBlockId && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() =>
                                handleOpenLinkedBlock(rem.linkedBlockId!)
                              }
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open Block
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rem.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={prio.badgeVariant}>{prio.label}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => store.navigateToCalendarDate(dt)}
                          title="View in Calendar"
                          className={cn(
                            "hover:underline text-left",
                            overdue && "text-destructive font-semibold",
                            dueToday && !overdue && "font-semibold"
                          )}
                        >
                          {format(
                            dt,
                            state.settings.use24HourFormat
                              ? "yyyy-MM-dd HH:mm"
                              : "MMM d, yyyy hh:mm a"
                          )}
                        </button>
                        {rem.snoozedUntil && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            Snoozed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {!rem.completed && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 text-xs">
                                  <Clock className="h-3 w-3" />
                                  Snooze
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Snooze For</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => store.snoozeReminder(rem.id, 10)}
                                >
                                  10 Minutes
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => store.snoozeReminder(rem.id, 30)}
                                >
                                  30 Minutes
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => store.snoozeReminder(rem.id, 60)}
                                >
                                  1 Hour
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    store.snoozeReminder(rem.id, 24 * 60)
                                  }
                                >
                                  Tomorrow
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => store.navigateToCalendarDate(dt)}
                            title="View in Calendar"
                          >
                            <CalendarIcon className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              audioEngine.playPatternOnce(
                                rem.soundId,
                                state.settings.defaultVolume,
                                rem.customSoundUrl
                              )
                            }
                            title="Test Sound"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditReminderModal(rem)}
                            title="Edit Reminder"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => store.deleteReminder(rem.id)}
                            title="Delete Reminder"
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
      </Card>

      {/* ==================== DIALOG: CREATE / EDIT REMINDER ==================== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Reminder" : "New Custom Reminder"}
            </DialogTitle>
            <DialogDescription>
              Schedule a reminder for any day, time, month, or year.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Submit Quarterly Report, Call Dentist..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Quick Time Presets
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: "In 15m",
                    getDate: () => addMinutes(new Date(), 15),
                  },
                  {
                    label: "In 1h",
                    getDate: () => addHours(new Date(), 1),
                  },
                  {
                    label: "Tonight 8 PM",
                    getDate: () => {
                      const d = new Date();
                      d.setHours(20, 0, 0, 0);
                      return d;
                    },
                  },
                  {
                    label: "Tomorrow 9 AM",
                    getDate: () => {
                      const d = addDays(new Date(), 1);
                      d.setHours(9, 0, 0, 0);
                      return d;
                    },
                  },
                  {
                    label: "Next Week",
                    getDate: () => {
                      const d = addDays(new Date(), 7);
                      d.setHours(9, 0, 0, 0);
                      return d;
                    },
                  },
                  {
                    label: "Next Month",
                    getDate: () => {
                      const d = addMonths(new Date(), 1);
                      d.setHours(9, 0, 0, 0);
                      return d;
                    },
                  },
                ].map((chip) => (
                  <Button
                    key={chip.label}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => applyQuickTimePreset(chip.getDate())}
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      captionLayout="dropdown"
                      selected={selectedDate}
                      onSelect={(d) => d && setSelectedDate(d)}
                      startMonth={new Date(2020, 0)}
                      endMonth={new Date(2040, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select
                  value={recurrence}
                  onValueChange={(v) => setRecurrence(v as ReminderRecurrence)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time</SelectItem>
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
                  value={priority}
                  onValueChange={(v) => setPriority(v as ReminderPriority)}
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
                  placeholder="Personal, Work..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Alert Sound</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={soundId}
                  onValueChange={(v) => setSoundId(v as SoundToneId)}
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
                      soundId,
                      state.settings.defaultVolume,
                      customSoundUrl
                    )
                  }
                >
                  <Volume2 className="h-3.5 w-3.5" /> Test
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Additional details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>SiYuan Block ID (Optional)</Label>
              <Input
                placeholder="e.g. 20261019043200-abcdefg"
                value={linkedBlockId}
                onChange={(e) => setLinkedBlockId(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReminder}>
              {editingId ? "Save Changes" : "Schedule Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
