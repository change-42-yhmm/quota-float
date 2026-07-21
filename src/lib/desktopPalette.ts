import type { CSSProperties } from "react";
import type { WidgetTheme } from "../types";

export type DesktopPaletteName = "healthy" | "caution" | "critical" | "unavailable" | "stale" | "signed_out";
export type DesktopPaletteStyle = CSSProperties & {
  "--cool": string;
  "--glow": string;
  "--warm": string;
  "--progress-start": string;
  "--progress-end": string;
  "--glow-fade"?: string;
  "--warm-position"?: string;
  "--warm-fade"?: string;
  "--linear-warm"?: string;
  "--linear-end"?: string;
  "--gradient-angle"?: string;
  "--aurora-opacity"?: string;
};

export type DesktopPalettes = Record<DesktopPaletteName, DesktopPaletteStyle>;

// Runtime source of truth for every production desktop palette. The design
// workbench reads this object and never reads, writes, or persists its own
// palette values. Keep light and dark as separate records: changing one theme
// must never alter the other theme's desktop rendering.
//
// Light values intentionally match the v0.1.5 release visual baseline.
export const DESKTOP_PALETTES: Record<WidgetTheme, DesktopPalettes> = {
  light: {
    healthy: { "--cool": "#B9D5EE", "--glow": "#DFF4E5", "--warm": "#C7DDF2", "--progress-start": "#397AE0", "--progress-end": "#91BAF0", "--aurora-opacity": ".42" },
    caution: { "--cool": "#B7D0EC", "--glow": "#FFF0BA", "--warm": "#F4C979", "--progress-start": "#4D88D8", "--progress-end": "#9FC2EE", "--glow-fade": "58%", "--warm-position": "12% 96%", "--warm-fade": "66%", "--linear-warm": "#E4E7ED", "--linear-end": "#F1F5F8", "--gradient-angle": "213deg", "--aurora-opacity": ".5" },
    critical: { "--cool": "#C4CEE0", "--glow": "#FFD8A8", "--warm": "#F07260", "--progress-start": "#FF7848", "--progress-end": "#FFD064", "--glow-fade": "60%", "--warm-position": "11% 98%", "--warm-fade": "68%", "--linear-warm": "#E3E4E9", "--linear-end": "#F3F5F8", "--gradient-angle": "213deg", "--aurora-opacity": ".56" },
    unavailable: { "--cool": "#849CD6", "--glow": "#FFF4C3", "--warm": "#FF9A4E", "--progress-start": "#397AE0", "--progress-end": "#89B7FF" },
    stale: { "--cool": "#849CD6", "--glow": "#FFF4C3", "--warm": "#FF9A4E", "--progress-start": "#397AE0", "--progress-end": "#89B7FF" },
    signed_out: { "--cool": "#688CD4", "--glow": "#D7EEF3", "--warm": "#D89CA5", "--progress-start": "#397AE0", "--progress-end": "#89B7FF", "--linear-warm": "#BECBE2", "--linear-end": "#E3EAF4", "--gradient-angle": "145deg", "--aurora-opacity": ".58" },
  },
  dark: {
    healthy: { "--cool": "#272B59", "--glow": "#1C2240", "--warm": "#071231", "--progress-start": "#177CBB", "--progress-end": "#5DA6D1", "--linear-warm": "#071231", "--linear-end": "#071231", "--aurora-opacity": "1" },
    caution: { "--cool": "#26294B", "--glow": "#3C2F25", "--warm": "#09132F", "--progress-start": "#BD9252", "--progress-end": "#DEC299", "--linear-warm": "#09132F", "--linear-end": "#09132F", "--aurora-opacity": "1" },
    critical: { "--cool": "#0F1D39", "--glow": "#50322B", "--warm": "#09132F", "--progress-start": "#CE7253", "--progress-end": "#E6A38D", "--warm-position": "11% 98%", "--warm-fade": "68%", "--linear-warm": "#09132F", "--linear-end": "#09132F", "--gradient-angle": "213deg", "--aurora-opacity": "1" },
    unavailable: { "--cool": "#2B4478", "--glow": "#5F3549", "--warm": "#3D2353", "--progress-start": "#6072A2", "--progress-end": "#92A4C5" },
    stale: { "--cool": "#273748", "--glow": "#455569", "--warm": "#2B3340", "--progress-start": "#71849A", "--progress-end": "#A4B3C1" },
    signed_out: { "--cool": "#2D3864", "--glow": "#31445A", "--warm": "#5B3B55", "--progress-start": "#5864DE", "--progress-end": "#7D88F2", "--linear-warm": "#353650", "--linear-end": "#1D2534", "--aurora-opacity": "1" },
  },
};
