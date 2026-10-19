import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlarmClock,
  Bell,
  BellRing,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Settings,
  Timer,
} from "lucide-react";
import type { App } from "siyuan";
import { TemporalSection } from "@/types/temporal";
import { useTemporalStore } from "@/services/store";
import { formatDurationMs } from "@/lib/utils";
import { ShadcnPortalContext } from "@/lib/portal";
import { ClockSuiteView } from "@/components/clock/ClockSuiteView";
import { RemindersView } from "@/components/reminders/RemindersView";
import { CalendarView } from "@/components/calendar/CalendarView";
import { SettingsView } from "@/components/settings/SettingsView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkifiedText } from "@/components/common/LinkifiedText";

interface TemporalHubAppProps {
  siyuanApp?: App;
  initialSection?: TemporalSection;
}

export const TemporalHubApp: React.FC<TemporalHubAppProps> = ({
  siyuanApp,
  initialSection,
}) => {
  const { state, activeAlerts, navigation, store } = useTemporalStore();
  const [now, setNow] = useState<Date>(() => new Date());
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialSection) {
      store.setSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pendingRemindersCount = state.reminders.filter(
    (r) => !r.completed
  ).length;
  const runningTimers = state.timers.filter((t) => t.status === "running");
  const activeAlarmsCount = state.alarms.filter((a) => a.enabled).length;

  return (
    <ShadcnPortalContext.Provider value={portalEl}>
      <div
        ref={setPortalEl}
        className="temporal-hub-root relative w-full h-full flex flex-col overflow-hidden bg-background text-foreground"
      >
        {/* Top Liquid Glass Header */}
        <header className="temporal-glass-header relative z-10 shrink-0 px-6 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="temporal-glass-bar flex h-9 w-9 items-center justify-center rounded-xl text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight">
                  Temporal
                </h1>
                <Badge variant="outline" className="text-[11px] font-normal">
                  v1.0
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Clock, timers, alarms, reminders &amp; Google Calendar
              </p>
            </div>
          </div>

          {/* Official shadcn/ui Tabs Navigation */}
          <Tabs
            value={navigation.section}
            onValueChange={(v) => store.setSection(v as TemporalSection)}
          >
            <TabsList className="h-9">
              <TabsTrigger value="clock" className="gap-2">
                <AlarmClock className="h-3.5 w-3.5" />
                <span>Clock &amp; Timers</span>
                {(runningTimers.length > 0 || activeAlarmsCount > 0) && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-[10px]"
                  >
                    {runningTimers.length > 0
                      ? `${runningTimers.length} active`
                      : activeAlarmsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reminders" className="gap-2">
                <Bell className="h-3.5 w-3.5" />
                <span>Reminders</span>
                {pendingRemindersCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-[10px]"
                  >
                    {pendingRemindersCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Calendar</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-3.5 w-3.5" />
                <span>Settings</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Right Live Clock */}
          <div className="flex items-center gap-3 shrink-0">
            {runningTimers.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 font-mono text-xs"
                onClick={() => store.setSection("clock", "timer")}
              >
                <Timer className="h-3.5 w-3.5 text-primary" />
                {formatDurationMs(runningTimers[0].remainingMs).formatted}
              </Button>
            )}

            <div className="text-right font-mono">
              <div className="text-sm font-semibold leading-none">
                {format(
                  now,
                  state.settings.use24HourFormat ? "HH:mm" : "hh:mm a"
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 font-sans">
                {format(now, "EEE, MMM d, yyyy")}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="relative z-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-4">
            {/* Inline Ringing Alert Banner inside the tab (alongside SiYuan's native showMessage notification) */}
            {activeAlerts.length > 0 && (
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <Alert
                    key={alert.id}
                    className="border-primary/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <BellRing className="h-4 w-4 text-primary mt-0.5 shrink-0 animate-bounce" />
                      <div>
                        <AlertTitle className="flex items-center gap-2">
                          <Badge variant="default" className="uppercase text-[10px]">
                            {alert.sourceType}
                          </Badge>
                          <LinkifiedText text={alert.title} siyuanApp={siyuanApp} />
                        </AlertTitle>
                        <AlertDescription className="text-xs text-muted-foreground">
                          <LinkifiedText text={alert.subtitle} siyuanApp={siyuanApp} />
                        </AlertDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => store.dismissAlert(alert.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {alert.sourceType === "reminder" ? "Complete" : "Dismiss"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          store.snoozeAlert(
                            alert.id,
                            alert.snoozeMinutes ||
                              state.settings.defaultSnoozeMinutes ||
                              5
                          )
                        }
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Snooze{" "}
                        {alert.snoozeMinutes ||
                          state.settings.defaultSnoozeMinutes ||
                          5}
                        m
                      </Button>
                    </div>
                  </Alert>
                ))}
              </div>
            )}

            {navigation.section === "clock" && <ClockSuiteView />}
            {navigation.section === "reminders" && (
              <RemindersView siyuanApp={siyuanApp} />
            )}
            {navigation.section === "calendar" && (
              <CalendarView siyuanApp={siyuanApp} />
            )}
            {navigation.section === "settings" && <SettingsView />}
          </div>
        </main>
      </div>
    </ShadcnPortalContext.Provider>
  );
};
