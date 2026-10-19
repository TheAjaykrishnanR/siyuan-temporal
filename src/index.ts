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
        <path fill="currentColor" d="M12 20a7 7 0 1 0 0-14a7 7 0 0 0 0 14m0 2a9 9 0 1 1 0-18a9 9 0 0 1 0 18m.5-13v3.79l2.85 2.85l-1.41 1.41L10.5 13.6V9zM5.6 2.86L7 4.27L3.82 7.45L2.41 6.04zM18.4 2.86l3.19 3.18l-1.41 1.41L17 4.27z"/>
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
        <svg><use xlink:href="#iconTemporal"></use></svg>
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
      icon: "iconTemporal",
      label: "Clock & Alarms",
      click: () => this.openTemporalTab("clock", "alarms"),
    });
    menu.addItem({
      icon: "iconTemporal",
      label: "Countdown Timers",
      click: () => this.openTemporalTab("clock", "timer"),
    });
    menu.addItem({
      icon: "iconTemporal",
      label: "Stopwatch",
      click: () => this.openTemporalTab("clock", "stopwatch"),
    });
    menu.addItem({
      icon: "iconTemporal",
      label: "World Clock",
      click: () => this.openTemporalTab("clock", "worldclock"),
    });
    menu.addSeparator();
    menu.addItem({
      icon: "iconBell",
      label: "Custom Reminders",
      click: () => this.openTemporalTab("reminders"),
    });
    menu.addItem({
      icon: "iconCalendar",
      label: "Calendar & Google Sync",
      click: () => this.openTemporalTab("calendar"),
    });
    menu.addSeparator();
    menu.addItem({
      icon: "iconSettings",
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
