/**
 * Republic Template Content Generators
 *
 * Generates actual file content for the standard features
 * shared across ALL templates: i18n, theme, RTL, layout.
 */

// ─── Theme System ──────────────────────────────────────────────

export function generateThemeSystem(): string {
  return `"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

const ThemeContext = createContext<{
  theme: Theme; resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}>({ theme: "system", resolved: "light", setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("theme") as Theme) ?? "system";
  });
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const r = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      setResolved(r);
      document.documentElement.setAttribute("data-theme", r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    resolve();
    media.addEventListener("change", resolve);
    return () => media.removeEventListener("change", resolve);
  }, [theme]);

  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
`;
}

export function generateLightThemeCSS(): string {
  return `:root, [data-theme="light"] {
  --bg: #ffffff; --bg-secondary: #f8fafc; --bg-card: #ffffff;
  --text: #0f172a; --text-secondary: #64748b; --text-muted: #94a3b8;
  --border: #e2e8f0; --border-hover: #cbd5e1;
  --primary: #6366f1; --primary-hover: #4f46e5; --primary-text: #ffffff;
  --secondary: #f1f5f9; --secondary-hover: #e2e8f0;
  --accent: #06b6d4; --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
  --radius: 8px; --radius-lg: 12px;
  color-scheme: light;
}`;
}

export function generateDarkThemeCSS(): string {
  return `[data-theme="dark"] {
  --bg: #0a0a0f; --bg-secondary: #111118; --bg-card: #16161d;
  --text: #f0f0f5; --text-secondary: #a0a0b0; --text-muted: #6b6b80;
  --border: #2a2a35; --border-hover: #3a3a48;
  --primary: #818cf8; --primary-hover: #6366f1; --primary-text: #ffffff;
  --secondary: #1e1e28; --secondary-hover: #2a2a35;
  --accent: #22d3ee; --success: #34d399; --warning: #fbbf24; --danger: #f87171;
  --shadow: 0 1px 3px rgba(0,0,0,0.4);
  color-scheme: dark;
}`;
}

// ─── i18n System ───────────────────────────────────────────────

export function generateI18nSystem(): string {
  return `"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Locale = "en" | "ar" | "es" | "fr" | "de" | "zh" | "ja";
type Dir = "ltr" | "rtl";
const RTL_LOCALES: Locale[] = ["ar"];

interface I18nCtx {
  locale: Locale; dir: Dir; t: (key: string, vars?: Record<string, string>) => string;
  setLocale: (l: Locale) => void; locales: { code: Locale; name: string; flag: string }[];
}

const I18nContext = createContext<I18nCtx>({
  locale: "en", dir: "ltr", t: (k) => k, setLocale: () => {},
  locales: [],
});

const LOCALE_META: { code: Locale; name: string; flag: string }[] = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
];

const translations: Record<string, Record<string, string>> = {};

export function registerLocale(locale: string, messages: Record<string, string>) {
  translations[locale] = { ...(translations[locale] ?? {}), ...messages };
}

export function I18nProvider({ children, defaultLocale = "en" }: { children: ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return defaultLocale;
    return (localStorage.getItem("locale") as Locale) ?? defaultLocale;
  });

  const dir: Dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l;
    document.documentElement.dir = RTL_LOCALES.includes(l) ? "rtl" : "ltr";
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string>) => {
    let msg = translations[locale]?.[key] ?? translations["en"]?.[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) msg = msg.replace(\`{{\${k}}}\`, v);
    return msg;
  }, [locale]);

  return <I18nContext.Provider value={{ locale, dir, t, setLocale, locales: LOCALE_META }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useTranslation = () => { const { t } = useI18n(); return t; };
`;
}

export function generateLocaleEN(): string {
  return JSON.stringify({
    "app.name": "Application",
    "nav.home": "Home", "nav.dashboard": "Dashboard", "nav.settings": "Settings",
    "nav.profile": "Profile", "nav.logout": "Logout", "nav.login": "Login",
    "nav.signup": "Sign Up", "nav.search": "Search", "nav.about": "About",
    "theme.light": "Light", "theme.dark": "Dark", "theme.system": "System",
    "auth.email": "Email", "auth.password": "Password", "auth.login": "Sign In",
    "auth.signup": "Create Account", "auth.forgot": "Forgot Password?",
    "auth.or": "or continue with", "auth.google": "Google", "auth.github": "GitHub",
    "common.save": "Save", "common.cancel": "Cancel", "common.delete": "Delete",
    "common.edit": "Edit", "common.create": "Create", "common.loading": "Loading...",
    "common.error": "Something went wrong", "common.success": "Success!",
    "common.noResults": "No results found", "common.back": "Back",
    "footer.rights": "All rights reserved", "footer.privacy": "Privacy",
    "footer.terms": "Terms",
  }, null, 2);
}

export function generateLocaleAR(): string {
  return JSON.stringify({
    "app.name": "التطبيق",
    "nav.home": "الرئيسية", "nav.dashboard": "لوحة التحكم", "nav.settings": "الإعدادات",
    "nav.profile": "الملف الشخصي", "nav.logout": "تسجيل الخروج", "nav.login": "تسجيل الدخول",
    "nav.signup": "إنشاء حساب", "nav.search": "بحث", "nav.about": "حول",
    "theme.light": "فاتح", "theme.dark": "داكن", "theme.system": "النظام",
    "auth.email": "البريد الإلكتروني", "auth.password": "كلمة المرور",
    "auth.login": "تسجيل الدخول", "auth.signup": "إنشاء حساب جديد",
    "auth.forgot": "نسيت كلمة المرور؟", "auth.or": "أو المتابعة عبر",
    "auth.google": "جوجل", "auth.github": "جيتهب",
    "common.save": "حفظ", "common.cancel": "إلغاء", "common.delete": "حذف",
    "common.edit": "تعديل", "common.create": "إنشاء", "common.loading": "جارٍ التحميل...",
    "common.error": "حدث خطأ ما", "common.success": "تم بنجاح!",
    "common.noResults": "لا توجد نتائج", "common.back": "رجوع",
    "footer.rights": "جميع الحقوق محفوظة", "footer.privacy": "الخصوصية",
    "footer.terms": "الشروط",
  }, null, 2);
}

export function generateLocale(locale: string): string {
  const locales: Record<string, Record<string, string>> = {
    es: { "nav.home": "Inicio", "nav.dashboard": "Panel", "nav.settings": "Ajustes", "nav.login": "Iniciar sesión", "nav.signup": "Registrarse", "common.save": "Guardar", "common.cancel": "Cancelar", "common.loading": "Cargando..." },
    fr: { "nav.home": "Accueil", "nav.dashboard": "Tableau de bord", "nav.settings": "Paramètres", "nav.login": "Connexion", "nav.signup": "S'inscrire", "common.save": "Sauvegarder", "common.cancel": "Annuler", "common.loading": "Chargement..." },
    de: { "nav.home": "Startseite", "nav.dashboard": "Dashboard", "nav.settings": "Einstellungen", "nav.login": "Anmelden", "nav.signup": "Registrieren", "common.save": "Speichern", "common.cancel": "Abbrechen", "common.loading": "Laden..." },
    zh: { "nav.home": "首页", "nav.dashboard": "仪表板", "nav.settings": "设置", "nav.login": "登录", "nav.signup": "注册", "common.save": "保存", "common.cancel": "取消", "common.loading": "加载中..." },
    ja: { "nav.home": "ホーム", "nav.dashboard": "ダッシュボード", "nav.settings": "設定", "nav.login": "ログイン", "nav.signup": "サインアップ", "common.save": "保存", "common.cancel": "キャンセル", "common.loading": "読み込み中..." },
  };
  return JSON.stringify(locales[locale] ?? {}, null, 2);
}

// ─── Global CSS with responsive + RTL ──────────────────────────

export function generateGlobalCSS(): string {
  return `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

html {
  font-family: 'Inter', 'Noto Sans Arabic', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  scroll-behavior: smooth;
}

body {
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  transition: background-color 0.2s, color 0.2s;
}

/* RTL Support */
[dir="rtl"] { font-family: 'Noto Sans Arabic', 'Inter', system-ui, sans-serif; }
[dir="rtl"] .ml-auto { margin-left: unset; margin-right: auto; }
[dir="rtl"] .mr-auto { margin-right: unset; margin-left: auto; }
[dir="rtl"] .text-left { text-align: right; }
[dir="rtl"] .text-right { text-align: left; }
[dir="rtl"] .pl-4 { padding-left: unset; padding-right: 1rem; }
[dir="rtl"] .pr-4 { padding-right: unset; padding-left: 1rem; }
[dir="rtl"] .border-l { border-left: none; border-right: 1px solid var(--border); }
[dir="rtl"] .border-r { border-right: none; border-left: 1px solid var(--border); }
[dir="rtl"] .rounded-l { border-radius: 0 var(--radius) var(--radius) 0; }
[dir="rtl"] .rounded-r { border-radius: var(--radius) 0 0 var(--radius); }
[dir="rtl"] .flex-row { flex-direction: row-reverse; }

/* Responsive Grid */
.container { width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 1rem; }
.grid { display: grid; gap: 1rem; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 1024px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
  .container { padding: 0 0.75rem; }
  .hide-mobile { display: none !important; }
}
@media (max-width: 480px) { .container { padding: 0 0.5rem; } }

/* Card */
.card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1.25rem;
  box-shadow: var(--shadow); transition: border-color 0.2s, box-shadow 0.2s;
}
.card:hover { border-color: var(--border-hover); }

/* Button base */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 500;
  font-size: 0.875rem; border: 1px solid transparent; cursor: pointer;
  transition: all 0.15s;
}
.btn-primary { background: var(--primary); color: var(--primary-text); }
.btn-primary:hover { background: var(--primary-hover); }
.btn-secondary { background: var(--secondary); color: var(--text); border-color: var(--border); }
.btn-secondary:hover { background: var(--secondary-hover); }

/* Focus */
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Animations */
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.animate-in { animation: fadeIn 0.3s ease-out; }
`;
}

// ─── Package.json generator ────────────────────────────────────

export function generatePackageJson(name: string, hasPWA: boolean): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return JSON.stringify({
    name: slug,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
      test: "vitest",
    },
    dependencies: {
      "next": "^14.2.0",
      "react": "^18.3.0",
      "react-dom": "^18.3.0",
      "@supabase/supabase-js": "^2.45.0",
      ...(hasPWA ? { "next-pwa": "^5.6.0" } : {}),
    },
    devDependencies: {
      "typescript": "^5.5.0",
      "tailwindcss": "^3.4.0",
      "@types/react": "^18.3.0",
      "@types/node": "^20.0.0",
      "vitest": "^2.0.0",
      "postcss": "^8.4.0",
      "autoprefixer": "^10.4.0",
    },
  }, null, 2);
}
