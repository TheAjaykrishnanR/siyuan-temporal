import React from "react";
import {
  Bell,
  Calendar,
  Clock,
  Volume2,
  RefreshCw,
} from "lucide-react";
import { showMessage } from "siyuan";
import { SoundToneId } from "@/types/temporal";
import { SOUND_TONE_OPTIONS, audioEngine } from "@/services/audio";
import { useTemporalStore } from "@/services/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SettingsView: React.FC = () => {
  const { state, store } = useTemporalStore();
  const { settings } = state;

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Time &amp; Display
          </CardTitle>
          <CardDescription>
            Temporal automatically inherits your active SiYuan theme colors and
            typography.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>24-Hour Time</Label>
              <p className="text-xs text-muted-foreground">
                Display clocks and alarms in 24-hour format (e.g. 14:30).
              </p>
            </div>
            <Switch
              checked={settings.use24HourFormat}
              onCheckedChange={(checked) => {
                store.updateSettings({ use24HourFormat: checked });
                try {
                  showMessage(
                    `Time format set to ${checked ? "24-hour" : "12-hour"}`,
                    2500,
                    "info"
                  );
                } catch {
                  // ignore
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Audio &amp; SiYuan Notifications
          </CardTitle>
          <CardDescription>
            Default synthesized chime, master volume, and snooze interval for
            SiYuan notification alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Sound Tone</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={settings.defaultSoundId}
                  onValueChange={(v) =>
                    store.updateSettings({ defaultSoundId: v as SoundToneId })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_TONE_OPTIONS.filter(
                      (o) => o.id !== "custom-url"
                    ).map((opt) => (
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
                      settings.defaultSoundId,
                      settings.defaultVolume
                    )
                  }
                >
                  <Volume2 className="h-3.5 w-3.5" /> Preview
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default Snooze Duration</Label>
              <Select
                value={String(settings.defaultSnoozeMinutes)}
                onValueChange={(v) =>
                  store.updateSettings({ defaultSnoozeMinutes: Number(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
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

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Default Master Volume</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {Math.round(settings.defaultVolume * 100)}%
              </span>
            </div>
            <Slider
              min={10}
              max={100}
              step={5}
              value={[Math.round(settings.defaultVolume * 100)]}
              onValueChange={([v]) =>
                store.updateSettings({ defaultVolume: (v || 80) / 100 })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Calendar &amp; Google Sync
          </CardTitle>
          <CardDescription>
            Control calendar overlays and automatic Google Calendar background
            sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Reminders in Calendar</Label>
              <p className="text-xs text-muted-foreground">
                Display scheduled reminders alongside calendar events.
              </p>
            </div>
            <Switch
              checked={settings.showRemindersInCalendar}
              onCheckedChange={(checked) =>
                store.updateSettings({ showRemindersInCalendar: checked })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Google Calendar Auto-Sync
              </Label>
              <p className="text-xs text-muted-foreground">
                Background refresh interval for connected Google Calendar feeds.
              </p>
            </div>
            <Select
              value={String(settings.googleAutoSyncMinutes)}
              onValueChange={(v) =>
                store.updateSettings({ googleAutoSyncMinutes: Number(v) })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Manual Only</SelectItem>
                <SelectItem value="5">Every 5 Minutes</SelectItem>
                <SelectItem value="15">Every 15 Minutes</SelectItem>
                <SelectItem value="30">Every 30 Minutes</SelectItem>
                <SelectItem value="60">Every 1 Hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
