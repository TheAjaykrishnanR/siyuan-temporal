module.exports = {
  darkMode: ["class", '[data-theme-mode="dark"]'],
  important: ".temporal-hub-root",
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: {
    // Disable global preflight so we never affect SiYuan's own UI outside .temporal-hub-root
    preflight: false,
  },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--b3-font-family, -apple-system, BlinkMacSystemFont, sans-serif)"],
        mono: ["var(--b3-font-family-code, ui-monospace, SFMono-Regular, monospace)"],
      },
      colors: {
        border:
          "color-mix(in srgb, var(--temporal-border) calc(<alpha-value> * 100%), transparent)",
        input:
          "color-mix(in srgb, var(--temporal-input) calc(<alpha-value> * 100%), transparent)",
        ring: "color-mix(in srgb, var(--temporal-ring) calc(<alpha-value> * 100%), transparent)",
        background:
          "color-mix(in srgb, var(--temporal-bg) calc(<alpha-value> * 100%), transparent)",
        foreground:
          "color-mix(in srgb, var(--temporal-fg) calc(<alpha-value> * 100%), transparent)",
        primary: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-primary) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-primary-fg) calc(<alpha-value> * 100%), transparent)",
        },
        secondary: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-secondary) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-secondary-fg) calc(<alpha-value> * 100%), transparent)",
        },
        destructive: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-destructive) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-destructive-fg) calc(<alpha-value> * 100%), transparent)",
        },
        muted: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-muted) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-muted-fg) calc(<alpha-value> * 100%), transparent)",
        },
        accent: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-accent) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-accent-fg) calc(<alpha-value> * 100%), transparent)",
        },
        popover: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-popover) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-popover-fg) calc(<alpha-value> * 100%), transparent)",
        },
        card: {
          DEFAULT:
            "color-mix(in srgb, var(--temporal-card) calc(<alpha-value> * 100%), transparent)",
          foreground:
            "color-mix(in srgb, var(--temporal-card-fg) calc(<alpha-value> * 100%), transparent)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
