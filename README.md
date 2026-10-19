# SiYuan Temporal — All-in-One Time Suite

**SiYuan Temporal** is a comprehensive time management plugin for SiYuan built with **React**, **Tailwind CSS**, and **shadcn/ui** (Radix UI primitives). It opens a dedicated **Temporal Hub** tab and runs a persistent background scheduler with **real synthesized & custom audio alerts**.

## Features

1. **Clock Suite (Alarms, Timers, Stopwatch & World Clock)**
   - **Live Analog & Digital Clock**: High-precision clock with 12h/24h support.
   - **Alarms with Real Sound**: Create recurring or one-time alarms with 6 built-in Web Audio API polyphonic tones (*Warm Marimba Chime*, *Classic Quartz Digital*, *Tibetan Singing Bowl*, *Morning Harp Arpeggio*, *Cosmic Horizon Synth*, *Urgent Dual-Tone Siren*) or custom audio URLs/assets, plus Snooze (`+5m`, `+10m`, `+15m`, `+30m`).
   - **Countdown Timers**: Multiple concurrent timers with SVG circular progress rings, quick presets (`1m`, `5m`, `10m`, `15m`, `25m Pomodoro`, `45m`, `1h`), `+1m` extension, and completion alerts.
   - **Precision Stopwatch**: Millisecond stopwatch with split/lap recording, Fastest/Slowest lap badges, average lap calculation, and 1-click **Copy Laps as Markdown Table**.
   - **World Clock**: Track multiple global cities and IANA timezones with day/night indicators.

2. **Custom Reminders (Any Day, Any Time, Any Month, Any Year)**
   - Pick any date using the interactive **shadcn Calendar** (with Month & Year dropdown selectors) and exact time, or use quick relative presets (*In 15m*, *In 1h*, *Tonight 8 PM*, *Tomorrow 9 AM*, *Next Week*, *Next Month*).
   - Supports recurrence (*One-time*, *Daily*, *Weekly*, *Monthly*, *Yearly*), priority badges (*Low*, *Medium*, *High*, *Urgent*), categories, SiYuan Block/Document ID linking, and Snooze.

3. **Calendar with Google Calendar Integration**
   - **Month**, **Week**, and **Agenda** views combining Google Calendar events, local Temporal events, and scheduled Reminders.
   - **3 Google Calendar Sync Modes**:
     - **Private iCal (`.ics`) Secret URL**: Zero-config paste of your Google Calendar *"Secret address in iCal format"*, fetched via SiYuan's native `/api/network/forwardProxy` to bypass CORS.
     - **Google OAuth 2.0 Bearer Token**: Fetch personal events and create new events directly on Google Calendar via Google Calendar REST API v3.
     - **Calendar ID + Google API Key**: Fetch events from any Calendar ID via Google Cloud API Key.

## Development & Build

```bash
pnpm install
pnpm run build
```
