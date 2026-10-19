import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDurationMs(ms: number, includeMs = false): {
  hours: string;
  minutes: string;
  seconds: string;
  centiseconds: string;
  formatted: string;
} {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((safeMs % 1000) / 10);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cs = String(centiseconds).padStart(2, "0");

  const base = hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  return {
    hours: hh,
    minutes: mm,
    seconds: ss,
    centiseconds: cs,
    formatted: includeMs ? `${base}.${cs}` : base,
  };
}

export function generateId(prefix = "tmp"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
