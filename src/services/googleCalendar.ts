import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  subMonths,
} from "date-fns";
import {
  CalendarEventItem,
  EventAttachment,
  EventAttendee,
  EventConferenceDetails,
  GoogleCalendarAccount,
} from "@/types/temporal";
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
  if (!val) return "";
  return val
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\:/g, ":")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Extracts a Google Meet, Zoom, Teams, or Webex video meeting link from given text strings.
 */
export function extractMeetingLink(
  ...sources: (string | undefined | null)[]
): string | undefined {
  for (const src of sources) {
    if (!src) continue;
    // 1. Google Meet: https://meet.google.com/xxx-yyyy-zzz or similar
    const meetMatch = src.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
    if (meetMatch) return meetMatch[0];

    // 2. Zoom: https://*.zoom.us/j/... or /my/...
    const zoomMatch = src.match(
      /https?:\/\/[a-zA-Z0-9.-]+\.zoom\.us\/(?:j\/[0-9]+|my\/[a-zA-Z0-9._-]+)[^\s"<>]*/i
    );
    if (zoomMatch) return zoomMatch[0];

    // 3. Microsoft Teams
    const teamsMatch = src.match(
      /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]*/i
    );
    if (teamsMatch) return teamsMatch[0];

    // 4. Cisco Webex
    const webexMatch = src.match(
      /https?:\/\/[a-zA-Z0-9.-]+\.webex\.com\/[^\s"<>]*/i
    );
    if (webexMatch) return webexMatch[0];
  }
  return undefined;
}

/**
 * Converts HTML-formatted event descriptions (as returned by Google Calendar API)
 * into clean markdown text that can be formatted and linked safely.
 */
export function cleanHtmlDescription(html?: string): string | undefined {
  if (!html) return undefined;
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.trim() || undefined;
  }
  let text = html
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, ""); // strip unknown tags
  return text.trim() || undefined;
}

/**
 * Checks whether a URL points to Google Drive or Google Docs.
 */
export function isGoogleDriveUrl(url?: string): boolean {
  if (!url) return false;
  return /https?(?::|\\:)\/\/(?:drive|docs)\.google\.com\//i.test(url);
}

/**
 * Normalizes an attachment or file title to avoid ugly values like "view", "open", or empty strings.
 */
export function cleanAttachmentTitle(
  rawTitle: string | undefined,
  url: string,
  fallback = "Attachment"
): string {
  if (rawTitle && rawTitle.trim()) {
    const trimmed = rawTitle.trim();
    const lower = trimmed.toLowerCase();
    if (
      lower !== "view" &&
      lower !== "open" &&
      lower !== "preview" &&
      lower !== "edit" &&
      lower !== "attachment" &&
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://")
    ) {
      return trimmed;
    }
  }

  // Try extracting meaningful filename from URL path if possible
  try {
    const cleanUrl = url.replace(/\\:/g, ":");
    const parsed = new URL(cleanUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && !["view", "open", "preview", "edit"].includes(lastPart.toLowerCase())) {
      const decoded = decodeURIComponent(lastPart.split("?")[0]);
      if (decoded.length > 2) return decoded;
    }
  } catch {
    // ignore URL parsing error
  }

  if (isGoogleDriveUrl(url)) {
    if (url.includes("/folders/")) return "Google Drive Folder";
    if (url.includes("docs.google.com/document")) return "Google Docs Transcript / Notes";
    if (url.includes("docs.google.com/presentation")) return "Google Slides Presentation";
    if (url.includes("docs.google.com/spreadsheets")) return "Google Sheets";
    return "Google Drive File";
  }

  return fallback;
}

/**
 * Determines whether a given attachment, URL, or metadata indicates a meeting recording.
 */
export function isRecordingAttachment(
  att: {
    title?: string;
    fileUrl?: string;
    mimeType?: string;
    isRecording?: boolean;
  },
  context?: { hasMeetLink?: boolean }
): boolean {
  if (att.isRecording) return true;

  const mime = (att.mimeType || "").toLowerCase();
  if (
    mime.startsWith("video/") ||
    mime.includes("mp4") ||
    mime.includes("webm") ||
    mime.includes("matroska")
  ) {
    return true;
  }

  const title = (att.title || "").toLowerCase();
  const url = (att.fileUrl || "").toLowerCase();

  // File extension checks
  if (
    /\.(mp4|webm|mkv|mov|m4v|avi|wmv)(\?.*)?$/i.test(title) ||
    /\.(mp4|webm|mkv|mov|m4v|avi|wmv)(\?.*)?$/i.test(url)
  ) {
    return true;
  }

  // Recording keyword checks
  if (
    /\b(recording|recordings|recorded|replay|meeting\s+recording|meet\s+recording|call\s+recording)\b/i.test(
      title
    ) ||
    /\b(recording|recordings|recorded|replay|meet\s+recording)\b/i.test(url)
  ) {
    return true;
  }

  // Google Meet standard recording naming convention in Drive:
  // e.g. "abc-defg-hij (2026-10-24 10:00 GMT+X)" or "abc-defg-hij - recording"
  if (
    /[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}/i.test(title) &&
    (title.includes("gmt") ||
      title.includes("utc") ||
      title.includes("202") ||
      title.includes("recording"))
  ) {
    return true;
  }

  // If this attachment is on a Google Meeting event and points to a Google Drive file
  if (context?.hasMeetLink && isGoogleDriveUrl(att.fileUrl)) {
    if (
      !url.includes("docs.google.com/spreadsheets") &&
      !url.includes("docs.google.com/presentation")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts Google Drive attachments and recordings from text (descriptions, notes, etc.)
 */
export function extractDriveAttachmentsFromText(
  text?: string,
  eventContext?: { hasMeetLink?: boolean; defaultTitlePrefix?: string }
): EventAttachment[] {
  if (!text) return [];

  const cleanText = unescapeIcsText(text);
  const found: EventAttachment[] = [];
  const seenUrls = new Set<string>();

  const addAttachment = (
    rawUrl: string,
    rawTitle?: string,
    forceRecording?: boolean
  ) => {
    let cleanUrl = unescapeIcsText(rawUrl).trim();
    cleanUrl = cleanUrl.replace(/^[<"'\s\(\[]+|[>"'\s\)\].,;:]+$/g, "");
    if (!cleanUrl || !isGoogleDriveUrl(cleanUrl)) return;

    // Normalize URL key to avoid duplicate entries for the same Drive file
    const urlKey = cleanUrl.split("?")[0].toLowerCase();
    if (seenUrls.has(urlKey)) return;
    seenUrls.add(urlKey);

    let title = cleanAttachmentTitle(rawTitle, cleanUrl);
    const isRec = Boolean(
      forceRecording ||
        isRecordingAttachment(
          { title, fileUrl: cleanUrl },
          { hasMeetLink: eventContext?.hasMeetLink }
        ) ||
        (rawTitle &&
          /\b(recording|recorded|replay|watch\s+recording|meet\s+recording|call\s+recording|video)\b/i.test(
            rawTitle
          )) ||
        eventContext?.hasMeetLink
    );

    if (
      isRec &&
      (title === "Google Drive File" || title === "Attachment" || !title)
    ) {
      title = eventContext?.defaultTitlePrefix
        ? `${eventContext.defaultTitlePrefix} - Recording`
        : "Google Meet Recording";
    }

    found.push({
      title,
      fileUrl: cleanUrl,
      mimeType: isRec ? "video/mp4" : undefined,
      isRecording: isRec,
    });
  };

  // 1. Markdown links: [Title](https://drive.google.com/...)
  const mdRegex =
    /\[([^\]]+)\]\((https?(?::|\\:)\/\/(?:drive|docs)\.google\.com\/[^\s)]+)\)/gi;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdRegex.exec(cleanText)) !== null) {
    const label = mdMatch[1].trim();
    const url = mdMatch[2].trim();
    const isRec =
      /\b(recording|recorded|replay|watch\s+recording|meet\s+recording|call\s+recording)\b/i.test(
        label
      );
    addAttachment(url, label, isRec);
  }

  // 2. HTML links: <a href="https://drive.google.com/...">Title</a>
  const htmlRegex =
    /<a\s+[^>]*href=["'](https?(?::|\\:)\/\/(?:drive|docs)\.google\.com\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlRegex.exec(cleanText)) !== null) {
    const url = htmlMatch[1].trim();
    const rawLabel = htmlMatch[2].replace(/<[^>]+>/g, "").trim();
    const isRec =
      /\b(recording|recorded|replay|watch\s+recording|meet\s+recording|call\s+recording)\b/i.test(
        rawLabel
      );
    addAttachment(url, rawLabel, isRec);
  }

  // 3. Common plain-text labeled patterns like:
  // "View recording: https://drive.google.com/..."
  // "Meeting recording: <https://drive.google.com/...>"
  // "Recording: https://drive.google.com/..."
  const labeledRegex =
    /(?:view\s+recording|meeting\s+recording|call\s+recording|video\s+recording|watch\s+recording|recording|replay)[\s:\-–—\(\[<]+(https?(?::|\\:)\/\/(?:drive|docs)\.google\.com\/[^\s<>"'\)\]]+)/gi;
  let labeledMatch: RegExpExecArray | null;
  while ((labeledMatch = labeledRegex.exec(cleanText)) !== null) {
    addAttachment(labeledMatch[1], "Google Meet Recording", true);
  }

  // 4. Raw Google Drive file or folder links in plain text
  const rawDriveRegex =
    /(https?(?::|\\:)\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/[a-zA-Z0-9_-]+|open\?[a-zA-Z0-9_=&-]+|drive\/folders\/[a-zA-Z0-9_-]+|document\/d\/[a-zA-Z0-9_-]+)[^\s<>"'\)\]]*)/gi;
  let rawMatch: RegExpExecArray | null;
  while ((rawMatch = rawDriveRegex.exec(cleanText)) !== null) {
    const url = rawMatch[1];
    const windowStart = Math.max(0, rawMatch.index - 150);
    const windowEnd = Math.min(cleanText.length, rawMatch.index + 200);
    const contextWindow = cleanText.slice(windowStart, windowEnd);
    const isNearbyRec =
      /\b(recording|recorded|replay|video|meet|call|session|watch)\b/i.test(
        contextWindow
      );
    const isRec = Boolean(isNearbyRec || eventContext?.hasMeetLink);
    addAttachment(url, undefined, isRec);
  }

  return found;
}

/**
 * Returns all recordings associated with an event, checking explicit recordings[],
 * attachments[], descriptions, locations, and conference notes.
 */
export function getEventRecordings(
  event?: CalendarEventItem | null
): EventAttachment[] {
  if (!event) return [];

  const recordings: EventAttachment[] = [];
  const seenUrls = new Set<string>();
  const hasMeet = Boolean(
    event.meetLink ||
      event.conferenceDetails?.solutionName?.toLowerCase().includes("meet") ||
      event.conferenceDetails?.videoUri
  );

  const addRec = (rec: EventAttachment) => {
    const url = rec.fileUrl?.trim();
    if (!url) return;
    const urlKey = url.split("?")[0].toLowerCase();
    if (seenUrls.has(urlKey)) return;
    seenUrls.add(urlKey);

    let title = rec.title?.trim() || "";
    if (
      !title ||
      title.toLowerCase() === "view" ||
      title.toLowerCase() === "attachment" ||
      title.toLowerCase() === "google drive file"
    ) {
      title = event.title
        ? `${event.title} – Recording`
        : "Google Meet Recording";
    }

    recordings.push({
      ...rec,
      title,
      isRecording: true,
      mimeType: rec.mimeType || "video/mp4",
    });
  };

  // 1. Check explicit recordings array on the event
  if (Array.isArray(event.recordings)) {
    for (const r of event.recordings) {
      addRec(r);
    }
  }

  // 2. Check attachments array
  if (Array.isArray(event.attachments)) {
    for (const att of event.attachments) {
      if (isRecordingAttachment(att, { hasMeetLink: hasMeet })) {
        addRec(att);
      }
    }
  }

  // 3. Check description, location, and conference notes
  const textDriveLinks = [
    ...extractDriveAttachmentsFromText(event.description, {
      hasMeetLink: hasMeet,
      defaultTitlePrefix: event.title,
    }),
    ...extractDriveAttachmentsFromText(event.location, {
      hasMeetLink: hasMeet,
      defaultTitlePrefix: event.title,
    }),
    ...extractDriveAttachmentsFromText(event.conferenceDetails?.notes, {
      hasMeetLink: hasMeet,
      defaultTitlePrefix: event.title,
    }),
  ];

  for (const link of textDriveLinks) {
    if (
      link.isRecording ||
      isRecordingAttachment(link, { hasMeetLink: hasMeet })
    ) {
      addRec(link);
    }
  }

  // 4. Fallback for Google Meeting events:
  // If the event has a Google Meeting (or video meeting), any attached Google Drive file link
  // (drive.google.com/file/d/... or open?id=...) is a meeting recording!
  if (hasMeet && recordings.length === 0) {
    if (Array.isArray(event.attachments)) {
      for (const att of event.attachments) {
        if (
          isGoogleDriveUrl(att.fileUrl) &&
          !att.fileUrl.includes("docs.google.com/spreadsheets") &&
          !att.fileUrl.includes("docs.google.com/presentation")
        ) {
          addRec(att);
        }
      }
    }
    for (const link of textDriveLinks) {
      if (
        isGoogleDriveUrl(link.fileUrl) &&
        !link.fileUrl.includes("docs.google.com/spreadsheets") &&
        !link.fileUrl.includes("docs.google.com/presentation")
      ) {
        addRec(link);
      }
    }
  }

  return recordings;
}

/**
 * Combines all attachments on an event (native attachments + parsed Drive links),
 * ensuring recordings are properly flagged and deduplicated.
 */
export function getAllEventAttachments(
  event?: CalendarEventItem | null
): EventAttachment[] {
  if (!event) return [];

  const combined: EventAttachment[] = [];
  const seenUrls = new Set<string>();
  const hasMeet = Boolean(
    event.meetLink ||
      event.conferenceDetails?.solutionName?.toLowerCase().includes("meet")
  );

  const add = (att: EventAttachment) => {
    const url = att.fileUrl?.trim();
    if (!url) return;
    const urlKey = url.split("?")[0].toLowerCase();
    if (seenUrls.has(urlKey)) return;
    seenUrls.add(urlKey);

    const isRec = Boolean(
      att.isRecording || isRecordingAttachment(att, { hasMeetLink: hasMeet })
    );
    const title = cleanAttachmentTitle(
      att.title,
      url,
      isRec ? "Google Meet Recording" : "Attachment"
    );

    combined.push({
      ...att,
      title,
      isRecording: isRec,
    });
  };

  if (Array.isArray(event.attachments)) {
    for (const a of event.attachments) add(a);
  }
  if (Array.isArray(event.recordings)) {
    for (const r of event.recordings) add(r);
  }

  const fromDesc = [
    ...extractDriveAttachmentsFromText(event.description, {
      hasMeetLink: hasMeet,
      defaultTitlePrefix: event.title,
    }),
    ...extractDriveAttachmentsFromText(event.location, {
      hasMeetLink: hasMeet,
      defaultTitlePrefix: event.title,
    }),
    ...extractDriveAttachmentsFromText(event.conferenceDetails?.notes, {
      hasMeetLink: hasMeet,
      defaultTitlePrefix: event.title,
    }),
  ];
  for (const d of fromDesc) add(d);

  return combined;
}

function parseIcsDate(
  rawVal: string,
  params: string = ""
): { iso: string; allDay: boolean; timeMs: number } {
  const clean = rawVal.trim();
  const isDateOnly =
    params.toUpperCase().includes("VALUE=DATE") || /^\d{8}$/.test(clean);

  if (isDateOnly && clean.length >= 8) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const dt = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0);
    return {
      iso: dt.toISOString(),
      allDay: true,
      timeMs: dt.getTime(),
    };
  }

  // Format: YYYYMMDDTHHmmssZ or YYYYMMDDTHHmmss
  const match = clean.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (match) {
    const [, y, m, d, hh, mm, ss, z] = match;
    if (z === "Z") {
      const dt = new Date(
        Date.UTC(
          Number(y),
          Number(m) - 1,
          Number(d),
          Number(hh),
          Number(mm),
          Number(ss)
        )
      );
      return {
        iso: dt.toISOString(),
        allDay: false,
        timeMs: dt.getTime(),
      };
    }
    const dt = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
    return {
      iso: dt.toISOString(),
      allDay: false,
      timeMs: dt.getTime(),
    };
  }

  const parsed = new Date(clean);
  const t = parsed.getTime();
  return {
    iso: isNaN(t) ? new Date().toISOString() : parsed.toISOString(),
    allDay: false,
    timeMs: isNaN(t) ? Date.now() : t,
  };
}

interface RawIcsBlock {
  uid: string;
  recurrenceIdMs: number | null;
  exdatesMs: number[];
  sequence: number;
  status: "confirmed" | "tentative" | "cancelled";
  summary: string;
  description: string;
  location: string;
  startISO: string;
  startTimeMs: number;
  endISO: string;
  allDay: boolean;
  rrule: string;
  conferenceLink: string;
  organizer?: { displayName?: string; email?: string };
  attendees: EventAttendee[];
  attachments: EventAttachment[];
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  createdISO?: string;
  updatedISO?: string;
}

/**
 * Parses an iCal (.ics) feed string into CalendarEventItem[]
 * Fully conforms to RFC 5545 recurrence semantics:
 * - Accurately applies RECURRENCE-ID exceptions (modified/rescheduled instances override master)
 * - Excludes cancelled occurrences via EXDATE and STATUS:CANCELLED
 * - Expands master RRULE occurrences without creating duplicates of overridden/cancelled instances
 * - Assigns unique, deterministic IDs per occurrence
 */
export function parseIcsFeed(
  rawIcs: string,
  account: GoogleCalendarAccount
): CalendarEventItem[] {
  const lines = unfoldIcsLines(rawIcs);
  const rawBlocks: RawIcsBlock[] = [];

  let inEvent = false;
  let uid = "";
  let recurrenceIdMs: number | null = null;
  let exdatesMs: number[] = [];
  let sequence = 0;
  let summary = "";
  let description = "";
  let location = "";
  let status: "confirmed" | "tentative" | "cancelled" = "confirmed";
  let startISO = "";
  let startTimeMs = 0;
  let endISO = "";
  let allDay = false;
  let rrule = "";
  let conferenceLink = "";
  let organizer: { displayName?: string; email?: string } | undefined = undefined;
  let attendees: EventAttendee[] = [];
  let attachments: EventAttachment[] = [];
  let transparency: "opaque" | "transparent" | undefined = undefined;
  let visibility: "default" | "public" | "private" | "confidential" | undefined = undefined;
  let createdISO: string | undefined = undefined;
  let updatedISO: string | undefined = undefined;
  let rawBlockLines: string[] = [];
  let altDesc = "";
  let driveUrlsInBlock: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      rawBlockLines = [];
      uid = "";
      recurrenceIdMs = null;
      exdatesMs = [];
      sequence = 0;
      summary = "";
      description = "";
      altDesc = "";
      location = "";
      status = "confirmed";
      startISO = "";
      startTimeMs = 0;
      endISO = "";
      allDay = false;
      rrule = "";
      conferenceLink = "";
      organizer = undefined;
      attendees = [];
      attachments = [];
      driveUrlsInBlock = [];
      transparency = undefined;
      visibility = undefined;
      createdISO = undefined;
      updatedISO = undefined;
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent && startISO) {
        const finalEndISO =
          endISO ||
          new Date(startTimeMs + 3600 * 1000).toISOString();

        const fullBlockText = unescapeIcsText(rawBlockLines.join("\n"));
        const meetLink =
          conferenceLink ||
          extractMeetingLink(
            conferenceLink,
            location,
            description,
            altDesc,
            fullBlockText
          );
        const hasMeetLink = Boolean(meetLink);

        // Gather all Drive links found from all sources in this block
        const blockDriveLinks = [
          ...driveUrlsInBlock.map((u) => ({
            title: cleanAttachmentTitle(
              undefined,
              u,
              hasMeetLink ? "Google Meet Recording" : "Attachment"
            ),
            fileUrl: u,
            isRecording:
              hasMeetLink ||
              isRecordingAttachment({ fileUrl: u }, { hasMeetLink }),
          })),
          ...extractDriveAttachmentsFromText(description, {
            hasMeetLink,
            defaultTitlePrefix: summary,
          }),
          ...extractDriveAttachmentsFromText(altDesc, {
            hasMeetLink,
            defaultTitlePrefix: summary,
          }),
          ...extractDriveAttachmentsFromText(location, {
            hasMeetLink,
            defaultTitlePrefix: summary,
          }),
          ...extractDriveAttachmentsFromText(fullBlockText, {
            hasMeetLink,
            defaultTitlePrefix: summary,
          }),
        ];

        const seenAttUrls = new Set(
          attachments.map((a) => a.fileUrl.split("?")[0].toLowerCase())
        );
        for (const dl of blockDriveLinks) {
          const k = dl.fileUrl.split("?")[0].toLowerCase();
          if (!seenAttUrls.has(k)) {
            seenAttUrls.add(k);
            attachments.push(dl);
          }
        }

        rawBlocks.push({
          uid: uid || generateId("ev"),
          recurrenceIdMs,
          exdatesMs,
          sequence,
          summary,
          description: description || altDesc,
          location,
          status,
          startISO,
          startTimeMs,
          endISO: finalEndISO,
          allDay,
          rrule,
          conferenceLink: meetLink || conferenceLink,
          organizer,
          attendees,
          attachments,
          transparency,
          visibility,
          createdISO,
          updatedISO,
        });
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;
    rawBlockLines.push(line);

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
      case "RECURRENCE-ID": {
        const parsed = parseIcsDate(val, params);
        recurrenceIdMs = parsed.timeMs;
        break;
      }
      case "EXDATE": {
        const parts = val.split(",");
        for (const pt of parts) {
          const parsed = parseIcsDate(pt, params);
          if (parsed.timeMs) {
            exdatesMs.push(parsed.timeMs);
          }
        }
        break;
      }
      case "SEQUENCE":
        sequence = parseInt(val.trim(), 10) || 0;
        break;
      case "SUMMARY":
        summary = unescapeIcsText(val);
        break;
      case "DESCRIPTION":
        description = unescapeIcsText(val);
        break;
      case "X-ALT-DESC":
        altDesc = unescapeIcsText(val);
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
        startTimeMs = parsed.timeMs;
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
      case "X-GOOGLE-CONFERENCE":
      case "CONFERENCE":
        conferenceLink = unescapeIcsText(val).trim();
        break;
      case "URL": {
        const cleanUrl = unescapeIcsText(val).replace(/^[<"'\s]+|[>"'\s]+$/g, "");
        if (
          cleanUrl.includes("meet.google.com") ||
          cleanUrl.includes("zoom.us") ||
          cleanUrl.includes("teams.microsoft.com") ||
          cleanUrl.includes("webex.com")
        ) {
          conferenceLink = cleanUrl;
        } else if (isGoogleDriveUrl(cleanUrl)) {
          driveUrlsInBlock.push(cleanUrl);
        }
        break;
      }
      case "ORGANIZER": {
        const cnMatch = params.match(/CN=([^;]+)/i);
        const email = val.replace(/^mailto:/i, "").trim();
        organizer = {
          displayName: cnMatch ? cnMatch[1].replace(/^["']|["']$/g, "") : undefined,
          email: email || undefined,
        };
        break;
      }
      case "ATTENDEE": {
        const cnMatch = params.match(/CN=([^;]+)/i);
        const partStatMatch = params.match(/PARTSTAT=(ACCEPTED|DECLINED|TENTATIVE|NEEDS-ACTION)/i);
        const email = val.replace(/^mailto:/i, "").trim();
        let responseStatus: "accepted" | "declined" | "tentative" | "needsAction" = "needsAction";
        if (partStatMatch) {
          const ps = partStatMatch[1].toUpperCase();
          if (ps === "ACCEPTED") responseStatus = "accepted";
          else if (ps === "DECLINED") responseStatus = "declined";
          else if (ps === "TENTATIVE") responseStatus = "tentative";
        }
        attendees.push({
          displayName: cnMatch ? cnMatch[1].replace(/^["']|["']$/g, "") : undefined,
          email,
          responseStatus,
        });
        break;
      }
      case "ATTACH": {
        const unescapedVal = unescapeIcsText(val).trim();
        const cleanUrl = unescapedVal.replace(/^[<"'\s]+|[>"'\s]+$/g, "");
        if (cleanUrl.startsWith("http")) {
          const fnMatch = params.match(/(?:FILENAME|X-FILENAME)=["']?([^"';]+)["']?/i);
          const mimeMatch = params.match(/FMTTYPE=([^;]+)/i);
          const rawTitle = fnMatch ? fnMatch[1].trim() : undefined;
          const mimeType = mimeMatch ? mimeMatch[1].trim() : undefined;
          const title = cleanAttachmentTitle(rawTitle, cleanUrl, "Attachment");
          const isRec = isRecordingAttachment(
            { title, fileUrl: cleanUrl, mimeType },
            { hasMeetLink: Boolean(conferenceLink) }
          );
          attachments.push({
            title,
            fileUrl: cleanUrl,
            mimeType,
            isRecording: isRec,
          });
        }
        break;
      }
      default: {
        if (upperProp.includes("ATTACH") || upperProp.includes("RECORDING")) {
          const cleanUrl = unescapeIcsText(val).replace(/^[<"'\s]+|[>"'\s]+$/g, "");
          if (isGoogleDriveUrl(cleanUrl)) {
            driveUrlsInBlock.push(cleanUrl);
          }
        }
        break;
      }
      case "TRANSP":
        transparency = val.toUpperCase().includes("TRANSPARENT") ? "transparent" : "opaque";
        break;
      case "CLASS": {
        const c = val.toUpperCase();
        if (c.includes("PRIVATE")) visibility = "private";
        else if (c.includes("CONFIDENTIAL")) visibility = "confidential";
        else visibility = "public";
        break;
      }
      case "CREATED": {
        const parsed = parseIcsDate(val, params);
        createdISO = parsed.iso;
        break;
      }
      case "LAST-MODIFIED": {
        const parsed = parseIcsDate(val, params);
        updatedISO = parsed.iso;
        break;
      }
    }
  }

  // Group raw blocks by UID
  const byUid = new Map<string, RawIcsBlock[]>();
  for (const block of rawBlocks) {
    const list = byUid.get(block.uid) || [];
    list.push(block);
    byUid.set(block.uid, list);
  }

  const windowStart = subMonths(new Date(), 3);
  const windowEnd = addMonths(new Date(), 6);
  const events: CalendarEventItem[] = [];

  for (const [uid, group] of byUid.entries()) {
    // Collect all EXDATE exclusions and RECURRENCE-ID overrides across all blocks of this event
    const exdateSet = new Set<number>();
    const overriddenSet = new Set<number>();

    for (const block of group) {
      for (const exMs of block.exdatesMs) {
        exdateSet.add(exMs);
      }
      if (block.recurrenceIdMs !== null) {
        overriddenSet.add(block.recurrenceIdMs);
      }
    }

    const masters = group.filter((b) => b.recurrenceIdMs === null);
    const exceptions = group.filter((b) => b.recurrenceIdMs !== null);

    // 1. Process exception occurrences (these represent modified/rescheduled instances in Google Calendar)
    for (const exc of exceptions) {
      if (exc.status === "cancelled") continue;

      const meetLink =
        exc.conferenceLink ||
        extractMeetingLink(exc.location, exc.description);
      const cleanedDesc = cleanHtmlDescription(exc.description);

      const hasMeet = Boolean(meetLink);
      const descDriveLinks = extractDriveAttachmentsFromText(exc.description, {
        hasMeetLink: hasMeet,
        defaultTitlePrefix: exc.summary,
      });
      const combinedAttachments = [...exc.attachments];
      const seenAttUrls = new Set(
        exc.attachments.map((a) => a.fileUrl.split("?")[0].toLowerCase())
      );
      for (const dl of descDriveLinks) {
        const k = dl.fileUrl.split("?")[0].toLowerCase();
        if (!seenAttUrls.has(k)) {
          seenAttUrls.add(k);
          combinedAttachments.push(dl);
        }
      }
      let recs = combinedAttachments.filter(
        (a) => a.isRecording || isRecordingAttachment(a, { hasMeetLink: hasMeet })
      );
      if (recs.length === 0 && hasMeet) {
        for (const att of combinedAttachments) {
          if (isGoogleDriveUrl(att.fileUrl)) {
            att.isRecording = true;
            if (!att.title || att.title === "Attachment") {
              att.title = cleanAttachmentTitle(att.title, att.fileUrl, "Google Meet Recording");
            }
            if (!recs.some((r) => r.fileUrl === att.fileUrl)) {
              recs.push(att);
            }
          }
        }
      }

      events.push({
        id: `gcal_ics_${account.id}_${uid}_${exc.startTimeMs}`,
        title: exc.summary || "(No Title)",
        description: cleanedDesc,
        location: exc.location || undefined,
        startISO: exc.startISO,
        endISO: exc.endISO,
        allDay: exc.allDay,
        color: account.color || "#3b82f6",
        source: "google",
        calendarId: account.id,
        calendarName: account.name,
        meetLink: meetLink || undefined,
        status: exc.status,
        organizer: exc.organizer,
        attendees: exc.attendees.length > 0 ? exc.attendees : undefined,
        attachments:
          combinedAttachments.length > 0 ? combinedAttachments : undefined,
        recordings: recs.length > 0 ? recs : undefined,
        transparency: exc.transparency,
        visibility: exc.visibility,
        createdISO: exc.createdISO,
        updatedISO: exc.updatedISO,
        rruleText: exc.rrule || undefined,
      });
    }

    // 2. Process master occurrence & expand RRULE
    for (const m of masters) {
      if (m.status === "cancelled") continue;

      const meetLink =
        m.conferenceLink ||
        extractMeetingLink(m.location, m.description);
      const cleanedDesc = cleanHtmlDescription(m.description);

      const hasMeet = Boolean(meetLink);
      const descDriveLinks = extractDriveAttachmentsFromText(m.description, {
        hasMeetLink: hasMeet,
        defaultTitlePrefix: m.summary,
      });
      const combinedAttachments = [...m.attachments];
      const seenAttUrls = new Set(
        m.attachments.map((a) => a.fileUrl.split("?")[0].toLowerCase())
      );
      for (const dl of descDriveLinks) {
        const k = dl.fileUrl.split("?")[0].toLowerCase();
        if (!seenAttUrls.has(k)) {
          seenAttUrls.add(k);
          combinedAttachments.push(dl);
        }
      }
      let recs = combinedAttachments.filter(
        (a) => a.isRecording || isRecordingAttachment(a, { hasMeetLink: hasMeet })
      );
      if (recs.length === 0 && hasMeet) {
        for (const att of combinedAttachments) {
          if (isGoogleDriveUrl(att.fileUrl)) {
            att.isRecording = true;
            if (!att.title || att.title === "Attachment") {
              att.title = cleanAttachmentTitle(att.title, att.fileUrl, "Google Meet Recording");
            }
            if (!recs.some((r) => r.fileUrl === att.fileUrl)) {
              recs.push(att);
            }
          }
        }
      }

      const baseItem: CalendarEventItem = {
        id: `gcal_ics_${account.id}_${uid}_${m.startTimeMs}`,
        title: m.summary || "(No Title)",
        description: cleanedDesc,
        location: m.location || undefined,
        startISO: m.startISO,
        endISO: m.endISO,
        allDay: m.allDay,
        color: account.color || "#3b82f6",
        source: "google",
        calendarId: account.id,
        calendarName: account.name,
        meetLink: meetLink || undefined,
        status: m.status,
        organizer: m.organizer,
        attendees: m.attendees.length > 0 ? m.attendees : undefined,
        attachments:
          combinedAttachments.length > 0 ? combinedAttachments : undefined,
        recordings: recs.length > 0 ? recs : undefined,
        transparency: m.transparency,
        visibility: m.visibility,
        createdISO: m.createdISO,
        updatedISO: m.updatedISO,
        rruleText: m.rrule || undefined,
      };

      // Output base occurrence if not cancelled in EXDATE and not replaced by an exception
      if (!exdateSet.has(m.startTimeMs) && !overriddenSet.has(m.startTimeMs)) {
        events.push(baseItem);
      }

      // Expand RRULE occurrences if present
      if (m.rrule) {
        const freqMatch = m.rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
        const countMatch = m.rrule.match(/COUNT=(\d+)/i);
        const untilMatch = m.rrule.match(/UNTIL=([0-9TZ]+)/i);

        if (freqMatch) {
          const freq = freqMatch[1].toUpperCase();
          const maxCount = countMatch ? Math.min(Number(countMatch[1]), 90) : 60;
          const untilMs = untilMatch
            ? parseIcsDate(untilMatch[1], "").timeMs
            : windowEnd.getTime();
          const durationMs =
            new Date(m.endISO).getTime() - new Date(m.startISO).getTime();

          let curStart = new Date(m.startTimeMs);
          for (let i = 1; i < maxCount; i++) {
            if (freq === "DAILY") curStart = addDays(curStart, 1);
            else if (freq === "WEEKLY") curStart = addWeeks(curStart, 1);
            else if (freq === "MONTHLY") curStart = addMonths(curStart, 1);
            else if (freq === "YEARLY") curStart = addYears(curStart, 1);
            else break;

            const t = curStart.getTime();
            if (t > untilMs || t > windowEnd.getTime()) break;
            if (t < windowStart.getTime()) continue;

            // Skip occurrences that were cancelled via EXDATE or replaced via RECURRENCE-ID
            if (exdateSet.has(t) || overriddenSet.has(t)) continue;

            const curEnd = new Date(t + durationMs);
            events.push({
              ...baseItem,
              id: `gcal_ics_${account.id}_${uid}_${t}`,
              startISO: curStart.toISOString(),
              endISO: curEnd.toISOString(),
            });
          }
        }
      }
    }
  }

  // Deduplicate before returning
  const seenIds = new Set<string>();
  const seenTimes = new Set<string>();
  const deduped: CalendarEventItem[] = [];

  for (const ev of events) {
    const timeKey = `${ev.calendarId}_${(ev.title || "").trim().toLowerCase()}_${ev.startISO}`;
    if (!seenIds.has(ev.id) && !seenTimes.has(timeKey)) {
      seenIds.add(ev.id);
      seenTimes.add(timeKey);
      deduped.push(ev);
    }
  }

  return deduped;
}

/**
 * Refreshes the Google OAuth 2.0 access token using the stored refresh_token,
 * clientId, and clientSecret.
 */
export async function refreshGoogleAccessToken(
  account: GoogleCalendarAccount
): Promise<string> {
  const refreshToken = account.refreshToken?.trim();
  const clientId = account.clientId?.trim();
  const clientSecret = account.clientSecret?.trim();

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Automatic token refresh requires Refresh Token, Client ID, and Client Secret."
    );
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  const { status, body } = await siyuanFetchText(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: payload,
    }
  );

  if (status < 200 || status >= 300) {
    let errMsg = `HTTP ${status}`;
    try {
      const errJson = JSON.parse(body);
      if (errJson?.error_description) {
        errMsg = errJson.error_description;
      } else if (errJson?.error) {
        errMsg = errJson.error;
      }
    } catch {
      // ignore
    }
    throw new Error(`Failed to refresh Google token (${errMsg})`);
  }

  const data = JSON.parse(body);
  if (!data.access_token) {
    throw new Error("Google did not return an access_token");
  }

  account.accessToken = data.access_token;
  return data.access_token;
}

/**
 * Fetches events from a Google Calendar account via:
 * - Mode "ical": Private iCal (.ics) feed URL
 * - Mode "oauth": Google Calendar API v3 with OAuth 2.0 Bearer Access Token (with auto-refresh)
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

  let apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?singleEvents=true&orderBy=startTime&maxResults=500&conferenceDataVersion=1&timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (account.mode === "oauth") {
    let token = account.accessToken?.trim();
    if (!token && account.refreshToken?.trim()) {
      token = await refreshGoogleAccessToken(account);
    }
    if (!token) {
      throw new Error("OAuth Access Token or Refresh Token is required for OAuth mode");
    }
    headers["Authorization"] = `Bearer ${token}`;
  } else if (account.mode === "apikey") {
    const key = account.apiKey?.trim();
    if (!key) {
      throw new Error("Google API Key is required for API Key mode");
    }
    apiUrl += `&key=${encodeURIComponent(key)}`;
  }

  let { status, body } = await siyuanFetchText(apiUrl, { headers });

  // If token expired (401) and we have refresh credentials, auto-refresh and retry once!
  if (
    status === 401 &&
    account.mode === "oauth" &&
    account.refreshToken?.trim() &&
    account.clientId?.trim() &&
    account.clientSecret?.trim()
  ) {
    try {
      const freshToken = await refreshGoogleAccessToken(account);
      headers["Authorization"] = `Bearer ${freshToken}`;
      const retryRes = await siyuanFetchText(apiUrl, { headers });
      status = retryRes.status;
      body = retryRes.body;
    } catch {
      // Fall through to standard error handling
    }
  }

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

      const conferenceUri = item.conferenceData?.entryPoints?.find(
        (ep: any) =>
          ep.entryPointType === "video" || ep.uri?.includes("meet.google.com")
      )?.uri;
      const meetLink =
        item.hangoutLink ||
        conferenceUri ||
        extractMeetingLink(item.location, item.description);

      const phoneEp = item.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === "phone"
      );
      const videoEp = item.conferenceData?.entryPoints?.find(
        (ep: any) =>
          ep.entryPointType === "video" || ep.uri?.includes("meet.google.com")
      );

      const conferenceDetails: EventConferenceDetails | undefined =
        item.conferenceData || meetLink
          ? {
              solutionName:
                item.conferenceData?.conferenceSolution?.name ||
                (meetLink?.includes("meet.google.com")
                  ? "Google Meet"
                  : meetLink?.includes("zoom.us")
                  ? "Zoom"
                  : meetLink?.includes("teams.microsoft.com")
                  ? "Microsoft Teams"
                  : undefined),
              videoUri: videoEp?.uri || meetLink,
              phoneUri: phoneEp?.uri || phoneEp?.label || undefined,
              phonePin: phoneEp?.pin || undefined,
              notes: item.conferenceData?.notes || undefined,
            }
          : undefined;

      const organizer = item.organizer
        ? {
            displayName: item.organizer.displayName || undefined,
            email: item.organizer.email || undefined,
            self: item.organizer.self,
          }
        : undefined;

      const creator = item.creator
        ? {
            displayName: item.creator.displayName || undefined,
            email: item.creator.email || undefined,
            self: item.creator.self,
          }
        : undefined;

      const attendees: EventAttendee[] = Array.isArray(item.attendees)
        ? item.attendees.map((att: any) => ({
            displayName: att.displayName || undefined,
            email: att.email || "",
            responseStatus: att.responseStatus || "needsAction",
            self: att.self,
            organizer: att.organizer,
            optional: att.optional,
          }))
        : [];

      const rawAttachments: EventAttachment[] = Array.isArray(item.attachments)
        ? item.attachments
            .map((att: any) => {
              const fileUrl =
                att.fileUrl ||
                att.url ||
                (att.fileId
                  ? `https://drive.google.com/file/d/${att.fileId}/view`
                  : "");
              const mimeType = att.mimeType || undefined;
              const title = cleanAttachmentTitle(att.title, fileUrl, "Attachment");
              const isRec = isRecordingAttachment({ title, fileUrl, mimeType });
              return {
                title,
                fileUrl,
                mimeType,
                iconLink: att.iconLink || undefined,
                isRecording: isRec,
              };
            })
            .filter((a: EventAttachment) => Boolean(a.fileUrl))
        : [];

      const descDriveLinks = [
        ...extractDriveAttachmentsFromText(item.description, {
          hasMeetLink: Boolean(meetLink),
          defaultTitlePrefix: item.summary,
        }),
        ...extractDriveAttachmentsFromText(item.conferenceData?.notes, {
          hasMeetLink: Boolean(meetLink),
          defaultTitlePrefix: item.summary,
        }),
      ];

      const combinedAttachments = [...rawAttachments];
      const seenAttUrls = new Set(
        rawAttachments.map((a) => a.fileUrl.split("?")[0].toLowerCase())
      );
      for (const dl of descDriveLinks) {
        const k = dl.fileUrl.split("?")[0].toLowerCase();
        if (!seenAttUrls.has(k)) {
          seenAttUrls.add(k);
          combinedAttachments.push(dl);
        }
      }

      const recordings = combinedAttachments.filter(
        (a) => a.isRecording || isRecordingAttachment(a)
      );

      return {
        id: `gcal_api_${account.id}_${item.id}`,
        title: item.summary || "(No Title)",
        description: cleanHtmlDescription(item.description),
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
        meetLink: meetLink || undefined,
        status: item.status || "confirmed",
        organizer,
        creator,
        attendees: attendees.length > 0 ? attendees : undefined,
        attachments:
          combinedAttachments.length > 0 ? combinedAttachments : undefined,
        recordings: recordings.length > 0 ? recordings : undefined,
        conferenceDetails,
        transparency: item.transparency || "opaque",
        visibility: item.visibility || "default",
        createdISO: item.created || undefined,
        updatedISO: item.updated || undefined,
        rruleText: Array.isArray(item.recurrence) ? item.recurrence.join("; ") : undefined,
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
  if (account.mode !== "oauth") {
    throw new Error("Creating Google Calendar events requires OAuth mode");
  }

  let token = account.accessToken?.trim();
  if (!token && account.refreshToken?.trim()) {
    token = await refreshGoogleAccessToken(account);
  }
  if (!token) {
    throw new Error("Creating Google Calendar events requires an OAuth Access Token or Refresh Token");
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

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let { status, body } = await siyuanFetchText(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (
    status === 401 &&
    account.refreshToken?.trim() &&
    account.clientId?.trim() &&
    account.clientSecret?.trim()
  ) {
    try {
      token = await refreshGoogleAccessToken(account);
      headers["Authorization"] = `Bearer ${token}`;
      const retryRes = await siyuanFetchText(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      status = retryRes.status;
      body = retryRes.body;
    } catch {
      // Fall through
    }
  }

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
    meetLink: item.hangoutLink || undefined,
    status: "confirmed",
  };
}
