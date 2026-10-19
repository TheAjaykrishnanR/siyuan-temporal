import * as React from "react";

export const ShadcnPortalContext = React.createContext<HTMLElement | null>(null);

let fallbackPortalContainer: HTMLElement | null = null;

export function setDefaultPortalContainer(el: HTMLElement | null) {
  fallbackPortalContainer = el;
}

export function useShadcnPortalContainer(): HTMLElement | undefined {
  const ctxEl = React.useContext(ShadcnPortalContext);
  if (ctxEl) return ctxEl;
  if (fallbackPortalContainer) return fallbackPortalContainer;
  if (typeof document !== "undefined") return document.body;
  return undefined;
}
