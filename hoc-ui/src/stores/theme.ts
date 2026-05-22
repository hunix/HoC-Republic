import { create } from "zustand";

type ThemeMode = "system" | "light" | "dark";

interface ThemeStore {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;

  if (resolved === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

export const useThemeStore = create<ThemeStore>((set) => {
  const saved = (localStorage.getItem("hoc-theme") as ThemeMode) || "dark";
  // Apply on load
  applyTheme(saved);

  // Listen for system preference changes when in system mode
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    const current = localStorage.getItem("hoc-theme") as ThemeMode;
    if (current === "system") {
      applyTheme("system");
    }
  });

  return {
    mode: saved,
    setMode: (mode) => {
      localStorage.setItem("hoc-theme", mode);
      applyTheme(mode);
      set({ mode });
    },
  };
});
