import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  subMonths,
} from "date-fns";
import { CalendarEventItem, GoogleCalendarAccount } from "@/types/temporal";
import { generateId } from "@/lib/utils";

/**
 * Performs an HTTP request using SiYuan's built-in `/api/network/forwardProxy`
 * to avoid browser CORS restrictions (especially for Google Calendar .ics feeds),
 * falling back to standard `fetch` when outside SiYuan or if proxy is unavailable.
 */
async function siyuanFetchText(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{ status: number; body: string }> {
  const method = options?.method || "GET";
  const headersMap = options?.headers || {};

  // Try SiYuan kernel forwardProxy first
  try {
    const headerList = Object.entries(headersMap).map(([k, v]) => ({ [k]: v }));
    const proxyRes = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method,
        timeout: 15000,
        contentType: headersMap["Content-Type"] || "application/json",
        headers: headerList,
        payload: options?.body || "",
      }),
    });
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json && json.code === 0 && json.data) {
        return {
          status: json.data.status || 200,
          body:
            typeof json.data.body === "string"
              ? json.data.body
              : JSON.stringify(json.data.body),
        };
      }
    }
  } catch {
    // Fallback to direct fetch
  }

  const directRes = await fetch(url, {
    method,
    headers: headersMap,
    body: options?.body,
  });
  const text = await directRes.text();
  return { status: directRes.status, body: text };
}

/**
 * Unfold RFC 5545 folded lines (lines starting with space or tab continue the previous line)
 * and unescape iCal text sequences.
 */
function unfoldIcsLines(rawIcs: string): string[] {
  const unfolded = rawIcs.replace(/\r?\n[ \t]/g, "");
  return unfolded.split(/\r?\n/);
}

function unescapeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(rawVal: string, params: string): { iso: string; allDay: boolean } {
  const clean = rawVal.trim();
  const isDateOnly =
    params.toUpperCase().includes("VALUE=DATE") || /^\d{8}$/.test(clean);

  if (isDateOnly && clean.length >= 8) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return {
      iso: new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0).toISOString(),
      allDay: true,
    };
  }

  // Format: YYYYMMDDTHHmmssZ or YYYYMMDDTHHmmss
  const match = clean.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (match) {
    const [, y, m, d, hh, mm, ss, z] = match;
    if (z === "Z") {
      return {
        iso: new Date(
          Date.UTC(
            Number(y),
            Number(m) - 1,
            Number(d),
            Number(hh),
            Number(mm),
            Number(ss)
          )
        ).toISOString(),
        allDay: false,
      };
    }
    return {
      iso: new Date(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss)
      ).toISOString(),
      allDay: false,
    };
  }

  const parsed = new Date(clean);
  return {
    iso: isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
    allDay: false,
  };
}

/**
 * Parses an iCal (.ics) feed string into CalendarEventItem[]
 * Supports standard VEVENT fields and basic RRULE expansion (DAILY, WEEKLY, MONTHLY, YEARLY).
 */
export function parseIcsFeed(
  rawIcs: string,
  account: GoogleCalendarAccount
): CalendarEventItem[] {
  const lines = unfoldIcsLines(rawIcs);
  const events: CalendarEventItem[] = [];

  let inEvent = false;
  let uid = "";
  let summary = "";
  let description = "";
  let location = "";
  let status: "confirmed" | "tentative" | "cancelled" = "confirmed";
  let startISO = "";
  let endISO = "";
  let allDay = false;
  let rrule = "";

  const windowStart = subMonths(new Date(), 3);
  const windowEnd = addMonths(new Date(), 6);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      summary = "";
      description = "";
      location = "";
      status = "confirmed";
      startISO = "";
      endISO = "";
      allDay = false;
      rrule = "";
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent && startISO && status !== "cancelled") {
        const finalEndISO =
          endISO ||
          new Date(new Date(startISO).getTime() + 3600 * 1000).toISOString();

        const baseEvent: CalendarEventItem = {
          id: `gcal_ics_${account.id}_${uid || generateId("ev")}`,
          title: summary || "(No Title)",
          description: description || undefined,
          location: location || undefined,
          startISO,
          endISO: finalEndISO,
          allDay,
          color: account.color || "#3b82f6",
          source: "google",
          calendarId: account.id,
          calendarName: account.name,
          status,
        };

        events.push(baseEvent);

        // Expand simple RRULE occurrences within [windowStart, windowEnd]
        if (rrule) {
          const freqMatch = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
          const countMatch = rrule.match(/COUNT=(\d+)/i);
          const untilMatch = rrule.match(/UNTIL=([0-9TZ]+)/i);

          if (freqMatch) {
            const freq = freqMatch[1].toUpperCase();
            const maxCount = countMatch ? Math.min(Number(countMatch[1]), 90) : 60;
            const untilDate = untilMatch
              ? new Date(parseIcsDate(untilMatch[1], "").iso)
              : windowEnd;
            const durationMs =
              new Date(finalEndISO).getTime() - new Date(startISO).getTime();

            let curStart = new Date(startISO);
            for (let i = 1; i < maxCount; i++) {
              if (freq === "DAILY") curStart = addDays(curStart, 1);
              else if (freq === "WEEKLY") curStart = addWeeks(curStart, 1);
              else if (freq === "MONTHLY") curStart = addMonths(curStart, 1);
              else if (freq === "YEARLY") curStart = addYears(curStart, 1);

              if (curStart > untilDate || curStart > windowEnd) break;
              if (curStart < windowStart) continue;

              const curEnd = new Date(curStart.getTime() + durationMs);
              events.push({
                ...baseEvent,
                id: `${baseEvent.id}_r${i}`,
                startISO: curStart.toISOString(),
                endISO: curEnd.toISOString(),
              });
            }
          }
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const left = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1);
    const [propName, ...paramParts] = left.split(";");
    const upperProp = propName.toUpperCase();
    const params = paramParts.join(";");

    switch (upperProp) {
      case "UID":
        uid = val.trim();
        break;
      case "SUMMARY":
        summary = unescapeIcsText(val);
        break;
      case "DESCRIPTION":
        description = unescapeIcsText(val);
        break;
      case "LOCATION":
        location = unescapeIcsText(val);
        break;
      case "STATUS":
        if (val.toUpperCase().includes("CANCELLED")) status = "cancelled";
        else if (val.toUpperCase().includes("TENTATIVE")) status = "tentative";
        break;
      case "DTSTART": {
        const parsed = parseIcsDate(val, params);
        startISO = parsed.iso;
        allDay = parsed.allDay;
        break;
      }
      case "DTEND": {
        const parsed = parseIcsDate(val, params);
        endISO = parsed.iso;
        break;
      }
      case "RRULE":
        rrule = val.trim();
        break;
    }
  }

  return events;
}

/**
 * Fetches events from a Google Calendar account via:
 * - Mode "ical": Private iCal (.ics) feed URL
 * - Mode "oauth": Google Calendar API v3 with OAuth 2.0 Bearer Access Token
 * - Mode "apikey": Google Calendar API v3 with Calendar ID + API Key
 */
export async function syncGoogleCalendarAccount(
  account: GoogleCalendarAccount
): Promise<CalendarEventItem[]> {
  if (account.mode === "ical") {
    const url = account.icalUrl?.trim();
    if (!url) {
      throw new Error("Please provide a valid Google Calendar .ics URL");
    }
    const { status, body } = await siyuanFetchText(url);
    if (status < 200 || status >= 300) {
      throw new Error(`Failed to fetch iCal feed (HTTP ${status})`);
    }
    if (!body.includes("BEGIN:VCALENDAR")) {
      throw new Error("URL did not return a valid iCalendar (.ics) feed");
    }
    return parseIcsFeed(body, account);
  }

  // Google Calendar REST API v3 ("oauth" or "apikey")
  const calId = encodeURIComponent(account.calendarId?.trim() || "primary");
  const timeMin = subMonths(new Date(), 2).toISOString();
  const timeMax = addMonths(new Date(), 6).toISOString();

  let apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?singleEvents=true&orderBy=startTime&maxResults=500&timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (account.mode === "oauth") {
    const token = account.accessToken?.trim();
    if (!token) {
      throw new Error("OAuth Access Token is required for OAuth mode");
    }
    headers["Authorization"] = `Bearer ${token}`;
  } else if (account.mode === "apikey") {
    const key = account.apiKey?.trim();
    if (!key) {
      throw new Error("Google API Key is required for API Key mode");
    }
    apiUrl += `&key=${encodeURIComponent(key)}`;
  }

  const { status, body } = await siyuanFetchText(apiUrl, { headers });
  if (status < 200 || status >= 300) {
    let errMsg = `Google Calendar API HTTP ${status}`;
    try {
      const errJson = JSON.parse(body);
      if (errJson?.error?.message) {
        errMsg = `Google API Error: ${errJson.error.message}`;
      }
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const data = JSON.parse(body);
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .filter((item: any) => item.status !== "cancelled")
    .map((item: any): CalendarEventItem => {
      const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
      const rawStart = item.start?.dateTime || item.start?.date;
      const rawEnd = item.end?.dateTime || item.end?.date || rawStart;

      const startDate = isAllDay
        ? new Date(`${rawStart}T00:00:00`)
        : new Date(rawStart);
      const endDate = isAllDay
        ? new Date(`${rawEnd}T23:59:59`)
        : new Date(rawEnd);

      return {
        id: `gcal_api_${account.id}_${item.id}`,
        title: item.summary || "(No Title)",
        description: item.description || undefined,
        location: item.location || undefined,
        startISO: isNaN(startDate.getTime())
          ? new Date().toISOString()
          : startDate.toISOString(),
        endISO: isNaN(endDate.getTime())
          ? new Date(Date.now() + 3600000).toISOString()
          : endDate.toISOString(),
        allDay: isAllDay,
        color: account.color || "#3b82f6",
        source: "google",
        calendarId: account.id,
        calendarName: account.name,
        htmlLink: item.htmlLink,
        status: item.status || "confirmed",
      };
    });
}

/**
 * Creates a new event directly on Google Calendar when an OAuth 2.0 account is connected.
 */
export async function createGoogleCalendarEventRemote(
  account: GoogleCalendarAccount,
  event: {
    title: string;
    description?: string;
    location?: string;
    startISO: string;
    endISO: string;
    allDay: boolean;
  }
): Promise<CalendarEventItem> {
  if (account.mode !== "oauth" || !account.accessToken?.trim()) {
    throw new Error("Creating Google Calendar events requires an OAuth Access Token");
  }

  const calId = encodeURIComponent(account.calendarId?.trim() || "primary");
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`;

  const payload = {
    summary: event.title,
    description: event.description || "",
    location: event.location || "",
    start: event.allDay
      ? { date: event.startISO.slice(0, 10) }
      : { dateTime: new Date(event.startISO).toISOString() },
    end: event.allDay
      ? { date: event.endISO.slice(0, 10) }
      : { dateTime: new Date(event.endISO).toISOString() },
  };

  const { status, body } = await siyuanFetchText(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (status < 200 || status >= 300) {
    let errMsg = `Failed to create Google Calendar event (HTTP ${status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) errMsg = parsed.error.message;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const item = JSON.parse(body);
  return {
    id: `gcal_api_${account.id}_${item.id}`,
    title: item.summary || event.title,
    description: item.description,
    location: item.location,
    startISO: event.startISO,
    endISO: event.endISO,
    allDay: event.allDay,
    color: account.color || "#3b82f6",
    source: "google",
    calendarId: account.id,
    calendarName: account.name,
    htmlLink: item.htmlLink,
    status: "confirmed",
  };
}
