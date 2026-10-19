import React from "react";
import { createRoot, Root } from "react-dom/client";
import {
  Plugin,
  Menu,
  openTab,
  getFrontend,
} from "siyuan";
import "./index.css";
import { ClockSubTab, TemporalSection } from "@/types/temporal";
import { temporalStore } from "@/services/store";
import { formatDurationMs } from "@/lib/utils";
import { TemporalHubApp } from "@/components/TemporalHubApp";

const TAB_TYPE = "temporal_hub";

export default class SiyuanTemporalPlugin extends Plugin {
  private isMobile = false;
  private tabRoots = new Map<Element, Root>();
  private statusBarEl: HTMLElement | null = null;
  private unsubscribeStore: (() => void) | null = null;

  onload() {
    const frontEnd = getFrontend();
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

    this.addIcons(`
      <symbol id="iconTemporal" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <polyline points="12 6 12 12 16 14" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalAlarm" viewBox="0 0 24 24">
        <circle cx="12" cy="13" r="8" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M12 9v4l2 2" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M5 3 2 6" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="m22 6-3-3" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M6.38 18.7 4 21" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M17.64 18.67 20 21" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalTimer" viewBox="0 0 24 24">
        <line x1="10" x2="14" y1="2" y2="2" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <line x1="12" x2="15" y1="14" y2="11" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <circle cx="12" cy="14" r="8" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalStopwatch" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <polyline points="12 6 12 12 16 14" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalGlobe" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M2 12h20" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalBell" viewBox="0 0 24 24">
        <path d="M10.268 21a2 2 0 0 0 3.464 0" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalCalendar" viewBox="0 0 24 24">
        <path d="M8 2v4" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M16 2v4" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <rect width="18" height="18" x="3" y="4" rx="2" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <path d="M3 10h18" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
      <symbol id="iconTemporalSettings" viewBox="0 0 24 24">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
        <circle cx="12" cy="12" r="3" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"/>
      </symbol>
    `);

    const self = this;

    this.addTab({
      type: TAB_TYPE,
      init() {
        const hostEl = this.element as HTMLElement;
        // Adding "protyle" class prevents companion plugins (like Neo-Plus) from mistakenly
        // treating the active workspace tab as an empty panel and hiding/minimizing the floating status bar.
        hostEl.classList.add("protyle");
        hostEl.style.width = "100%";
        hostEl.style.height = "100%";
        hostEl.style.display = "flex";
        hostEl.innerHTML = "";

        // Ensure floating status bar is left open and not minimized
        const statusEl = document.getElementById("status");
        if (statusEl) {
          statusEl.classList.remove("status--hide");
          statusEl.classList.remove("fn__none");
          statusEl.style.removeProperty("display");
          statusEl.style.removeProperty("transform");
          statusEl.style.removeProperty("opacity");
        }

        const mountEl = document.createElement("div");
        mountEl.className = "temporal-hub-root";
        mountEl.style.width = "100%";
        mountEl.style.height = "100%";
        mountEl.style.display = "flex";
        mountEl.style.position = "relative";
        mountEl.style.overflow = "hidden";
        hostEl.appendChild(mountEl);

        const initialSection: TemporalSection | undefined = this.data?.section;
        const initialSubTab: ClockSubTab | undefined = this.data?.clockSubTab;
        if (initialSection) {
          temporalStore.setSection(initialSection, initialSubTab);
        }

        const root = createRoot(mountEl);
        self.tabRoots.set(this.element, root);
        root.render(
          React.createElement(TemporalHubApp, {
            siyuanApp: self.app,
            initialSection,
          })
        );
      },
      destroy() {
        (this.element as HTMLElement)?.classList.remove("protyle");
        const root = self.tabRoots.get(this.element);
        if (root) {
          root.unmount();
          self.tabRoots.delete(this.element);
        }
      },
    });

    const topBarEl = this.addTopBar({
      icon: "iconTemporal",
      title:
        this.i18n?.openTemporalHub?.toString() ||
        "Temporal — Clock, Reminders & Calendar",
      position: "right",
      callback: (event: MouseEvent) => {
        if (event && (event.shiftKey || event.altKey)) {
          const rect = topBarEl?.getBoundingClientRect();
          this.showQuickMenu(rect);
          return;
        }
        this.openTemporalTab();
      },
    });

    if (topBarEl) {
      topBarEl.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.showQuickMenu(topBarEl.getBoundingClientRect());
      });
    }

    if (!this.isMobile) {
      const statusTemplate = document.createElement("template");
      statusTemplate.innerHTML = `<div class="toolbar__item ariaLabel" aria-label="Temporal Hub">
        <svg style="fill:none;stroke:currentColor;stroke-width:2;"><use xlink:href="#iconTemporal"></use></svg>
      </div>`;
      const el = statusTemplate.content.firstElementChild as HTMLElement;
      el.addEventListener("click", () => this.openTemporalTab());
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showQuickMenu(el.getBoundingClientRect());
      });
      this.statusBarEl = el;
      this.addStatusBar({ element: el, position: "right" });
    }

    this.addCommand({
      langKey: "openTemporalHub",
      hotkey: "⇧⌘T",
      callback: () => this.openTemporalTab("clock"),
    });
    this.addCommand({
      langKey: "openReminders",
      hotkey: "⇧⌘R",
      callback: () => this.openTemporalTab("reminders"),
    });
    this.addCommand({
      langKey: "openCalendar",
      hotkey: "⇧⌘K",
      callback: () => this.openTemporalTab("calendar"),
    });
  }

  async onLayoutReady() {
    await temporalStore.init(this);

    this.unsubscribeStore = temporalStore.subscribe(() => {
      this.updateStatusBarText();
    });
    this.updateStatusBarText();
  }

  async onDataChanged() {
    await temporalStore.reloadFromDisk();
  }

  private updateStatusBarText() {
    if (!this.statusBarEl) return;

    const state = temporalStore.getState();
    const runningTimers = state.timers.filter((t) => t.status === "running");
    if (runningTimers.length > 0) {
      const first = runningTimers[0];
      this.statusBarEl.setAttribute(
        "aria-label",
        `Temporal Timer: ${formatDurationMs(first.remainingMs, false).formatted}`
      );
      return;
    }

    if (state.stopwatch.status === "running") {
      const elapsed = temporalStore.getStopwatchElapsedMs();
      this.statusBarEl.setAttribute(
        "aria-label",
        `Temporal Stopwatch: ${formatDurationMs(elapsed, false).formatted}`
      );
      return;
    }

    const activeAlarms = state.alarms.filter((a) => a.enabled);
    const pendingReminders = state.reminders.filter((r) => !r.completed);
    if (activeAlarms.length > 0 || pendingReminders.length > 0) {
      this.statusBarEl.setAttribute(
        "aria-label",
        `Temporal: ${activeAlarms.length} Active Alarm${activeAlarms.length === 1 ? "" : "s"}, ${pendingReminders.length} Pending Reminder${pendingReminders.length === 1 ? "" : "s"}`
      );
      return;
    }

    this.statusBarEl.setAttribute(
      "aria-label",
      this.i18n?.openTemporalHub?.toString() ||
        "Temporal — Clock, Reminders & Calendar"
    );
  }

  public openTemporalTab(
    section?: TemporalSection,
    clockSubTab?: ClockSubTab
  ) {
    if (section) {
      temporalStore.setSection(section, clockSubTab);
    }
    // Ensure the floating status bar is left open and untouched
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.classList.remove("status--hide");
      statusEl.classList.remove("fn__none");
      statusEl.style.removeProperty("display");
      statusEl.style.removeProperty("transform");
      statusEl.style.removeProperty("opacity");
    }

    openTab({
      app: this.app,
      custom: {
        icon: "iconTemporal",
        title: this.i18n?.tabTitle?.toString() || "Temporal Hub",
        data: {
          section: section || temporalStore.getNavigation().section,
          clockSubTab: clockSubTab || temporalStore.getNavigation().clockSubTab,
        },
        id: this.name + TAB_TYPE,
      },
    });
  }

  public openSetting(): void {
    this.openTemporalTab("settings");
  }

  private showQuickMenu(rect?: DOMRect) {
    const menu = new Menu("temporalQuickMenu");
    menu.addItem({
      icon: "iconTemporalAlarm",
      label: "Clock & Alarms",
      click: () => this.openTemporalTab("clock", "alarms"),
    });
    menu.addItem({
      icon: "iconTemporalTimer",
      label: "Countdown Timers",
      click: () => this.openTemporalTab("clock", "timer"),
    });
    menu.addItem({
      icon: "iconTemporalStopwatch",
      label: "Stopwatch",
      click: () => this.openTemporalTab("clock", "stopwatch"),
    });
    menu.addItem({
      icon: "iconTemporalGlobe",
      label: "World Clock",
      click: () => this.openTemporalTab("clock", "worldclock"),
    });
    menu.addSeparator();
    menu.addItem({
      icon: "iconTemporalBell",
      label: "Custom Reminders",
      click: () => this.openTemporalTab("reminders"),
    });
    menu.addItem({
      icon: "iconTemporalCalendar",
      label: "Calendar & Google Sync",
      click: () => this.openTemporalTab("calendar"),
    });
    menu.addSeparator();
    menu.addItem({
      icon: "iconTemporalSettings",
      label: "Temporal Settings",
      click: () => this.openTemporalTab("settings"),
    });

    if (this.isMobile) {
      menu.fullscreen();
    } else if (rect) {
      menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
      });
    }
  }

  async onunload() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    for (const root of this.tabRoots.values()) {
      root.unmount();
    }
    this.tabRoots.clear();

    temporalStore.destroy();
  }
}
