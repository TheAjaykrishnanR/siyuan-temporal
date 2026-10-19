import React from "react";
import { AlarmClock, BellRing, Check, Clock, Timer } from "lucide-react";
import { useTemporalStore } from "@/services/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const GlobalRingingOverlay: React.FC = () => {
  const { state, activeAlerts, store } = useTemporalStore();

  if (activeAlerts.length === 0) return null;

  const isSiYuanDark =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme-mode") === "dark";
  const isDark =
    state.settings.themeMode === "dark" ||
    (state.settings.themeMode === "auto" && isSiYuanDark);

  return (
    <div
      className={cn(
        "shadcn-theme-root fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-auto",
        isDark && "dark"
      )}
    >
      {activeAlerts.map((alert) => {
        const Icon =
          alert.sourceType === "alarm"
            ? AlarmClock
            : alert.sourceType === "timer"
            ? Timer
            : BellRing;

        return (
          <Card key={alert.id} className="shadow-xl border-primary">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="default" className="uppercase text-[10px]">
                  {alert.sourceType}
                </Badge>
                <Icon className="h-4 w-4 text-muted-foreground animate-bounce" />
              </div>
              <CardTitle className="text-base mt-1">{alert.title}</CardTitle>
              <CardDescription className="text-xs">
                {alert.subtitle}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => store.dismissAlert(alert.id)}
              >
                <Check className="h-3.5 w-3.5" />
                {alert.sourceType === "reminder" ? "Complete" : "Dismiss"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  store.snoozeAlert(alert.id, alert.snoozeMinutes || 5)
                }
              >
                <Clock className="h-3.5 w-3.5" />
                Snooze {alert.snoozeMinutes || 5}m
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};
