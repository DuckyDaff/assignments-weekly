import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

const MobileCtx = createContext(false);
function useMobile() {
  const [m, setM] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth <= 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return m;
}

/* ═══════════════════════════════════════════════════════
   CONSTANTS & HELPERS
═══════════════════════════════════════════════════════ */
const DAYS = [
  { key: "sun", short: "א׳", long: "ראשון"  },
  { key: "mon", short: "ב׳", long: "שני"    },
  { key: "tue", short: "ג׳", long: "שלישי"  },
  { key: "wed", short: "ד׳", long: "רביעי"  },
  { key: "thu", short: "ה׳", long: "חמישי"  },
  { key: "fri", short: "ו׳", long: "שישי"   },
  { key: "sat", short: "ש׳", long: "שבת"    },
];
const ALL_DAYS = DAYS.map(d => d.key);

const PALETTE = [
  { dark: "#0c2540", mid: "#1a3a5c", accent: "#4a9eff", soft: "#d0e8ff" },
  { dark: "#0c2e1a", mid: "#1a4a2b", accent: "#27ae60", soft: "#c8f0d8" },
  { dark: "#2a0c3f", mid: "#3e1a5e", accent: "#3d7fc4", soft: "#e8d0f8" },
  { dark: "#3a1800", mid: "#5a2800", accent: "#e67e22", soft: "#fde8c8" },
  { dark: "#0c2d3a", mid: "#1a4456", accent: "#16a085", soft: "#c0ece4" },
  { dark: "#380c0c", mid: "#581a1a", accent: "#e74c3c", soft: "#fdd0ce" },
  { dark: "#1a1040", mid: "#2c1e68", accent: "#8e44ad", soft: "#e0d0f8" },
  { dark: "#152a0c", mid: "#2a4a18", accent: "#2ecc71", soft: "#c8f8d8" },
  { dark: "#2a1a00", mid: "#4a3000", accent: "#f1c40f", soft: "#fef9c3" },
  { dark: "#001a2a", mid: "#003a5a", accent: "#00bcd4", soft: "#c0f4ff" },
  { dark: "#2a000f", mid: "#4a001f", accent: "#ff4081", soft: "#ffd0e0" },
  { dark: "#0a1a0a", mid: "#183018", accent: "#8bc34a", soft: "#dff0c8" },
  { dark: "#1a1a00", mid: "#32320a", accent: "#cddc39", soft: "#f5fac0" },
  { dark: "#0a0a2a", mid: "#14145a", accent: "#7986cb", soft: "#dde0ff" },
  { dark: "#1a0a00", mid: "#3a1800", accent: "#ff7043", soft: "#ffe0d8" },
];

/* ═══════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
═══════════════════════════════════════════════════════ */
const VAPID_PUBLIC_KEY = "BG5WU-Uxc8ogOxG9y3zsZJMuELLXXDMy3b-UaocLta1aSxtSdolfIQmmrVorHAupg7P_Ya7p1QiOEprJilT9hfg";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registerPush(name, reminders = true) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), name, reminders }),
    });
    return sub;
  } catch (e) {
    console.warn("Push registration failed:", e);
    return null;
  }
}

async function updateReminderPref(reminders) {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/subscribe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, reminders }),
    });
  } catch (e) {
    console.warn("Failed to update reminder pref:", e);
  }
}

const DEF_SECTIONS = [
  { name: "מדור פיקוד ובקרה",     people: ["דוד לוי", "רחל כהן", "יוסי מזרחי", "מיכל אברהם"] },
  { name: "מדור תאורת מסלולים",   people: ["אמיר שפירו", "נועה גולן", "עידו פרץ"] },
  { name: "משמרת מסלולים",         people: ["שירה בן-דוד", "רון אלון", "תמר ביטון"] },
];

const DEF = {
  systems: ["מערכת א׳", "מערכת ב׳", "מערכת ג׳", "מערכת ד׳", "מערכת ה׳"],
  sections: DEF_SECTIONS,
  assignments: [],
  pin: "1234",
};

function getSections(data) {
  if (data.sections?.length) return data.sections;
  // migrate old flat people array → first section
  if (data.people?.length) return [{ name: "מדור פיקוד ובקרה", people: data.people }, { name: "מדור תאורת מסלולים", people: [] }, { name: "משמרת מסלולים", people: [] }];
  return DEF_SECTIONS;
}
function getAllPeople(data) { return getSections(data).flatMap(s => s.people); }

function wKey(date) {
  // Week starts Sunday (day 0). Anchor on Thursday of the same Sun–Sat week.
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - d.getDay()); // Thu of Sun-based week
  const y = d.getFullYear();
  const w = Math.ceil(((d - new Date(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
function wDates(wk) {
  // Reconstruct Sunday and Thursday of the given Sun-based week key.
  const [y, w] = wk.split("-W");
  const jan1 = new Date(Number(y), 0, 1);
  const D = jan1.getDay(); // 0=Sun … 6=Sat
  // Thursday of week 1: Jan 1 shifted to the Thursday of its Sun–Sat week
  const thu1 = new Date(jan1);
  thu1.setDate(1 + (4 - D + 7) % 7);
  // Thursday of week N
  const thu = new Date(thu1);
  thu.setDate(thu1.getDate() + (Number(w) - 1) * 7);
  // Sunday of week N = Thursday − 4 days
  const sun = new Date(thu);
  sun.setDate(thu.getDate() - 4);
  return { sun, thu };
}
function wLabel(wk) {
  const { sun, thu } = wDates(wk);
  const f = d => d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
  return `${f(sun)} – ${f(thu)}`;
}
function adjW(wk, d) {
  const { sun } = wDates(wk); sun.setDate(sun.getDate() + d * 7); return wKey(sun);
}
function todayDayKey() {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
}
function isWorkDay(key) { return DAYS.some(d => d.key === key); }
function pal(idx) { return PALETTE[((idx % PALETTE.length) + PALETTE.length) % PALETTE.length]; }
// Section colors: use data.sectionColors[name] if set, otherwise defaults
// Default mapping gives "משמרת מסלולים" orange so it's clearly different from the blue/green sections
const SEC_COLOR_DEFAULTS = { "משמרת מסלולים": 3 }; // index 3 = orange
function secPal(data, sectionName, fallbackIdx) {
  const sc = data?.sectionColors || {};
  if (sectionName in sc) return pal(sc[sectionName]);
  if (sectionName in SEC_COLOR_DEFAULTS) return pal(SEC_COLOR_DEFAULTS[sectionName]);
  return pal(fallbackIdx);
}

/* ── ANNUAL PLAN STATUS HELPERS ── */
const STATUS_MAP = {
  'י':   { bg: '#27ae60', label: 'יום' },
  'ל':   { bg: '#2980b9', label: 'לילה' },
  'Y':   { bg: '#16a085', label: 'מחליף יום' },
  'L':   { bg: '#1a5276', label: 'מחליף לילה' },
  'ל2':  { bg: '#154360', label: 'לילה נוסף' },
  '2':   { bg: '#1e8bc3', label: 'יום נוסף' },
  'כ':   { bg: '#e67e22', label: 'כונן' },
  'כש':  { bg: '#d35400', label: 'כונן שבת' },
  'כמ':  { bg: '#f39c12', label: 'כונן מסלולים' },
  'כמש': { bg: '#ca6f1e', label: 'כונן מסלולים שבת' },
  'ח':   { bg: '#e74c3c', label: 'חופשה' },
  'מיל': { bg: '#922b21', label: 'מילואים' },
  'מ':   { bg: '#c0392b', label: 'מחלה' },
  'פ':   { bg: '#7f8c8d', label: 'פנוי' },
  'מנוחה': { bg: '#7f8c8d', label: 'מנוחה' },
  'ק':   { bg: '#8e44ad', label: 'קורס' },
  'חיפה': { bg: '#0e6655', label: 'חיפה' },
  'הרצליה': { bg: '#0e6655', label: 'הרצליה' },
  'ראש פינה': { bg: '#0e6655', label: 'ראש פינה' },
  'PBB': { bg: '#1a5276', label: 'PBB' },
  'רמון': { bg: '#1a5276', label: 'רמון' },
  'ב. חשמל': { bg: '#6c3483', label: 'בטיחות חשמל' },
  'ב. כללית': { bg: '#6c3483', label: 'בטיחות כללית' },
  'השתלמות': { bg: '#6c3483', label: 'השתלמות' },
  'ניקיון תחנות': { bg: '#2c3e50', label: 'ניקיון תחנות' },
};
const UNAVAILABLE_CODES = new Set(['ח','מיל','מ','פ','מנוחה','ק']);
function statusStyle(code) {
  if (!code) return null;
  return STATUS_MAP[code] || { bg: '#1a4a3a', label: code };
}
function wkDayToDate(wk, dayKey) {
  const { sun } = wDates(wk);
  const off = ['sun','mon','tue','wed','thu','fri','sat'].indexOf(dayKey);
  if (off < 0) return null;
  const d = new Date(sun); d.setDate(sun.getDate() + off);
  return d.toISOString().slice(0, 10);
}

function doExportCSV(wk, list) {
  const h = ["מערכת", "אנשים", ...DAYS.map(d => d.long), "משימות", "הערות"];
  const sys = [...new Set(list.map(a => a.system))];
  const rows = sys.map(s => {
    const sa = list.filter(a => a.system === s);
    const ppl = [...new Set(sa.flatMap(a => a.assignees || []))].join(" + ");
    const dc = DAYS.map(({ key }) =>
      [...new Set(sa.filter(a => !a.days || a.days.length === 0 || a.days.includes(key)).flatMap(a => a.assignees || []))].join(" + ")
    );
    return [s, ppl, ...dc, sa.flatMap(a => a.tasks || []).join("; "), sa.map(a => a.notes).filter(Boolean).join("; ")];
  });
  const csv = [h, ...rows].map(r => r.map(c => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `שיבוצים-${wk}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function doPrint(wk, list, systems) {
  const activeSys = systems.filter(s => list.some(a => a.system === s));
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>שיבוצים ${wk}</title>
  <style>*{box-sizing:border-box}body{font-family:'Arial Hebrew',Arial,sans-serif;padding:28px;color:#111;font-size:13px;margin:0}
  h1{font-size:22px;margin:0 0 4px;color:#1a2a4a}p{color:#666;margin:0 0 24px;font-size:13px}
  table{width:100%;border-collapse:collapse}
  th{background:#1a3a5c;color:#fff;padding:9px 12px;text-align:right;font-size:12px;border:1px solid #0f2a4a}
  td{padding:8px 12px;border:1px solid #dde4ee;vertical-align:top;font-size:12px}
  tr:nth-child(even) td{background:#f4f7fc}
  .sn{font-weight:700;color:#1a3a5c;font-size:14px}
  .tl{color:#444;margin:2px 0;padding-right:10px;position:relative}
  .tl:before{content:"✓";position:absolute;right:0;color:#27ae60}
  @media print{body{padding:12px}}</style></head><body>
  <h1>תוכנית עבודה שבועית — שבוע ${wk.split("-W")[1]}</h1>
  <p>${wLabel(wk)}</p>
  <table><tr><th style="width:130px">מערכת</th>${DAYS.map(d => `<th>${d.long}</th>`).join("")}<th>משימות</th></tr>
  ${activeSys.map(s => {
    const sa = list.filter(a => a.system === s);
    const dc = DAYS.map(({ key }) => {
      const names = [...new Set(sa.filter(a => !a.days || a.days.includes(key)).flatMap(a => a.assignees || []))];
      return `<td>${names.join("<br>")}</td>`;
    }).join("");
    return `<tr><td><div class="sn">${s}</div></td>${dc}<td>${sa.flatMap(a => a.tasks || []).map(t => `<div class="tl">${t}</div>`).join("")}</td></tr>`;
  }).join("")}</table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ═══════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════ */
function ToastContainer({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 999, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#c0392b" : t.type === "info" ? "#2c3e6a" : "#1e5c3a",
          color: "#fff", padding: "11px 20px", borderRadius: 12,
          fontSize: 13, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          border: `1px solid ${t.type === "error" ? "#e74c3c40" : t.type === "info" ? "#4a9eff40" : "#27ae6040"}`,
          display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
          animation: "slideUp .25s ease",
        }}>
          <span>{t.type === "error" ? "✕" : t.type === "info" ? "ℹ" : "✓"}</span>{t.msg}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ICONS
═══════════════════════════════════════════════════════ */
const I = ({ n, s = 17 }) => {
  const g = { stroke: "currentColor", strokeWidth: "2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const m = {
    plus:   <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    edit:   <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
    trash:  <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
    cR:     <polyline points="9 18 15 12 9 6" />,
    cL:     <polyline points="15 18 9 12 15 6" />,
    user:   <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    grid:   <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    cal:    <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    calY:   <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><text x="12" y="20" textAnchor="middle" fontSize="7" strokeWidth="0" fill="currentColor" fontWeight="bold">שנ׳</text></>,
    lock:   <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    unlock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>,
    cog:    <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    dl:     <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    print:  <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    x:      <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    check:  <polyline points="20 6 9 17 4 12" />,
    copy:   <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>,
    sun:    <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" {...g}>{m[n]}</svg>;
};

const CSS = `
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes slideUpSheet{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
input,select,textarea{font-family:inherit}
input::placeholder,textarea::placeholder{color:#445!important}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:#111}
::-webkit-scrollbar-thumb{background:#334;border-radius:3px}
button:focus-visible{outline:2px solid #4a9eff;outline-offset:2px}
button{touch-action:manipulation}
@media(max-width:768px){
  .desktop-nav{display:none!important}
  .main-pad{padding:12px 12px 80px!important}
  .week-nav-row{flex-direction:column;align-items:flex-start;gap:8px}
  .week-nav-actions{width:100%;justify-content:flex-start}
}
@media(min-width:769px){
  .bottom-nav{display:none!important}
  .fab{display:none!important}
}
`;

const inp = { width: "100%", padding: "10px 13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#e8eaf0", fontSize: 13, outline: "none", transition: "border-color .15s" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "#8892b0", letterSpacing: .6, marginBottom: 5, textTransform: "uppercase" };

function Chip({ label, color, onRemove }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 500 }}>
      {label}
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color, padding: 0, lineHeight: 1, marginTop: 1, opacity: .7 }}><I n="x" s={11} /></button>}
    </span>
  );
}

function PillBtn({ children, onClick, color = "#4a9eff", ghost = false, small = false }) {
  const bg = ghost ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg,${color},${color}cc)`;
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "6px 12px" : "8px 16px", border: `1px solid ${ghost ? "rgba(255,255,255,0.12)" : color + "55"}`, borderRadius: 9, background: bg, color: ghost ? "#9aa0b0" : "#fff", fontSize: small ? 12 : 13, fontWeight: 600, cursor: "pointer", transition: "all .12s", boxShadow: ghost ? "none" : `0 3px 12px ${color}33` }}>
      {children}
    </button>
  );
}

function Overlay({ onClose, children, wide = false }) {
  const mob = useContext(MobileCtx);
  if (mob) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,18,.7)", backdropFilter: "blur(4px)", zIndex: 300, display: "flex", alignItems: "flex-end" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ animation: "slideUpSheet .25s ease", width: "100%", maxHeight: "92dvh", overflowY: "auto", borderRadius: "20px 20px 0 0" }}>{children}</div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,8,18,.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ animation: "slideIn .2s ease", width: "100%", maxWidth: wide ? 680 : 520 }}>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════ */
export default function App() {
  const mob = useMobile();
  const [data, setData]     = useState(null);
  const [tab, setTab]       = useState(() => {
    // If opened via notification click, start on the right tab
    const p = new URLSearchParams(window.location.search).get("tab");
    return p || "calendar";
  });
  const [wk, setWk]         = useState(wKey(new Date()));
  const [mgr, setMgr]       = useState(false);
  const [modal, setModal]   = useState(null);
  const [myName, setMyName] = useState(() => localStorage.getItem("myName") || "");
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("myName"));
  const [pushStatus, setPushStatus] = useState(() => Notification?.permission || "default"); // "default"|"granted"|"denied"
  const [remindersOn, setRemindersOn] = useState(() => localStorage.getItem("remindersOn") !== "false"); // default true
  const [mgrName, setMgrName] = useState("");     // שם המנהל הנוכחי
  const mgrNameRef = useRef("");
  useEffect(() => { mgrNameRef.current = mgrName; }, [mgrName]);
  const [toasts, setToasts] = useState([]);
  const [filterPerson, setFilterPerson] = useState("");
  const [saveErr, setSaveErr] = useState(false);
  const [viewAssign, setViewAssign] = useState(null);
  const [planner, setPlanner]       = useState(false);

  const toast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  // Register SW on load + listen for navigation messages from notification clicks
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // When app is already open and user clicks a notification,
    // the SW sends a postMessage instead of reopening the window
    const onMsg = e => {
      if (e.data?.type === "NAVIGATE_TAB" && e.data.tab) {
        setTab(e.data.tab);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  // When myName is set and permission is "default", auto-ask
  useEffect(() => {
    if (!myName) return;
    if (Notification?.permission !== "default") {
      setPushStatus(Notification?.permission);
      return;
    }
    // Wait a moment before asking so it doesn't pop up immediately on first load
    const t = setTimeout(() => {
      registerPush(myName).then(sub => {
        setPushStatus(Notification?.permission || "default");
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [myName]);

  const isSavingRef = useRef(false);

  const applyFetch = useCallback(d => {
    if (!d || typeof d !== "object") return;
    if (!d.sections?.length && d.people?.length) {
      const migrated = { ...d, sections: getSections(d) };
      delete migrated.people;
      setData(migrated);
    } else {
      setData(d);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(applyFetch)
      .catch(() => { setData(DEF); setSaveErr(true); });
  }, [applyFetch]);

  // Auto-refresh every 30 s — update only when data actually changed
  useEffect(() => {
    const poll = () => {
      if (isSavingRef.current || document.hidden) return;
      fetch("/api/data").then(r => r.json()).then(fresh => {
        setData(prev => {
          if (!prev || !fresh) return prev;
          if (fresh.updatedAt && fresh.updatedAt !== prev.updatedAt) return fresh;
          return prev;
        });
      }).catch(() => {});
    };
    const id = setInterval(poll, 30000);
    document.addEventListener("visibilitychange", poll); // refresh on tab focus
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", poll); };
  }, []);

  // ── Annual plan state ──
  const [annualData, setAnnualData] = useState(null);
  useEffect(() => {
    fetch("/api/annual").then(r => r.ok ? r.json() : null).then(d => { if (d) setAnnualData(d); }).catch(() => {});
  }, []);
  const saveAnnualDay = useCallback(async patch => {
    setAnnualData(prev => {
      if (!prev) return prev;
      const existing = prev.days[patch.date] || {};
      return { ...prev, days: { ...prev.days, [patch.date]: { ...existing, ...patch } } };
    });
    await fetch("/api/annual", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const saveAbsenceRange = useCallback(async ({ person, code, fromDate, toDate }) => {
    // Optimistic update: apply to every day in range
    setAnnualData(prev => {
      if (!prev) return prev;
      const days = { ...prev.days };
      const from = new Date(fromDate + "T00:00:00");
      const to   = new Date(toDate   + "T00:00:00");
      for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const dayData  = days[iso] || {};
        const statuses = { ...(dayData.statuses || {}) };
        if (code) statuses[person] = code; else delete statuses[person];
        days[iso] = { ...dayData, statuses };
      }
      return { ...prev, days };
    });
    await fetch("/api/annual", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person, code, fromDate, toDate }),
    }).catch(() => {});
  }, []);

  const [showAbsenceModal, setShowAbsenceModal] = useState(false);

  // Sync sections changes from Settings into the annual plan
  const syncAnnualSections = useCallback(async (newSections) => {
    if (!annualData) return;
    setAnnualData(prev => prev ? { ...prev, sections: newSections } : prev);
    try {
      await fetch("/api/annual", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: newSections }),
      });
    } catch (e) {
      console.error("Failed to sync annual sections", e);
    }
  }, [annualData]);

  const save = useCallback(async (nd, msg) => {
    setData(nd);
    isSavingRef.current = true;
    try {
      const r = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nd),
      });
      if (!r.ok) throw new Error();
      // Sync the server-stamped updatedAt back to local state
      const saved = await r.json().catch(() => null);
      if (saved?.updatedAt) setData(prev => prev ? { ...prev, updatedAt: saved.updatedAt } : prev);
      setSaveErr(false);
    } catch {
      setSaveErr(true);
      toast("שגיאה בשמירה", "error");
    } finally {
      isSavingRef.current = false;
    }
    if (msg) toast(msg);
  }, [toast]);

  // ── Activity log helper ──
  const addLog = (nd, action, detail = "") => {
    const who = mgrNameRef.current;
    if (!who) return nd;
    const entry = { ts: Date.now(), manager: who, action, detail };
    const log = [...(nd.activityLog || []), entry].slice(-300);
    return { ...nd, activityLog: log };
  };

  const weekA = data ? data.assignments.filter(a => a.week === wk) : [];
  const prevA  = data ? data.assignments.filter(a => a.week === adjW(wk, -1)) : [];

  const copyFromPrev = () => {
    if (!prevA.length) { toast("אין שיבוצים בשבוע הקודם", "info"); return; }
    const copied = prevA.map(a => ({ ...a, id: Date.now() + Math.random(), week: wk }));
    const nd = addLog({ ...data, assignments: [...data.assignments, ...copied] }, "העתיק שבוע קודם", `${copied.length} שיבוצים → שבוע ${wk}`);
    save(nd, `הועתקו ${copied.length} שיבוצים`);
  };

  const deleteAssign = id => {
    const a = data.assignments.find(x => x.id === id);
    const nd = addLog({ ...data, assignments: data.assignments.filter(x => x.id !== id) }, "מחק שיבוץ", a ? `${a.system} · שבוע ${a.week}` : "");
    save(nd, "השיבוץ נמחק");
  };

  const upsertAssign = a => {
    const isEdit = data.assignments.some(x => x.id === a.id);
    const assignments = isEdit
      ? data.assignments.map(x => x.id === a.id ? a : x)
      : [...data.assignments, { ...a, id: Date.now().toString() }];
    const dayStr = (a.days||[]).map(d => DAYS.find(x=>x.key===d)?.short||d).join(", ");
    const nd = addLog({ ...data, assignments }, isEdit ? "עדכן שיבוץ" : "הוסיף שיבוץ", `${a.system}${dayStr ? " · "+dayStr : ""}`);
    save(nd, isEdit ? "השיבוץ עודכן ✓" : "שיבוץ נוסף ✓");
    setModal(null);
  };

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#080c18", color: "#445", fontFamily: "Arial", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28 }}>⏳</div><div>טוען...</div>
    </div>
  );

  const sysColorMap = Object.fromEntries(data.systems.map((s, i) => [s, pal(data.systemColors?.[s] ?? i)]));
  const TABS = [
    { id: "calendar", label: "לוח שבועי",    icon: "cal"  },
    { id: "board",    label: "לוח שיבוצים", icon: "grid" },
    { id: "annual",   label: "תוכנית שנתית", icon: "calY" },
    { id: "me",       label: myName ? myName.split(" ")[0] : "שלי", icon: "user" },
    { id: "settings", label: "הגדרות",       icon: "cog"  },
  ];

  const openAdd = () => setModal({ t: "assign", mode: "add" });

  return (
    <MobileCtx.Provider value={mob}>
      <style>{CSS}</style>
      <div dir="rtl" style={{ minHeight: "100vh", background: "#080c18", color: "#dde2f0", fontFamily: "'Segoe UI','Arial Hebrew',Arial,sans-serif", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <img src="/logo.png" alt="" aria-hidden="true" style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "min(55vw, 480px)", opacity: 0.22, pointerEvents: "none", userSelect: "none", zIndex: 0 }} />
        {saveErr && (
          <div style={{ background: "#3a0c0c", borderBottom: "1px solid #e74c3c44", padding: "6px 18px", fontSize: 12, color: "#e74c3c", textAlign: "center" }}>
            ⚠ שגיאת חיבור לשרת — השינויים לא נשמרים
          </div>
        )}
        <header style={{ background: "linear-gradient(180deg,#0f1525 0%,#0a1020 100%)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 200, boxShadow: "0 2px 24px rgba(0,0,0,.6)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo.png" alt="לוגו" style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
            {!mob && <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: .3 }}>מערכת שיבוצים</span>}
          </div>
          <nav className="desktop-nav" style={{ display: "flex", gap: 1 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, background: tab === t.id ? "rgba(74,158,255,0.14)" : "transparent", color: tab === t.id ? "#4a9eff" : "#7a8499", transition: "all .15s", position: "relative" }}>
                <I n={t.icon} s={13} />{t.label}
                {tab === t.id && <span style={{ position: "absolute", bottom: -1, left: "20%", right: "20%", height: 2, background: "#4a9eff", borderRadius: 2 }} />}
              </button>
            ))}
          </nav>
          {mob && <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{TABS.find(t => t.id === tab)?.label}</span>}
          <button onClick={() => { if (mgr) { setMgr(false); setMgrName(""); } else setModal({ t: "auth" }); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", border: `1px solid ${mgr ? "rgba(39,174,96,.4)" : "rgba(255,255,255,.1)"}`, borderRadius: 9, background: mgr ? "rgba(39,174,96,.1)" : "rgba(255,255,255,.04)", color: mgr ? "#2ecc71" : "#8892b0", cursor: "pointer", fontSize: 12, fontWeight: mgr ? 700 : 400, transition: "all .2s", minHeight: 36 }}>
            <I n={mgr ? "unlock" : "lock"} s={14} />{mob ? (mgr ? (mgrName.split(" ")[0]||"מנהל") : "") : (mgr ? mgrName : "כניסת מנהל")}
          </button>
        </header>

        <main className="main-pad" style={{ flex: 1, padding: "20px 18px", maxWidth: 1320, margin: "0 auto", width: "100%" }}>
          {tab === "board"    && <BoardView    wk={wk} setWk={setWk} weekA={weekA} prevA={prevA} data={data} sysMap={sysColorMap} mgr={mgr} filterPerson={filterPerson} setFilterPerson={setFilterPerson} onAdd={openAdd} onEdit={a => setModal({ t: "assign", mode: "edit", a })} onDelete={deleteAssign} onCopy={copyFromPrev} onCSV={() => doExportCSV(wk, weekA)} onPrint={() => doPrint(wk, weekA, data.systems)} onView={a => setViewAssign(a)} />}
          {tab === "calendar" && <CalendarView wk={wk} setWk={setWk} weekA={weekA} prevA={prevA} data={data} sysMap={sysColorMap} mgr={mgr} onAdd={openAdd} onEdit={a => setModal({ t: "assign", mode: "edit", a })} onCopy={copyFromPrev} onView={a => setViewAssign(a)} onPlan={() => setPlanner(true)} />}
          {tab === "annual"   && <AnnualView  annualData={annualData} onSaveDay={saveAnnualDay} mgr={mgr} myName={myName} />}
          {tab === "me"       && <MyView       wk={wk} setWk={setWk} weekA={weekA} data={data} sysMap={sysColorMap} myName={myName} annualData={annualData} setMyName={n => { setMyName(n); if (n) localStorage.setItem("myName", n); else localStorage.removeItem("myName"); }} onView={a => setViewAssign(a)} onChangeName={() => setShowWelcome(true)} pushStatus={pushStatus} onEnablePush={() => registerPush(myName, remindersOn).then(() => setPushStatus(Notification?.permission || "default"))} remindersOn={remindersOn} onToggleReminders={v => { setRemindersOn(v); localStorage.setItem("remindersOn", v); updateReminderPref(v); }} />}
          {tab === "settings" && <SettingsView data={data} save={save} mgr={mgr} mgrName={mgrName} toast={toast} onSyncAnnual={syncAnnualSections} />}
        </main>

        <BottomNav tab={tab} setTab={setTab} TABS={TABS} />
        {mgr && (tab === "board" || tab === "calendar") && (
          <button className="fab" onClick={openAdd} style={{ position: "fixed", left: 20, bottom: 80, width: 56, height: 56, borderRadius: 28, background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", border: "none", color: "#fff", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(74,158,255,.5)", cursor: "pointer", zIndex: 150 }}>+</button>
        )}
        {mgr && (
          <button onClick={() => setShowAbsenceModal(true)}
            title="רשום היעדרות"
            style={{ position: "fixed", left: 20, bottom: mob ? 144 : 24, width: 48, height: 48, borderRadius: 24, background: "linear-gradient(135deg,#e67e22,#c0392b)", border: "none", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 18px rgba(231,76,60,.5)", cursor: "pointer", zIndex: 150 }}>📋</button>
        )}
        <ToastContainer toasts={toasts} />
      </div>
      {modal?.t === "assign" && <AssignModal mode={modal.mode} a={modal.a} wk={wk} data={data} sysMap={sysColorMap} onClose={() => setModal(null)} onSave={upsertAssign} />}
      {modal?.t === "auth"   && <AuthModal pin={data.pin} managers={data.managers||[]} onOk={(name) => { setMgr(true); setMgrName(name); setModal(null); toast(`ברוך הבא, ${name}`, "info"); }} onClose={() => setModal(null)} />}
      {viewAssign && <AssignDetailModal a={viewAssign} sysMap={sysColorMap} mgr={mgr} onClose={() => setViewAssign(null)} onEdit={() => { setModal({ t: "assign", mode: "edit", a: viewAssign }); setViewAssign(null); }} onDelete={() => { deleteAssign(viewAssign.id); setViewAssign(null); }} />}
      {planner && <PlannerView wk={wk} data={data} sysMap={sysColorMap} weekA={weekA} annualData={annualData} onClose={() => setPlanner(false)} onSave={(assignments, planWk) => { const nd = addLog({ ...data, assignments }, "תכנן שבוע", `שבוע ${planWk||wk}`); save(nd, "שבוע תוכנן ✓"); }} />}
      {showWelcome && data && <WelcomeModal data={data} myName={myName} onSelect={n => { setMyName(n); localStorage.setItem("myName", n); setShowWelcome(false); }} onSkip={() => setShowWelcome(false)} />}
      {showAbsenceModal && <AbsenceModal data={data} annualData={annualData} onClose={() => setShowAbsenceModal(false)} onSave={async (range) => { await saveAbsenceRange(range); setShowAbsenceModal(false); toast(`✓ עודכן ${range.person} — ${range.fromDate} עד ${range.toDate}`); }} />}
    </MobileCtx.Provider>
  );
}

/* ── WELCOME / NAME PICKER MODAL ── */
function WelcomeModal({ data, myName, onSelect, onSkip }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)" }}>
      <div dir="rtl" style={{ background: "linear-gradient(160deg,#0f1a35,#0a1220)", border: "1px solid rgba(74,158,255,0.2)", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
        <img src="/logo.png" alt="" style={{ width: 72, height: 72, display: "block", margin: "0 auto 16px", opacity: .9 }} />
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>ברוך הבא!</div>
          <div style={{ fontSize: 14, color: "#8892b0" }}>בחר את שמך כדי לראות את השיבוצים שלך</div>
        </div>
        {getSections(data).map((sec, si) => { const sc = secPal(data, sec.name, si); return sec.people.length === 0 ? null : (
          <div key={sec.name} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: sc.accent, fontWeight: 700, letterSpacing: .5, marginBottom: 8, textTransform: "uppercase" }}>{sec.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sec.people.map(p => {
                const isSel = myName === p;
                const isHov = hovered === p;
                return (
                  <button key={p}
                    onClick={() => onSelect(p)}
                    onMouseEnter={() => setHovered(p)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ padding: "10px 18px", border: `2px solid ${isSel || isHov ? sc.accent : sc.accent + "44"}`, borderRadius: 24, background: isSel ? `${sc.accent}30` : isHov ? `${sc.accent}18` : "rgba(255,255,255,0.04)", color: isSel ? sc.accent : isHov ? sc.accent : "#ccd6f6", fontSize: 15, fontWeight: isSel ? 700 : 500, cursor: "pointer", transition: "all .12s", userSelect: "none" }}>
                    {isSel ? "✓ " : ""}{p}
                  </button>
                );
              })}
            </div>
          </div>
        ); })}
        <button onClick={onSkip} style={{ width: "100%", marginTop: 8, padding: "10px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 11, color: "#556", cursor: "pointer", fontSize: 13 }}>דלג — אראה לך את זה אחר כך</button>
      </div>
    </div>
  );
}

/* ── BOTTOM NAV (mobile) ── */
function BottomNav({ tab, setTab, TABS }) {
  return (
    <nav className="bottom-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f1525", borderTop: "1px solid rgba(255,255,255,0.09)", display: "flex", zIndex: 200, paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
      {TABS.map(t => {
        const active = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px 8px", border: "none", background: "transparent", color: active ? "#4a9eff" : "#556", cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 400, transition: "color .15s", minHeight: 56 }}>
            <I n={t.icon} s={active ? 21 : 19} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ── WEEK NAV ── */
function WeekNav({ wk, setWk, children }) {
  const mob = useContext(MobileCtx);
  const isToday = wk === wKey(new Date());
  return (
    <div style={{ marginBottom: mob ? 12 : 18 }}>
      {/* 3-column layout: spacer | center nav | action buttons — keeps date truly centered */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Left spacer — mirrors width of action buttons so center stays centered */}
        <div style={{ flex: 1 }} />
        {/* Center: arrows + week number + dates */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <NavBtn onClick={() => setWk(adjW(wk, -1))}><I n="cL" s={15} /></NavBtn>
          <div style={{ textAlign: "center", minWidth: mob ? 120 : 165 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <span style={{ fontWeight: 700, fontSize: mob ? 15 : 17, color: "#fff" }}>שבוע {wk.split("-W")[1]}</span>
              {isToday && <span style={{ background: "rgba(74,158,255,0.2)", color: "#4a9eff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(74,158,255,0.3)" }}>עכשיו</span>}
            </div>
            <div style={{ fontSize: 14, color: "#ccd6f6", marginTop: 2, fontWeight: 600, letterSpacing: 0.2 }}>{wLabel(wk)}</div>
          </div>
          <NavBtn onClick={() => setWk(adjW(wk, 1))}><I n="cR" s={15} /></NavBtn>
          {!isToday && <button onClick={() => setWk(wKey(new Date()))} style={{ padding: "4px 9px", border: "1px solid rgba(74,158,255,.3)", borderRadius: 8, background: "rgba(74,158,255,.1)", color: "#4a9eff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>היום</button>}
        </div>
        {/* Right side: action buttons */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          {!mob && children}
        </div>
      </div>
      {mob && children && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>{children}</div>}
    </div>
  );
}
const NavBtn = ({ onClick, children }) => (
  <button onClick={onClick} style={{ width: 34, height: 34, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer", color: "#aab", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}>{children}</button>
);

/* ── STATS ── */
function StatsRow({ weekA }) {
  const st = [
    { l: "שיבוצים", v: weekA.length, c: "#4a9eff" },
    { l: "מערכות",  v: new Set(weekA.map(a => a.system)).size, c: "#27ae60" },
    { l: "אנשים",   v: new Set(weekA.flatMap(a => a.assignees || [])).size, c: "#3d7fc4" },
    { l: "משימות",  v: weekA.reduce((n, a) => n + (a.tasks?.length || 0), 0), c: "#e67e22" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      {st.map(s => (
        <div key={s.l} style={{ flex: "1 1 80px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 14px" }} onMouseEnter={e => e.currentTarget.style.borderColor = s.c + "55"} onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.c, lineHeight: 1 }}>{s.v}</div>
          <div style={{ fontSize: 10, color: "#8892b0", marginTop: 4 }}>{s.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ── EMPTY ── */
function EmptyWeek({ mgr, prevCount, onAdd, onCopy }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "52px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>📋</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#ccd6f6", marginBottom: 6 }}>אין שיבוצים לשבוע זה</div>
      {mgr && (
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {prevCount > 0 && <PillBtn onClick={onCopy} color="#27ae60"><I n="copy" s={14} />העתק מהשבוע הקודם ({prevCount})</PillBtn>}
          <PillBtn onClick={onAdd}><I n="plus" s={14} />צור שיבוץ ידנית</PillBtn>
        </div>
      )}
      {!mgr && <p style={{ color: "#8892b0", fontSize: 13, marginTop: 8 }}>צור קשר עם הממונה שלך לקבלת שיבוצים</p>}
    </div>
  );
}

/* ── BOARD VIEW ── */
function BoardView({ wk, setWk, weekA, prevA, data, sysMap, mgr, filterPerson, setFilterPerson, onAdd, onEdit, onDelete, onCopy, onCSV, onPrint, onView }) {
  const mob = useContext(MobileCtx);
  const filtered = filterPerson ? weekA.filter(a => (a.assignees || []).includes(filterPerson)) : weekA;
  return (
    <div>
      <WeekNav wk={wk} setWk={setWk}>
        <div style={{ position: "relative" }}>
          <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
            style={{ padding: "7px 32px 7px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${filterPerson ? "#4a9eff55" : "rgba(255,255,255,0.12)"}`, borderRadius: 9, color: filterPerson ? "#4a9eff" : "#8892b0", fontSize: 12, cursor: "pointer", appearance: "none", paddingLeft: 30 }}>
            <option value="">כל האנשים</option>
            {getSections(data).map(sec => (
              <optgroup key={sec.name} label={sec.name}>
                {sec.people.map(p => <option key={p}>{p}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: filterPerson ? "#4a9eff" : "#8892b0", pointerEvents: "none" }}><I n="filter" s={12} /></span>
        </div>
        {!mob && <PillBtn ghost onClick={onPrint} small><I n="print" s={13} />הדפסה</PillBtn>}
        {!mob && <PillBtn ghost onClick={onCSV}   small><I n="dl"    s={13} />Excel</PillBtn>}
        {mgr && !mob && <PillBtn onClick={onAdd}><I n="plus" s={14} />הוסף שיבוץ</PillBtn>}
      </WeekNav>
      <StatsRow weekA={weekA} />
      {weekA.length === 0
        ? <EmptyWeek mgr={mgr} prevCount={prevA.length} onAdd={onAdd} onCopy={onCopy} />
        : <>
          {filterPerson && filtered.length < weekA.length && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(74,158,255,0.08)", border: "1px solid rgba(74,158,255,0.2)", borderRadius: 10, padding: "8px 14px", marginBottom: 14, fontSize: 13, color: "#4a9eff" }}>
              <span>מציג שיבוצים של {filterPerson} ({filtered.length} מתוך {weekA.length})</span>
              <button onClick={() => setFilterPerson("")} style={{ background: "none", border: "none", color: "#4a9eff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>הצג הכל ×</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(290px,1fr))", gap: mob ? 8 : 12 }}>
            {filtered.map(a => <BoardCard key={a.id} a={a} col={sysMap[a.system] || pal(0)} mgr={mgr} onEdit={() => onEdit(a)} onDelete={() => onDelete(a.id)} onView={() => onView(a)} />)}
          </div>
        </>
      }
    </div>
  );
}

/* ── BOARD CARD ── */
function BoardCard({ a, col, mgr, onEdit, onDelete, onView }) {
  const [exp, setExp]           = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const tasks    = a.tasks || [];
  const days     = a.days && a.days.length > 0 && a.days.length < 5 ? DAYS.filter(d => a.days.includes(d.key)).map(d => d.long) : null;
  const todayKey = todayDayKey();
  const activeToday = !a.days || a.days.length === 0 || a.days.includes(todayKey);
  return (
    <div onClick={e => { if (!e.defaultPrevented) onView(); }} style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${activeToday ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`, borderTop: `3px solid ${col.accent}`, borderRadius: 13, overflow: "hidden", transition: "transform .15s,box-shadow .15s", cursor: "pointer" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 32px rgba(0,0,0,.45)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ background: col.dark, padding: "11px 13px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.system}</span>
            {activeToday && <span style={{ background: `${col.accent}33`, color: col.accent, border: `1px solid ${col.accent}55`, borderRadius: 20, padding: "1px 7px", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>פעיל היום</span>}
          </div>
          {days && <div style={{ fontSize: 10, color: col.accent, marginTop: 2, opacity: .85 }}>{days.join(" · ")}</div>}
        </div>
        {mgr && !confirmDel && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <ActionBtn onClick={e => { e.preventDefault(); onEdit(); }} color={col.accent} title="עריכה"><I n="edit" s={12} /></ActionBtn>
            <ActionBtn onClick={e => { e.preventDefault(); setConfirmDel(true); }} color="#e74c3c" title="מחיקה"><I n="trash" s={12} /></ActionBtn>
          </div>
        )}
        {confirmDel && (
          <div onClick={e => e.preventDefault()} style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "#e74c3c" }}>למחוק?</span>
            <button onClick={e => { e.preventDefault(); onDelete(); setConfirmDel(false); }} style={{ padding: "3px 9px", background: "#c0392b", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>כן</button>
            <button onClick={e => { e.preventDefault(); setConfirmDel(false); }} style={{ padding: "3px 9px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, color: "#aaa", fontSize: 11, cursor: "pointer" }}>לא</button>
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px 7px" }}>
        <div style={{ fontSize: 9, color: "#8892b0", fontWeight: 700, letterSpacing: .7, marginBottom: 6, textTransform: "uppercase" }}>משובצים</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {(a.assignees || []).map(p => <Chip key={p} label={p} color={col.accent} />)}
          {!(a.assignees || []).length && <span style={{ fontSize: 11, color: "#556", fontStyle: "italic" }}>אין אנשים</span>}
        </div>
      </div>
      {tasks.length > 0 && (
        <div style={{ padding: "5px 12px 11px" }}>
          <div style={{ fontSize: 9, color: "#8892b0", fontWeight: 700, letterSpacing: .7, marginBottom: 5, textTransform: "uppercase" }}>משימות ({tasks.length})</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {(exp ? tasks : tasks.slice(0, 4)).map((t, i) => (
              <li key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12 }}>
                <span style={{ color: col.accent, flexShrink: 0, marginTop: 2 }}><I n="check" s={10} /></span>
                <span style={{ color: "#c8d0e4", lineHeight: 1.4 }}>{t}</span>
              </li>
            ))}
          </ul>
          {tasks.length > 4 && <button onClick={() => setExp(v => !v)} style={{ background: "none", border: "none", color: col.accent, fontSize: 10, cursor: "pointer", padding: "3px 0", fontWeight: 600 }}>{exp ? "▲ הצג פחות" : `▼ עוד ${tasks.length - 4} משימות`}</button>}
        </div>
      )}
      {a.notes && <div style={{ margin: "0 12px 11px", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 7, borderRight: `3px solid ${col.accent}40`, fontSize: 11, color: "#7a88a0", lineHeight: 1.5 }}>{a.notes}</div>}
    </div>
  );
}
const ActionBtn = ({ onClick, color, title, children }) => (
  <button onClick={onClick} title={title} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 7, padding: "5px 7px", cursor: "pointer", color, display: "flex", alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}>{children}</button>
);

/* ── CALENDAR VIEW ── */
function CalendarView({ wk, setWk, weekA, prevA, data, sysMap, mgr, onAdd, onEdit, onCopy, onView, onPlan }) {
  const mob = useContext(MobileCtx);
  const [mode, setMode] = useState("sys");
  const todayKey     = todayDayKey();
  const activeSys    = [...new Set(data.systems.filter(s => weekA.some(a => a.system === s)))];
  const activePeople = [...new Set(weekA.flatMap(a => a.assignees || []))].sort();
  return (
    <div>
      <WeekNav wk={wk} setWk={setWk}>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, gap: 2 }}>
          {[{ id: "sys", l: "לפי מערכת" }, { id: "people", l: "לפי אדם" }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "4px 12px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: mode === m.id ? 700 : 400, background: mode === m.id ? "rgba(74,158,255,0.2)" : "transparent", color: mode === m.id ? "#4a9eff" : "#8892b0" }}>{m.l}</button>
          ))}
        </div>
        {mgr && !mob && <PillBtn onClick={onAdd}><I n="plus" s={13} />הוסף שיבוץ</PillBtn>}
        {mgr && <PillBtn onClick={onPlan} color="#3d7fc4"><I n="grid" s={13} />תכנן שבוע</PillBtn>}
      </WeekNav>
      {weekA.length === 0 ? <EmptyWeek mgr={mgr} prevCount={prevA.length} onAdd={onAdd} onCopy={onCopy} /> : mob
        ? <CalendarMobile weekA={weekA} activeSys={activeSys} activePeople={activePeople} sysMap={sysMap} todayKey={todayKey} mode={mode} onView={onView} />
        : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 3, minWidth: 580 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 130, textAlign: "right", paddingRight: 14 }}>{mode === "sys" ? "מערכת" : "שם"}</th>
                {DAYS.map(d => {
                  const isToday = d.key === todayKey;
                  return <th key={d.key} style={{ ...TH, background: isToday ? "rgba(74,158,255,0.18)" : "rgba(255,255,255,0.05)", color: isToday ? "#4a9eff" : "#8892b0", border: isToday ? "1px solid rgba(74,158,255,0.3)" : "1px solid transparent" }}>
                    {d.long}{isToday && <span style={{ display: "block", fontSize: 8, fontWeight: 700 }}>היום</span>}
                  </th>;
                })}
              </tr>
            </thead>
            <tbody>
              {mode === "sys" ? activeSys.map((sys, si) => {
                const col = sysMap[sys] || pal(si);
                const sysA = weekA.filter(a => a.system === sys);
                const allTasks = [...new Set(sysA.flatMap(a => a.tasks || []))];
                return (
                  <tr key={sys}>
                    <td style={{ ...TD, background: col.dark, borderRight: `3px solid ${col.accent}`, fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer" }} onClick={() => onView(sysA[0])}>
                      <div>{sys}</div>
                      {allTasks.length > 0 && <div style={{ fontSize: 9, color: col.accent, fontWeight: 400, marginTop: 3, opacity: .8 }}>{allTasks.length} משימות</div>}
                    </td>
                    {DAYS.map(({ key }) => {
                      const isToday = key === todayKey;
                      const dayA = sysA.filter(a => !a.days || a.days.length === 0 || a.days.includes(key));
                      const people = [...new Set(dayA.flatMap(a => a.assignees || []))];
                      const dayTasks = [...new Set(dayA.flatMap(a => a.tasks || []))];
                      return <td key={key} onClick={() => dayA.length > 0 && onView(dayA[0])} style={{ ...TD, background: isToday ? `${col.accent}14` : (people.length ? "rgba(255,255,255,0.04)" : "transparent"), border: isToday ? `1px solid ${col.accent}33` : "1px solid transparent", verticalAlign: "top", cursor: people.length ? "pointer" : "default" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{people.map(p => <Chip key={p} label={p} color={col.accent} />)}</div>
                        {dayTasks.length > 0 && <div style={{ marginTop: 4 }}>{dayTasks.slice(0, 2).map((t, i) => <div key={i} style={{ fontSize: 10, color: "#8892b0", marginTop: 2, display: "flex", gap: 4, alignItems: "flex-start" }}><span style={{ color: col.accent, flexShrink: 0 }}>✓</span><span style={{ lineHeight: 1.3 }}>{t.length > 28 ? t.slice(0, 26) + "…" : t}</span></div>)}{dayTasks.length > 2 && <div style={{ fontSize: 9, color: "#556", marginTop: 2 }}>+{dayTasks.length - 2} משימות</div>}</div>}
                      </td>;
                    })}
                  </tr>
                );
              }) : activePeople.map(person => (
                <tr key={person}>
                  <td style={{ ...TD, fontWeight: 600, fontSize: 13, color: "#ccd6f6", background: "rgba(255,255,255,0.03)", borderRight: "3px solid rgba(255,255,255,0.15)" }}>{person}</td>
                  {DAYS.map(({ key }) => {
                    const isToday = key === todayKey;
                    const active = weekA.filter(a => (a.assignees || []).includes(person) && (!a.days || a.days.length === 0 || a.days.includes(key)));
                    return <td key={key} onClick={() => active.length > 0 && onView(active[0])} style={{ ...TD, background: isToday && active.length ? "rgba(74,158,255,0.1)" : (active.length ? "rgba(255,255,255,0.04)" : "transparent"), border: isToday ? "1px solid rgba(74,158,255,0.25)" : "1px solid transparent", verticalAlign: "top", cursor: active.length ? "pointer" : "default" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{active.map(a => { const c = sysMap[a.system] || pal(0); const tasks = a.tasks || []; return <div key={a.id}><Chip label={a.system} color={c.accent} />{tasks.length > 0 && <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2, paddingRight: 2 }}>{tasks.slice(0,1).map((t,i)=><span key={i} style={{ color: c.accent, fontSize: 11, fontWeight: 600 }}>✓ {t.length>32?t.slice(0,30)+"…":t}</span>)}</div>}</div>; })}</div>
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
/* ── CALENDAR MOBILE (no horizontal scroll) ── */
function CalendarMobile({ weekA, activeSys, activePeople, sysMap, todayKey, mode, onView }) {
  const [expanded,  setExpanded]  = useState({});
  const [viewMode,  setViewMode]  = useState("grid"); // "grid" | "day"
  const [activeDay, setActiveDay] = useState(() => todayKey || "sun");
  const rows = mode === "sys" ? activeSys : activePeople;
  const WORK = DAYS.slice(0, 5);
  const WKND = DAYS.slice(5);
  const firstName = n => n.split(" ")[0];
  const MAX = 4;

  // ── Day view ──────────────────────────────────────────
  if (viewMode === "day") {
    const dayAssigns = weekA.filter(a => !a.days || a.days.length === 0 || a.days.includes(activeDay));
    const grouped = activeSys.map(sys => ({ sys, col: sysMap[sys] || pal(activeSys.indexOf(sys)), a: dayAssigns.filter(a => a.system === sys) })).filter(g => g.a.length > 0);
    return (
      <div>
        {/* Toggle */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={() => setViewMode("grid")} style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#8892b0", cursor: "pointer" }}>📊 תצוגת טבלה</button>
        </div>
        {/* Day tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
          {DAYS.map(d => {
            const isToday = d.key === todayKey;
            const isActive = d.key === activeDay;
            const cnt = weekA.filter(a => !a.days || a.days.length === 0 || a.days.includes(d.key)).length;
            return (
              <button key={d.key} onClick={() => setActiveDay(d.key)}
                style={{ flex: "0 0 auto", padding: "7px 12px", border: `2px solid ${isActive ? "#4a9eff" : isToday ? "rgba(74,158,255,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, background: isActive ? "rgba(74,158,255,0.18)" : isToday ? "rgba(74,158,255,0.06)" : "rgba(255,255,255,0.03)", color: isActive ? "#4a9eff" : isToday ? "#7ab3e8" : "#8892b0", fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
                {d.long}{cnt > 0 && <span style={{ marginRight: 5, fontSize: 10, opacity: .7 }}>({cnt})</span>}
              </button>
            );
          })}
        </div>
        {/* Assignments list */}
        {grouped.length === 0
          ? <div style={{ textAlign: "center", padding: "32px 0", opacity: .4, fontSize: 14 }}>אין שיבוצים ביום זה</div>
          : grouped.map(({ sys, col, a }) => (
            <div key={sys} onClick={() => onView(a[0])} style={{ marginBottom: 10, background: col.dark, border: `1px solid ${col.accent}44`, borderRight: `4px solid ${col.accent}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: col.accent, marginBottom: 6 }}>{sys}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...new Set(a.flatMap(x => x.assignees || []))].map(p => (
                  <span key={p} style={{ fontSize: 13, background: `${col.accent}22`, color: col.accent, border: `1px solid ${col.accent}44`, borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>{p}</span>
                ))}
              </div>
              {a[0]?.tasks?.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "#8892b0" }}>✓ {a[0].tasks[0]}{a[0].tasks.length > 1 ? ` +${a[0].tasks.length - 1}` : ""}</div>}
            </div>
          ))
        }
      </div>
    );
  }

  // ── Grid view (original) ───────────────────────────────

  const getDayData = (rowA, key) => {
    const dayA = rowA.filter(a => !a.days || a.days.length === 0 || a.days.includes(key));
    const people = mode === "sys" ? [...new Set(dayA.flatMap(a => a.assignees || []))] : (dayA.length ? [rows[0]] : []);
    return { dayA, people };
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Toggle to day view */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={() => setViewMode("day")} style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#8892b0", cursor: "pointer" }}>📅 תצוגת יום</button>
      </div>
      {/* header */}
      <div style={{ display: "grid", gridTemplateColumns: "62px repeat(5,1fr) 26px 26px", gap: 2, marginBottom: 3 }}>
        <div />
        {WORK.map(d => {
          const isToday = d.key === todayKey;
          return <div key={d.key} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: isToday ? "#4a9eff" : "#7a8499", background: isToday ? "rgba(74,158,255,0.12)" : "rgba(255,255,255,0.03)", borderRadius: 6, padding: "5px 0" }}>
            {d.short}{isToday && <div style={{ fontSize: 8, marginTop: 1 }}>היום</div>}
          </div>;
        })}
        {WKND.map(d => {
          const isToday = d.key === todayKey;
          return <div key={d.key} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: isToday ? "#4a9eff" : "#445", background: isToday ? "rgba(74,158,255,0.1)" : "transparent", borderRadius: 6, padding: "5px 0" }}>
            {d.short}
          </div>;
        })}
      </div>

      {rows.map((row, si) => {
        const col = mode === "sys" ? (sysMap[row] || pal(si)) : null;
        const rowA = mode === "sys"
          ? weekA.filter(a => a.system === row)
          : weekA.filter(a => (a.assignees || []).includes(row));
        if (!rowA.length) return null;
        const rowKey = `${mode}-${row}`;

        return (
          <div key={row} style={{ display: "grid", gridTemplateColumns: "62px repeat(5,1fr) 26px 26px", gap: 2, marginBottom: 3, alignItems: "stretch" }}>
            {/* label */}
            <div onClick={() => onView(rowA[0])} style={{ background: col ? col.dark : "rgba(255,255,255,0.04)", borderRight: `3px solid ${col ? col.accent : "rgba(255,255,255,0.2)"}`, borderRadius: 8, padding: "6px 6px", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: col ? col.accent : "#ccd6f6", lineHeight: 1.3, wordBreak: "break-word" }}>{row}</span>
            </div>

            {/* work days: show names */}
            {WORK.map(({ key }) => {
              const isToday = key === todayKey;
              const { dayA, people } = getDayData(rowA, key);
              const accent = col ? col.accent : (dayA.length > 0 ? (sysMap[dayA[0]?.system] || pal(0)).accent : "#4a9eff");
              const isExp = expanded[`${rowKey}-${key}`];
              const shown = isExp ? people : people.slice(0, MAX);
              const extra = people.length - MAX;
              return (
                <div key={key} onClick={() => dayA.length > 0 && onView(dayA[0])}
                  style={{ borderRadius: 7, background: isToday ? `${accent}18` : (people.length ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)"), border: isToday ? `1px solid ${accent}44` : "1px solid rgba(255,255,255,0.05)", padding: people.length ? "4px 3px" : 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: people.length ? "pointer" : "default", minHeight: 36, justifyContent: "center" }}>
                  {shown.map(p => (
                    <div key={p} style={{ fontSize: 9, fontWeight: 600, color: accent, lineHeight: 1.2, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", paddingInline: 2 }}>{firstName(p)}</div>
                  ))}
                  {!isExp && extra > 0 && (
                    <div onClick={e => { e.stopPropagation(); setExpanded(ex => ({ ...ex, [`${rowKey}-${key}`]: true })); }}
                      style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: accent, borderRadius: 10, padding: "1px 5px", lineHeight: 1.4 }}>+{extra}</div>
                  )}
                  {!people.length && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />}
                </div>
              );
            })}

            {/* weekend: dot only */}
            {WKND.map(({ key }) => {
              const isToday = key === todayKey;
              const { dayA, people } = getDayData(rowA, key);
              const accent = col ? col.accent : (dayA.length > 0 ? (sysMap[dayA[0]?.system] || pal(0)).accent : "#4a9eff");
              return (
                <div key={key} onClick={() => dayA.length > 0 && onView(dayA[0])}
                  style={{ borderRadius: 7, background: isToday ? "rgba(74,158,255,0.08)" : "transparent", border: isToday ? "1px solid rgba(74,158,255,0.2)" : "1px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36, cursor: people.length ? "pointer" : "default" }}>
                  {people.length > 0
                    ? <div style={{ width: 18, height: 18, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>{people.length}</div>
                    : <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const TH = { padding: "8px 10px", textAlign: "center", borderRadius: 7, fontSize: 12, fontWeight: 600 };
const TD = { padding: "7px 9px", borderRadius: 7, fontSize: 12, minHeight: 36 };

/* ── MY VIEW ── */
function MyView({ wk, setWk, weekA, data, sysMap, myName, annualData, setMyName, onView, onChangeName, pushStatus, onEnablePush, remindersOn, onToggleReminders }) {
  const todayKey      = todayDayKey();
  const isTodayWork   = isWorkDay(todayKey);
  const isCurrentWeek = wk === wKey(new Date());
  const [mode, setMode]         = useState("me");   // "me" | "all"
  const [filterName, setFilterName] = useState(null); // null = הכל, string = מסונן

  const allPeople = getAllPeople(data);
  const shownA = mode === "me"
    ? (myName ? weekA.filter(a => (a.assignees || []).includes(myName)) : [])
    : (filterName ? weekA.filter(a => (a.assignees || []).includes(filterName)) : weekA);
  const todayShown = isCurrentWeek && isTodayWork
    ? shownA.filter(a => !a.days || a.days.length === 0 || a.days.includes(todayKey)) : [];
  const restShown  = shownA.filter(a => !todayShown.includes(a));

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <WeekNav wk={wk} setWk={setWk} />

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button onClick={() => setMode("me")} style={{ flex: 1, padding: "9px", border: `2px solid ${mode==="me" ? "#4a9eff" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, background: mode==="me" ? "rgba(74,158,255,0.12)" : "rgba(255,255,255,0.03)", color: mode==="me" ? "#4a9eff" : "#8892b0", fontWeight: mode==="me" ? 700 : 400, fontSize: 13, cursor: "pointer" }}>
          {myName ? myName.split(" ")[0] : "שלי"}
        </button>
        <button onClick={() => { setMode("all"); setFilterName(null); }} style={{ flex: 1, padding: "9px", border: `2px solid ${mode==="all" ? "#3d7fc4" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, background: mode==="all" ? "rgba(61,127,196,0.12)" : "rgba(255,255,255,0.03)", color: mode==="all" ? "#7ab3e8" : "#8892b0", fontWeight: mode==="all" ? 700 : 400, fontSize: 13, cursor: "pointer" }}>
          הכל {mode==="all" && weekA.length > 0 ? `(${weekA.length})` : ""}
        </button>
      </div>

      {/* "הכל" mode — name filter chips */}
      {mode === "all" && (
        <div style={{ marginBottom: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "#556", fontWeight: 700, marginBottom: 8 }}>סנן לפי שם</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allPeople.map(p => {
              const isSel = filterName === p;
              const c = sysMap[weekA.find(a=>(a.assignees||[]).includes(p))?.system] || pal(0);
              return (
                <button key={p} onClick={() => setFilterName(isSel ? null : p)}
                  style={{ padding: "5px 12px", border: `1px solid ${isSel ? c.accent : "rgba(255,255,255,0.12)"}`, borderRadius: 20, background: isSel ? `${c.accent}22` : "rgba(255,255,255,0.04)", color: isSel ? c.accent : "#8892b0", fontSize: 12, fontWeight: isSel ? 700 : 400, cursor: "pointer" }}>
                  {isSel ? "✕ " : ""}{p}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* "שלי" mode — identity card */}
      {mode === "me" && myName && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, background: "rgba(74,158,255,0.07)", border: "1px solid rgba(74,158,255,0.2)", borderRadius: 13, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff", flexShrink: 0 }}>{myName[0]}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{myName}</div>
              <div style={{ fontSize: 11, color: "#8892b0" }}>השיבוצים שלי</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
            <button onClick={onChangeName} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#8892b0", fontSize: 12, cursor: "pointer" }}>שנה שם</button>
            {"Notification" in window && pushStatus !== "denied" && (
              <button
                onClick={pushStatus === "granted" ? undefined : onEnablePush}
                style={{ padding: "5px 10px", background: pushStatus === "granted" ? "rgba(39,174,96,0.12)" : "rgba(74,158,255,0.1)", border: `1px solid ${pushStatus === "granted" ? "rgba(39,174,96,0.3)" : "rgba(74,158,255,0.3)"}`, borderRadius: 8, color: pushStatus === "granted" ? "#27ae60" : "#4a9eff", fontSize: 11, cursor: pushStatus === "granted" ? "default" : "pointer", fontWeight: 600 }}>
                {pushStatus === "granted" ? "🔔 פעיל" : "🔔 הפעל התראות"}
              </button>
            )}
            {"Notification" in window && pushStatus === "denied" && (
              <div style={{ fontSize: 10, color: "#8892b0", textAlign: "center" }}>🔕 חסומות</div>
            )}
          </div>
        </div>
      )}

      {/* Notification preferences panel — shown when push is active */}
      {"Notification" in window && pushStatus === "granted" && mode === "me" && myName && (
        <div style={{ marginBottom: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "#ccd6f6", fontWeight: 700, marginBottom: 12 }}>⚙️ הגדרות התראות</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Reminder toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, color: "#ccd6f6", fontWeight: 600 }}>תזכורת בוקר</div>
                <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>קבל תזכורת ב-07:00 על שיבוצים להיום</div>
              </div>
              <button
                onClick={() => onToggleReminders(!remindersOn)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: remindersOn ? "#27ae60" : "rgba(255,255,255,0.12)",
                  position: "relative", transition: "background .2s", flexShrink: 0,
                }}>
                <span style={{
                  position: "absolute", top: 2, width: 20, height: 20, borderRadius: 10,
                  background: "#fff", transition: "right .2s",
                  right: remindersOn ? 2 : 22,
                }} />
              </button>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
              + התראה אוטומטית כשמנהל משבץ אותך
            </div>
          </div>
        </div>
      )}
      {/* Annual plan status this week */}
      {mode === "me" && myName && annualData && (() => {
        const wdKeys = ['sun','mon','tue','wed','thu','fri'];
        const strips = wdKeys.map(dk => {
          const iso  = wkDayToDate(wk, dk);
          const code = iso ? (annualData.days?.[iso]?.statuses?.[myName] || '') : '';
          const st   = statusStyle(code);
          const d    = DAYS.find(x => x.key === dk);
          const isToday = dk === todayDayKey() && wk === wKey(new Date());
          return { dk, iso, code, st, short: d?.short || dk, isToday };
        });
        const hasAny = strips.some(s => s.code);
        if (!hasAny) return null;
        return (
          <div style={{ marginBottom: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#8892b0', fontWeight: 700, marginBottom: 8 }}>📅 סטטוס שלי השבוע</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {strips.map(({ dk, code, st, short, isToday }) => (
                <div key={dk} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 2px', borderRadius: 7, background: isToday ? 'rgba(74,158,255,0.1)' : 'transparent', border: isToday ? '1px solid rgba(74,158,255,0.25)' : '1px solid transparent' }}>
                  <span style={{ fontSize: 10, color: isToday ? '#4a9eff' : '#445', fontWeight: isToday ? 700 : 400 }}>{short}</span>
                  {code
                    ? <span style={{ background: st?.bg || '#333', color: '#fff', borderRadius: 4, padding: '2px 4px', fontSize: 9, fontWeight: 700, width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{code.slice(0,4)}</span>
                    : <span style={{ width: '100%', height: 18 }} />}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {mode === "me" && !myName && (
        <div style={{ marginBottom: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 13, padding: "14px 16px" }}>
          <label style={{ ...lbl, marginBottom: 10 }}>מי אתה?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {getSections(data).map((sec, si) => { const sc = secPal(data, sec.name, si); return sec.people.length === 0 ? null : (
              <div key={sec.name}>
                <div style={{ fontSize: 10, color: sc.accent, fontWeight: 700, letterSpacing: .5, marginBottom: 6, textTransform: "uppercase" }}>{sec.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sec.people.map(p => (
                    <button key={p} onClick={() => { setMyName(p); localStorage.setItem("myName", p); }} style={{ padding: "7px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, background: "rgba(255,255,255,0.04)", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>{p}</button>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        </div>
      )}

      {/* Empty states */}
      {mode === "me" && !myName && <div style={{ textAlign: "center", padding: "40px 24px", opacity: .5 }}><div style={{ fontSize: 36, marginBottom: 8 }}>👆</div><div style={{ fontSize: 14, color: "#ccd6f6" }}>בחר את שמך למעלה</div></div>}
      {shownA.length === 0 && (mode === "all" || myName) && <div style={{ textAlign: "center", padding: "40px 24px", opacity: .5 }}><div style={{ fontSize: 36, marginBottom: 8 }}>📭</div><div style={{ fontSize: 14, color: "#ccd6f6" }}>{filterName ? `אין שיבוצים ל${filterName}` : "אין שיבוצים בשבוע זה"}</div></div>}

      {/* Today */}
      {todayShown.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <I n="sun" s={14} /><span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>היום — {DAYS.find(d => d.key === todayKey)?.long}</span>
            <span style={{ background: "rgba(74,158,255,0.2)", color: "#4a9eff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(74,158,255,0.3)" }}>עכשיו</span>
          </div>
          {todayShown.map((a, i) => <AssignRow key={a.id} a={a} col={sysMap[a.system] || pal(i)} highlight onView={() => onView(a)} />)}
        </div>
      )}
      {shownA.length > 0 && todayShown.length === 0 && isCurrentWeek && isTodayWork && mode === "me" && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#8892b0", textAlign: "center" }}>
          אין שיבוצים להיום ספציפית — בדוק שיבוצי השבוע למטה
        </div>
      )}

      {/* Rest of week */}
      {restShown.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "#8892b0", fontWeight: 600, letterSpacing: .5, marginBottom: 10, textTransform: "uppercase" }}>
            {todayShown.length > 0 ? "שאר השבוע" : "שיבוצי השבוע"}
          </div>
          {restShown.map((a, i) => <AssignRow key={a.id} a={a} col={sysMap[a.system] || pal(i + 2)} onView={() => onView(a)} />)}
        </div>
      )}
    </div>
  );
}
function AssignRow({ a, col, highlight }) {
  const [open, setOpen] = useState(false);
  const days = a.days && a.days.length > 0 && a.days.length < 5 ? DAYS.filter(d => a.days.includes(d.key)).map(d => d.long) : null;
  return (
    <div style={{ background: highlight ? col.dark : "rgba(255,255,255,0.04)", border: `1px solid ${highlight ? col.accent + "55" : "rgba(255,255,255,0.08)"}`, borderRight: `4px solid ${col.accent}`, borderRadius: 12, marginBottom: 8, overflow: "hidden", cursor: "pointer" }} onClick={() => setOpen(v => !v)}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15, color: col.accent }}>{a.system}</span>
          {days && <span style={{ fontSize: 10, color: "#8892b0", marginRight: 8 }}> · {days.join(", ")}</span>}
          <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>{(a.tasks || []).length} משימות{(a.assignees || []).length > 1 ? ` · צוות: ${(a.assignees || []).join(", ")}` : ""}</div>
        </div>
        <span style={{ color: "#8892b0", transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform .2s", fontSize: 12 }}>▶</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 13px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {(a.tasks || []).map((t, j) => (
            <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginTop: 8 }}>
              <span style={{ color: col.accent, flexShrink: 0, marginTop: 2 }}><I n="check" s={11} /></span>
              <span style={{ color: "#c8d0e4" }}>{t}</span>
            </div>
          ))}
          {!(a.tasks || []).length && <div style={{ fontSize: 12, color: "#556", marginTop: 8 }}>אין משימות מוגדרות</div>}
          {a.notes && <div style={{ marginTop: 10, fontSize: 11, color: "#7a88a0", lineHeight: 1.6, background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "7px 10px" }}>{a.notes}</div>}
        </div>
      )}
    </div>
  );
}

/* ── LEGEND EDITOR ── */
const DEFAULT_LEGEND = [
  { id: 'shift',    name: 'משמרות',      codes: ['י', 'ל', 'Y', 'L'] },
  { id: 'oncall',   name: 'כוננות',      codes: ['כ', 'כש', 'כמ', 'כמש'] },
  { id: 'absent',   name: 'היעדרויות',   codes: ['ח', 'מיל', 'מ', 'פ', 'מנוחה', 'ק'] },
  { id: 'away',     name: 'חוץ לבסיס',  codes: ['חיפה', 'הרצליה', 'ראש פינה', 'PBB', 'רמון'] },
  { id: 'training', name: 'הכשרות',      codes: ['ב. חשמל', 'ב. כללית', 'השתלמות', 'ניקיון תחנות'] },
];

function LegendEditor() {
  const [groups, setGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem("legendGroups")) || DEFAULT_LEGEND; } catch { return DEFAULT_LEGEND; }
  });
  const [newGroupName, setNewGroupName] = useState("");
  const [dropTarget, setDropTarget]     = useState(null);
  const dragRef = useRef(null);

  function persist(g) { setGroups(g); localStorage.setItem("legendGroups", JSON.stringify(g)); }

  function onDrop(toGroupId) {
    if (!dragRef.current) return;
    const { code, fromGroupId } = dragRef.current;
    if (fromGroupId === toGroupId) { dragRef.current = null; return; }
    persist(groups.map(g => {
      if (g.id === fromGroupId) return { ...g, codes: g.codes.filter(c => c !== code) };
      if (g.id === toGroupId)   return { ...g, codes: [...g.codes, code] };
      return g;
    }));
    dragRef.current = null;
  }

  function removeCode(groupId, code) {
    persist(groups.map(g => g.id === groupId ? { ...g, codes: g.codes.filter(c => c !== code) } : g));
  }

  function renameGroup(id, name) {
    persist(groups.map(g => g.id === id ? { ...g, name } : g));
  }

  function removeGroup(id) {
    const dying = groups.find(g => g.id === id);
    const firstOther = groups.find(g => g.id !== id);
    persist(groups
      .filter(g => g.id !== id)
      .map(g => g.id === firstOther?.id ? { ...g, codes: [...g.codes, ...(dying?.codes || [])] } : g));
  }

  function addGroup() {
    if (!newGroupName.trim()) return;
    persist([...groups, { id: Date.now().toString(36), name: newGroupName.trim(), codes: [] }]);
    setNewGroupName("");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#8892b0" }}>גרור קודים בין קבוצות לשינוי הסיווג</div>
        <button onClick={() => persist(DEFAULT_LEGEND)} style={{ background: "none", border: "1px solid #334", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#556", cursor: "pointer" }}>איפוס</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {groups.map(group => (
          <div key={group.id}
            onDragOver={e => { e.preventDefault(); setDropTarget(group.id); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
            onDrop={e => { e.preventDefault(); onDrop(group.id); setDropTarget(null); }}
            style={{ border: `2px solid ${dropTarget === group.id ? "#4a9eff" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, overflow: "hidden", transition: "border-color .15s", background: dropTarget === group.id ? "rgba(74,158,255,0.06)" : "transparent" }}>
            {/* Group header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <input value={group.name} onChange={e => renameGroup(group.id, e.target.value)}
                style={{ ...inp, padding: "3px 8px", fontSize: 12, fontWeight: 700, flex: 1 }} />
              <span style={{ fontSize: 10, color: "#445", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "2px 8px", whiteSpace: "nowrap" }}>{group.codes.length} קודים</span>
              {groups.length > 1 && (
                <button onClick={() => removeGroup(group.id)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 15, opacity: .6, padding: 2 }} title="מחק קבוצה">✕</button>
              )}
            </div>
            {/* Code chips */}
            <div style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 8, minHeight: 54 }}>
              {group.codes.length === 0 && (
                <span style={{ fontSize: 11, color: "#334", alignSelf: "center", fontStyle: "italic" }}>גרור לכאן קודים…</span>
              )}
              {group.codes.map(code => {
                const st = statusStyle(code);
                return (
                  <div key={code} draggable
                    onDragStart={() => { dragRef.current = { code, fromGroupId: group.id }; }}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: st ? `${st.bg}22` : "rgba(255,255,255,0.06)", border: `1px solid ${st ? `${st.bg}55` : "rgba(255,255,255,0.12)"}`, borderRadius: 8, padding: "5px 10px", cursor: "grab", userSelect: "none" }}>
                    <span style={{ background: st?.bg || "#555", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{code}</span>
                    {st?.label && <span style={{ fontSize: 11, color: "#8892b0" }}>{st.label}</span>}
                    <button onClick={() => removeCode(group.id, code)}
                      style={{ background: "none", border: "none", color: "#556", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 0 0 2px" }} title="הסר">✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add new group */}
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addGroup()}
          placeholder="שם קבוצה חדשה…" style={{ ...inp, flex: 1 }} />
        <PillBtn onClick={addGroup} color="#4a9eff">+ קבוצה</PillBtn>
      </div>
    </div>
  );
}

/* ── SETTINGS ── */
function SettingsView({ data, save, mgr, mgrName, toast, onSyncAnnual }) {
  const isMaster = mgrName === "מנהל ראשי";
  const [st, setSt]     = useState("sys");
  const [vSys, setVSys] = useState("");
  const [vPin, setVPin] = useState("");
  if (!mgr) return (
    <div style={{ textAlign: "center", padding: "80px 24px", opacity: .4 }}>
      <div style={{ fontSize: 42, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#ccd6f6", marginBottom: 6 }}>הגדרות זמינות למנהלים בלבד</div>
      <div style={{ fontSize: 12, color: "#8892b0" }}>לחץ על ״כניסת מנהל״ למעלה</div>
    </div>
  );
  const tabs = [
    { id: "sys",    l: "מערכות" },
    { id: "ppl",    l: "אנשי צוות" },
    { id: "legend", l: "מקרא" },
    { id: "log",    l: "יומן" },
    ...(isMaster ? [{ id: "mgrs", l: "מנהלים" }, { id: "sec", l: "אבטחה" }] : []),
  ];
  return (
    <div style={{ maxWidth: 540, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSt(t.id)} style={{ flex: 1, minWidth: 60, padding: "7px 4px", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: st === t.id ? 700 : 400, background: st === t.id ? "rgba(74,158,255,0.2)" : "transparent", color: st === t.id ? "#4a9eff" : "#8892b0" }}>{t.l}</button>
        ))}
      </div>
      {st === "sys"    && <SystemsEditor data={data} save={save} toast={toast} vSys={vSys} setVSys={setVSys} />}
      {st === "ppl"    && <SectionsEditor data={data} save={save} toast={toast} onSyncAnnual={onSyncAnnual} />}
      {st === "legend" && <LegendEditor />}
      {st === "log"    && <ActivityLog data={data} />}
      {st === "mgrs"   && isMaster && <ManagersEditor data={data} save={save} toast={toast} />}
      {st === "sec"    && isMaster && (
        <div>
          <label style={lbl}>שנה קוד PIN ראשי</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={vPin} onChange={e => setVPin(e.target.value)} type="password" inputMode="numeric" placeholder="קוד PIN חדש (לפחות 4 ספרות)" style={inp} />
            <PillBtn onClick={() => { if (vPin.length < 4) { toast("קוד חייב להיות לפחות 4 תווים", "error"); return; } save({ ...data, pin: vPin }, "קוד PIN עודכן ✓"); setVPin(""); }}>עדכן</PillBtn>
          </div>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.2)", borderRadius: 9, fontSize: 12, color: "#e67e22" }}>
            PIN ראשי נוכחי: {data.pin} · שמור במקום בטוח
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MANAGERS EDITOR ── */
function ManagersEditor({ data, save, toast }) {
  const [name, setName] = useState("");
  const [pin, setPin]   = useState("");
  const managers = data.managers || [];
  const add = () => {
    if (!name.trim()) { toast("הכנס שם", "error"); return; }
    if (pin.length < 4) { toast("קוד חייב להיות לפחות 4 ספרות", "error"); return; }
    if (managers.some(m => m.pin === pin) || pin === data.pin) { toast("קוד כבר בשימוש", "error"); return; }
    save({ ...data, managers: [...managers, { id: Date.now().toString(36), name: name.trim(), pin }] }, `מנהל נוסף: ${name.trim()}`);
    setName(""); setPin("");
  };
  const remove = id => save({ ...data, managers: managers.filter(m => m.id !== id) }, "מנהל הוסר");
  return (
    <div>
      <div style={{ marginBottom: 16, padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
        <label style={{ ...lbl, marginBottom: 10 }}>הוסף מנהל חדש</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="שם מלא" style={{ ...inp, flex: 2 }} />
          <input value={pin} onChange={e => setPin(e.target.value)} type="password" inputMode="numeric" placeholder="קוד PIN" style={{ ...inp, flex: 1 }} />
        </div>
        <PillBtn onClick={add} color="#4a9eff">הוסף מנהל</PillBtn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {managers.length === 0 && <div style={{ fontSize: 13, color: "#445", textAlign: "center", padding: 20 }}>אין מנהלים מוגדרים עדיין</div>}
        {managers.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRight: "3px solid #4a9eff", borderRadius: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{m.name}</div>
              <div style={{ fontSize: 11, color: "#556" }}>PIN: {"●".repeat(m.pin.length)}</div>
            </div>
            <button onClick={() => remove(m.id)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", opacity: .7, padding: 6 }} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}><I n="trash" s={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── ACTIVITY LOG ── */
function ActivityLog({ data }) {
  const log = [...(data.activityLog || [])].reverse();
  const fmt = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };
  const actionColor = a => a.includes("מחק") ? "#e74c3c" : a.includes("הוסיף") ? "#2ecc71" : a.includes("תכנן") ? "#3d7fc4" : "#4a9eff";
  if (!log.length) return <div style={{ textAlign: "center", padding: "48px 24px", opacity: .4 }}><div style={{ fontSize: 32, marginBottom: 8 }}>📋</div><div style={{ fontSize: 14, color: "#8892b0" }}>אין פעילות מתועדת עדיין</div></div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: "#556", marginBottom: 6 }}>{log.length} רשומות · המוצגות מהאחרונה לראשונה</div>
      {log.map((e, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRight: `3px solid ${actionColor(e.action)}`, borderRadius: 9 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#ccd6f6" }}>{e.manager}</span>
              <span style={{ fontSize: 11, color: actionColor(e.action), fontWeight: 600 }}>{e.action}</span>
            </div>
            {e.detail && <div style={{ fontSize: 11, color: "#8892b0" }}>{e.detail}</div>}
          </div>
          <div style={{ fontSize: 10, color: "#445", whiteSpace: "nowrap", marginTop: 2 }}>{fmt(e.ts)}</div>
        </div>
      ))}
    </div>
  );
}
function SectionsEditor({ data, save, toast, onSyncAnnual }) {
  const sections = getSections(data);
  const [vals,       setVals]       = useState(() => Object.fromEntries(sections.map(s => [s.name, ""])));
  const [newSecName, setNewSecName] = useState("");

  // Save weekly assignments + sync annual plan sections
  const saveAndSync = (newSections, msg) => {
    save({ ...data, sections: newSections }, msg);
    onSyncAnnual?.(newSections);
  };

  const addPerson = (secName) => {
    const val = (vals[secName] || "").trim();
    if (!val) return;
    if (getAllPeople(data).includes(val)) { toast("שם כבר קיים", "error"); return; }
    const newSections = sections.map(s => s.name === secName ? { ...s, people: [...s.people, val] } : s);
    saveAndSync(newSections, `${val} נוסף/ה ל${secName}`);
    setVals(v => ({ ...v, [secName]: "" }));
  };

  const removePerson = (secName, person) => {
    const newSections = sections.map(s => s.name === secName ? { ...s, people: s.people.filter(p => p !== person) } : s);
    saveAndSync(newSections, `${person} הוסר/ה`);
  };

  const movePerson = (person, fromSec, toSec) => {
    if (fromSec === toSec) return;
    const newSections = sections.map(s => {
      if (s.name === fromSec) return { ...s, people: s.people.filter(p => p !== person) };
      if (s.name === toSec)   return { ...s, people: [...s.people, person] };
      return s;
    });
    saveAndSync(newSections, `${person} הועבר/ה ל${toSec}`);
  };

  const addSection = () => {
    const name = newSecName.trim();
    if (!name) return;
    if (sections.some(s => s.name === name)) { toast("מדור כבר קיים", "error"); return; }
    const newSections = [...sections, { name, people: [] }];
    saveAndSync(newSections, `מדור "${name}" נוסף`);
    setNewSecName("");
    setVals(v => ({ ...v, [name]: "" }));
  };

  const removeSection = (secName) => {
    const sec = sections.find(s => s.name === secName);
    if (sec?.people.length > 0) { toast("העבר את כל האנשים לפני מחיקת המדור", "error"); return; }
    saveAndSync(sections.filter(s => s.name !== secName), `מדור "${secName}" נמחק`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {sections.map((sec, si) => {
        const c = secPal(data, sec.name, si);
        return (
          <div key={sec.name} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${c.accent}22`, borderRadius: 12, padding: "14px 16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: c.accent }}>{sec.name}</span>
              <span style={{ fontSize: 11, color: "#556", marginRight: "auto" }}>{sec.people.length} אנשים</span>
              <button onClick={() => removeSection(sec.name)} title="מחק מדור (רק אם ריק)"
                style={{ background: "none", border: "none", color: "#445", cursor: "pointer", opacity: .5, padding: 2, display: "flex", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".5"}>
                <I n="trash" s={13} />
              </button>
            </div>
            {/* Add person */}
            <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
              <input value={vals[sec.name] || ""} onChange={e => setVals(v => ({ ...v, [sec.name]: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPerson(sec.name)} placeholder="שם מלא" style={inp} />
              <PillBtn onClick={() => addPerson(sec.name)} color={c.accent}>הוסף</PillBtn>
            </div>
            {/* People list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sec.people.map(person => (
                <div key={person} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRight: `3px solid ${c.accent}`, borderRadius: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
                  <span style={{ fontSize: 13, flex: 1 }}>{person}</span>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {/* Move to another section */}
                    {sections.length > 1 && (
                      <select onChange={e => { if (e.target.value) movePerson(person, sec.name, e.target.value); e.target.value = ""; }}
                        defaultValue=""
                        style={{ ...inp, padding: "3px 6px", fontSize: 10, width: "auto", cursor: "pointer", color: "#8892b0" }}>
                        <option value="">העבר ל…</option>
                        {sections.filter(s => s.name !== sec.name).map(s => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => removePerson(sec.name, person)}
                      style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", opacity: .7 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".7"}>
                      <I n="trash" s={14} />
                    </button>
                  </div>
                </div>
              ))}
              {sec.people.length === 0 && <div style={{ fontSize: 12, color: "#445", fontStyle: "italic", padding: "4px 2px" }}>אין אנשים במדור זה</div>}
            </div>
          </div>
        );
      })}

      {/* Add new section */}
      <div style={{ border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, color: "#8892b0", fontWeight: 600, marginBottom: 10 }}>➕ הוסף מדור חדש</div>
        <div style={{ display: "flex", gap: 7 }}>
          <input value={newSecName} onChange={e => setNewSecName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addSection()}
            placeholder="שם המדור החדש" style={inp} />
          <PillBtn onClick={addSection} color="#4a9eff">+ מדור</PillBtn>
        </div>
      </div>
    </div>
  );
}

function SystemsEditor({ data, save, toast, vSys, setVSys }) {
  const [colorPick, setColorPick] = useState(null);
  const [dragIdx, setDragIdx]     = useState(null);
  const [overIdx, setOverIdx]     = useState(null);
  const sysColors  = data.systemColors  || {};
  const sysOwners  = data.systemOwners  || {};
  const allPeople  = getAllPeople(data);

  const setColor = (sys, idx) => { save({ ...data, systemColors: { ...sysColors, [sys]: idx } }); setColorPick(null); };
  const setOwner = (sys, name) => {
    const owners = { ...sysOwners };
    if (name) owners[sys] = name; else delete owners[sys];
    save({ ...data, systemOwners: owners }, name ? `${name} הוגדר/ה כאחראי ${sys}` : `אחראי ${sys} הוסר`);
  };

  const drop = (toIdx) => {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setOverIdx(null); return; }
    const arr = [...data.systems];
    const [item] = arr.splice(dragIdx, 1);
    arr.splice(toIdx, 0, item);
    save({ ...data, systems: arr }, "סדר מערכות עודכן");
    setDragIdx(null); setOverIdx(null);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 13 }}>
        <input value={vSys} onChange={e => setVSys(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (!vSys.trim() || data.systems.includes(vSys.trim())) { toast("שם כבר קיים", "error"); return; } save({ ...data, systems: [...data.systems, vSys.trim()] }, "מערכת נוספה"); setVSys(""); })()} placeholder="שם המערכת החדשה" style={inp} />
        <PillBtn onClick={() => { if (!vSys.trim() || data.systems.includes(vSys.trim())) { toast("שם כבר קיים", "error"); return; } save({ ...data, systems: [...data.systems, vSys.trim()] }, "מערכת נוספה"); setVSys(""); }} color="#4a9eff">הוסף</PillBtn>
      </div>
      <div style={{ fontSize: 10, color: "#445", marginBottom: 8, textAlign: "center" }}>⠿ גרור שורה לשינוי סדר</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.systems.map((sys, i) => {
          const idx = sysColors[sys] ?? i;
          const col = pal(idx);
          const open = colorPick === sys;
          const isDragging = dragIdx === i;
          const isOver = overIdx === i;
          return (
            <div key={sys}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => { e.preventDefault(); setOverIdx(i); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={() => drop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity .15s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", background: isOver ? "rgba(74,158,255,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${isOver ? "rgba(74,158,255,0.4)" : "rgba(255,255,255,0.07)"}`, borderRight: `3px solid ${col.accent}`, borderRadius: open ? "9px 9px 0 0" : 9, cursor: "grab", transition: "background .1s,border .1s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#445", fontSize: 16, cursor: "grab", userSelect: "none" }}>⠿</span>
                  <span style={{ fontSize: 13 }}>{sys}</span>
                  {sysOwners[sys] && <span style={{ fontSize: 10, color: col.accent, background: `${col.accent}18`, border: `1px solid ${col.accent}44`, borderRadius: 10, padding: "1px 7px" }}>🔔 {sysOwners[sys].split(" ")[0]}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={e => { e.stopPropagation(); setColorPick(open ? null : sys); }} title="בחר צבע"
                    style={{ width: 22, height: 22, borderRadius: "50%", background: col.accent, border: `2px solid ${open ? "#fff" : "transparent"}`, cursor: "pointer", flexShrink: 0, transition: "border .15s" }} />
                  <button onClick={e => { e.stopPropagation(); save({ ...data, systems: data.systems.filter(s => s !== sys) }, "מערכת הוסרה"); }}
                    style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", opacity: .7 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".7"}><I n="trash" s={14} /></button>
                </div>
              </div>
              {open && (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 9px 9px", padding: "10px 13px" }}>
                  {/* Color picker */}
                  <div style={{ fontSize: 10, color: "#8892b0", marginBottom: 6 }}>צבע מערכת:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {PALETTE.map((p, pi) => (
                    <button key={pi} onClick={() => setColor(sys, pi)} title={`צבע ${pi + 1}`}
                      style={{ width: 30, height: 30, borderRadius: "50%", background: p.accent, border: `3px solid ${idx === pi ? "#fff" : "transparent"}`, cursor: "pointer", transition: "border .15s", boxShadow: idx === pi ? `0 0 0 2px ${p.accent}` : "none" }} />
                  ))}
                  </div>
                  {/* System owner */}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, color: "#8892b0", marginBottom: 6 }}>
                      אחראי מערכת <span style={{ color: "#445" }}>(יקבל התראה על כל שינוי)</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button onClick={() => setOwner(sys, null)}
                        style={{ padding: "5px 11px", borderRadius: 16, border: `1px solid ${!sysOwners[sys] ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}`, background: !sysOwners[sys] ? "rgba(255,255,255,0.1)" : "transparent", color: !sysOwners[sys] ? "#fff" : "#556", fontSize: 11, cursor: "pointer", fontWeight: !sysOwners[sys] ? 700 : 400 }}>
                        ללא
                      </button>
                      {allPeople.map(p => {
                        const isSel = sysOwners[sys] === p;
                        return (
                          <button key={p} onClick={() => setOwner(sys, p)}
                            style={{ padding: "5px 11px", borderRadius: 16, border: `1px solid ${isSel ? col.accent : "rgba(255,255,255,0.1)"}`, background: isSel ? `${col.accent}22` : "transparent", color: isSel ? col.accent : "#8892b0", fontSize: 11, cursor: "pointer", fontWeight: isSel ? 700 : 400 }}>
                            {isSel ? "✓ " : ""}{p}
                          </button>
                        );
                      })}
                    </div>
                    {sysOwners[sys] && (
                      <div style={{ marginTop: 7, fontSize: 10, color: col.accent, fontWeight: 600 }}>
                        🔔 אחראי: {sysOwners[sys]}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListEditor({ items, val, setVal, ph, color, onAdd, onRemove }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 13 }}>
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} placeholder={ph} style={inp} />
        <PillBtn onClick={onAdd} color={color}>הוסף</PillBtn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRight: `3px solid ${pal(i).accent}`, borderRadius: 9 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
            <span style={{ fontSize: 13 }}>{item}</span>
            <button onClick={() => onRemove(item)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", opacity: .7 }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".7"}><I n="trash" s={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── PLANNER VIEW ── */
const PLAN_COLS = [
  { key: "sun", label: "ראשון", short: "א׳", days: ["sun"] },
  { key: "mon", label: "שני",   short: "ב׳", days: ["mon"] },
  { key: "tue", label: "שלישי", short: "ג׳", days: ["tue"] },
  { key: "wed", label: "רביעי", short: "ד׳", days: ["wed"] },
  { key: "thu", label: "חמישי", short: "ה׳", days: ["thu"] },
  { key: "fri", label: "שישי",  short: "ו׳", days: ["fri"], narrow: true },
  { key: "sat", label: "שבת",   short: "ש׳", days: ["sat"], narrow: true },
];

function PlannerView({ wk, data, sysMap, weekA, annualData, onClose, onSave }) {
  const mob = useContext(MobileCtx);

  const [planWk, setPlanWk] = useState(wk);
  const planWeekA = data.assignments.filter(a => a.week === planWk);

  const buildGrid = (pwa) => {
    const g = {};
    pwa.forEach(a => {
      const assignees = a.assignees || [];
      if (!assignees.length) return;
      const days = a.days?.length ? a.days : PLAN_COLS.map(c => c.key);
      days.forEach(day => {
        const col = PLAN_COLS.find(c => c.key === day);
        if (!col) return;
        const k = `${a.system}__${day}`;
        g[k] = [...new Set([...(g[k] || []), ...assignees])];
      });
    });
    return g;
  };
  const buildTasks = (pwa) => {
    const t = {};
    pwa.forEach(a => {
      if (!a.tasks?.length) return;
      const days = a.days?.length ? a.days : PLAN_COLS.map(c => c.key);
      days.forEach(day => {
        if (!PLAN_COLS.find(c => c.key === day)) return;
        const k = `${a.system}__${day}`;
        if (!t[k]) t[k] = a.tasks.join(" | ");
      });
    });
    return t;
  };

  const [grid, setGrid]           = useState(() => buildGrid(planWeekA));
  const [cellTasks, setCellTasks] = useState(() => buildTasks(planWeekA));
  const [activeCell, setActiveCell] = useState(null);
  const [dragging, setDragging]   = useState(null);
  const [selected, setSelected]   = useState(null);
  const [dragOver, setDragOver]   = useState(null);
  const [activeSec, setActiveSec] = useState(0);   // mobile section tab index
  const taskInputRef = useRef();

  const goWeek = (delta) => {
    const next = adjW(planWk, delta);
    const nextA = data.assignments.filter(a => a.week === next);
    setPlanWk(next);
    setGrid(buildGrid(nextA));
    setCellTasks(buildTasks(nextA));
    setActiveCell(null);
    setSelected(null);
  };

  const [conflict, setConflict] = useState(null); // { sys, col, person, code, label, iso }

  const ck      = (sys, col) => `${sys}__${col}`;
  const doAdd   = (sys, col, p) => setGrid(g => { const k = ck(sys,col); return { ...g, [k]: [...new Set([...(g[k]||[]),p])] }; });
  const rem     = (sys, col, p) => setGrid(g => { const k = ck(sys,col); return { ...g, [k]: (g[k]||[]).filter(x=>x!==p) }; });

  const add = (sys, col, p) => {
    // Check annual plan availability for that specific day
    const iso  = wkDayToDate(planWk, col);
    const code = iso ? (annualData?.days?.[iso]?.statuses?.[p] || "") : "";
    if (code && UNAVAILABLE_CODES.has(code)) {
      const st = statusStyle(code);
      setConflict({ sys, col, person: p, code, label: st?.label || code, iso });
      return;
    }
    doAdd(sys, col, p);
  };

  const activateCell = (k) => {
    setActiveCell(k);
    setTimeout(() => taskInputRef.current?.focus(), 50);
  };

  const handleCellClick = (sys, col) => {
    const k = ck(sys, col);
    if (selected) { add(sys, col, selected); return; }
    if (activeCell === k) { setActiveCell(null); return; }
    activateCell(k);
  };

  const handleSave = () => {
    const otherWeeks = data.assignments.filter(a => a.week !== planWk);
    const newA = [];
    data.systems.forEach(sys => {
      PLAN_COLS.forEach(c => {
        const k = ck(sys, c.key);
        const people = grid[k] || [];
        if (!people.length) return;
        const taskStr = (cellTasks[k] || "").trim();
        const tasks = taskStr ? taskStr.split("|").map(t => t.trim()).filter(Boolean) : [];
        const existing = planWeekA.find(a => a.system === sys && c.days.some(d => (a.days||[]).includes(d)));
        newA.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), week: planWk, system: sys, days: c.days, assignees: people, tasks, notes: existing?.notes || "" });
      });
    });
    onSave([...otherWeeks, ...newA], planWk);
  };

  const hintText = selected
    ? `✓ נבחר: ${selected} — לחץ על תא לשיבוץ`
    : activeCell
    ? "כתוב משימה בתיבה הפתוחה • גרור/לחץ שמות מלמטה"
    : (mob ? "לחץ תא → כתוב משימה → בחר אנשים מלמטה" : "לחץ תא → כתוב משימה → גרור אנשים לתוכו");

  return (
    <div dir="rtl" style={{ position: "fixed", inset: 0, background: "#080c18", zIndex: 400, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI','Arial Hebrew',Arial,sans-serif", color: "#dde2f0" }}>

      {/* ── Conflict warning overlay ── */}
      {conflict && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(4px)" }}>
          <div dir="rtl" style={{ background: "#0f1525", border: "1px solid rgba(231,76,60,0.4)", borderRadius: 18, padding: "26px 24px", maxWidth: 380, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", textAlign: "center", marginBottom: 6 }}>עובד לא זמין</div>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, color: "#4a9eff" }}>{conflict.person}</span>
              <span style={{ color: "#8892b0" }}> מסומן/ת כ</span>
              <span style={{ display: "inline-block", background: statusStyle(conflict.code)?.bg || "#e74c3c", color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 700, margin: "0 4px" }}>{conflict.label}</span>
              <div style={{ fontSize: 12, color: "#556", marginTop: 6 }}>{conflict.iso}</div>
            </div>
            <div style={{ fontSize: 13, color: "#8892b0", textAlign: "center", marginBottom: 20 }}>האם לשבץ בכל זאת?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { doAdd(conflict.sys, conflict.col, conflict.person); setConflict(null); }}
                style={{ flex: 1, padding: "11px", background: "rgba(231,76,60,0.15)", border: "1px solid rgba(231,76,60,0.4)", borderRadius: 10, color: "#e74c3c", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                שבץ בכל זאת
              </button>
              <button onClick={() => setConflict(null)}
                style={{ flex: 1, padding: "11px", background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#0f1525", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 8 }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "7px 12px", color: "#8892b0", cursor: "pointer", fontSize: 13 }}>✕ סגור</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
          <NavBtn onClick={() => goWeek(-1)}><I n="cL" s={15} /></NavBtn>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>שבוע {planWk.split("-W")[1]}</div>
            <div style={{ fontSize: 13, color: "#ccd6f6", fontWeight: 600, marginTop: 1 }}>{wLabel(planWk)}</div>
          </div>
          <NavBtn onClick={() => goWeek(1)}><I n="cR" s={15} /></NavBtn>
        </div>
        <button onClick={handleSave} style={{ background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", border: "none", borderRadius: 9, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 3px 12px rgba(74,158,255,0.3)" }}>שמור ✓</button>
      </div>

      {/* Hint bar */}
      <div style={{ background: "rgba(61,127,196,0.08)", borderBottom: "1px solid rgba(61,127,196,0.15)", padding: "5px 14px", fontSize: 11, color: "#3d7fc4", textAlign: "center", flexShrink: 0 }}>{hintText}</div>

      {/* ═══ MOBILE LAYOUT ═══ */}
      {mob ? (
        <>
          {/* System cards — scrollable */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
            {data.systems.map(sys => {
              const col = sysMap[sys] || pal(0);
              return (
                <div key={sys} style={{ background: `linear-gradient(135deg,${col.dark},rgba(10,14,28,0.95))`, border: `2px solid ${col.accent}55`, borderRadius: 14, padding: "12px 14px", boxShadow: `0 2px 12px ${col.accent}18` }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: col.accent, marginBottom: 10, letterSpacing: .3 }}>{sys}</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {PLAN_COLS.map(c => {
                      const k = ck(sys, c.key);
                      const people = grid[k] || [];
                      const task = cellTasks[k] || "";
                      const isActive = activeCell === k;
                      const hasContent = people.length > 0 || task;
                      return (
                        <div key={c.key} onClick={() => handleCellClick(sys, c.key)}
                          style={{ flex: 1, minWidth: 0, padding: "7px 4px", borderRadius: 9, textAlign: "center", cursor: "pointer", transition: "all .12s",
                            border: `2px solid ${isActive ? col.accent : hasContent ? col.accent + "66" : "rgba(255,255,255,0.1)"}`,
                            background: isActive ? `${col.accent}28` : hasContent ? `${col.accent}12` : "rgba(255,255,255,0.03)",
                            boxShadow: isActive ? `0 0 0 2px ${col.accent}33` : "none" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? col.accent : hasContent ? col.accent : "#8892b0", marginBottom: 3 }}>{c.short}</div>
                          {task && <div style={{ fontSize: 10, color: col.accent, marginBottom: 2 }}>✓</div>}
                          {people.slice(0, 3).map(p => (
                            <div key={p} style={{ fontSize: 10, color: col.accent, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "1px 2px" }}>{p.split(" ")[0]}</div>
                          ))}
                          {people.length > 3 && <div style={{ fontSize: 9, color: col.accent, fontWeight: 700 }}>+{people.length - 3}</div>}
                          {!hasContent && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>—</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom panel */}
          <div style={{ flexShrink: 0, borderTop: "2px solid rgba(255,255,255,0.12)", background: "#0a0f1e" }}>

            {/* Active cell: assigned people + task input */}
            {activeCell && (() => {
              const parts = activeCell.split("__");
              const aSys = parts[0], aDay = parts[1];
              const col = sysMap[aSys] || pal(0);
              const people = grid[activeCell] || [];
              const task = cellTasks[activeCell] || "";
              const dayLabel = PLAN_COLS.find(c => c.key === aDay)?.label || aDay;
              return (
                <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: `${col.accent}0e` }}>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: col.accent }}>{aSys} — {dayLabel}</span>
                    {people.map(p => (
                      <div key={p} style={{ display: "flex", alignItems: "center", gap: 4, background: `${col.accent}28`, border: `1px solid ${col.accent}66`, borderRadius: 14, padding: "4px 10px" }}>
                        <span style={{ fontSize: 13, color: col.accent, fontWeight: 600 }}>{p}</span>
                        <button onClick={e => { e.stopPropagation(); rem(aSys, aDay, p); }} style={{ background: "none", border: "none", color: col.accent, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                  <input ref={taskInputRef} value={task} onChange={e => setCellTasks(t => ({ ...t, [activeCell]: e.target.value }))}
                    placeholder="כתוב משימה..."
                    style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: `1px solid ${col.accent}55`, borderRadius: 9, color: "#fff", fontSize: 14, padding: "9px 12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              );
            })()}

            {/* Section tabs */}
            {(() => {
              const nonEmpty = getSections(data).filter(s => s.people.length > 0);
              return (
                <>
                  <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {nonEmpty.map((sec, ti) => {
                      const sc = secPal(data, sec.name, getSections(data).indexOf(sec));
                      const isSel = activeSec === ti;
                      return (
                        <button key={sec.name} onClick={() => setActiveSec(ti)}
                          style={{ flex: 1, padding: "10px 4px", background: isSel ? `${sc.accent}18` : "transparent", border: "none", borderTop: `3px solid ${isSel ? sc.accent : "transparent"}`, color: isSel ? sc.accent : "#667", fontSize: 12, fontWeight: isSel ? 700 : 400, cursor: "pointer", lineHeight: 1.3 }}>
                          {sec.name.replace("מדור ", "")}
                        </button>
                      );
                    })}
                  </div>

                  {/* People chips */}
                  {(() => {
                    const sec = nonEmpty[activeSec] || nonEmpty[0];
                    if (!sec) return null;
                    const sc = secPal(data, sec.name, getSections(data).indexOf(sec));
                    const [aSys, aDay] = activeCell ? activeCell.split("__") : [null, null];
                    return (
                      <div style={{ padding: "12px 12px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {sec.people.map(p => {
                          const inCell = activeCell ? (grid[activeCell] || []).includes(p) : false;
                          const activeDayIso = aDay ? wkDayToDate(planWk, aDay) : null;
                          const annualStatus = activeDayIso ? (annualData?.days?.[activeDayIso]?.statuses?.[p] || '') : '';
                          const annSt = statusStyle(annualStatus);
                          const isUnavail = UNAVAILABLE_CODES.has(annualStatus);
                          return (
                            <div key={p}
                              onClick={() => { if (!activeCell) return; inCell ? rem(aSys, aDay, p) : add(aSys, aDay, p); }}
                              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", border: `2px solid ${inCell ? sc.accent : isUnavail ? "#e74c3c77" : sc.accent + "44"}`, borderRadius: 24, background: inCell ? `${sc.accent}33` : isUnavail ? "rgba(231,76,60,0.08)" : "rgba(255,255,255,0.05)", color: inCell ? sc.accent : activeCell ? "#ccd6f6" : "#778", fontSize: 15, fontWeight: inCell ? 700 : 500, cursor: activeCell ? "pointer" : "default", userSelect: "none", transition: "all .12s", opacity: isUnavail && !inCell ? 0.65 : 1 }}>
                              {inCell && <span style={{ fontSize: 13 }}>✓</span>}
                              {p}
                              {annualStatus && <span style={{ background: annSt?.bg || '#333', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700 }}>{annualStatus}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        </>
      ) : (
        /* ═══ DESKTOP LAYOUT ═══ */
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}
          onClick={e => { if (e.target === e.currentTarget) { setActiveCell(null); setSelected(null); } }}>

          {/* Desktop sidebar */}
          <div style={{ width: 230, flexShrink: 0, overflowY: "auto", borderLeft: "2px solid rgba(255,255,255,0.08)", background: "#090e1c", padding: "16px 14px" }}>
            <div style={{ fontSize: 11, color: "#556", fontWeight: 700, letterSpacing: .5, marginBottom: 14, textTransform: "uppercase" }}>
              {selected ? `✓ ${selected}` : "⠿ גרור שם לתא"}
            </div>
            {getSections(data).map((sec, si) => { const sc = secPal(data, sec.name, si); return sec.people.length === 0 ? null : (
              <div key={sec.name} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: sc.accent, fontWeight: 700, marginBottom: 8, borderBottom: `2px solid ${sc.accent}44`, paddingBottom: 5 }}>{sec.name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {sec.people.map(p => {
                    const isSel = selected === p;
                    const weekDots = PLAN_COLS.filter(c => !c.narrow).map(c => {
                      const iso = wkDayToDate(planWk, c.key);
                      const code = iso ? (annualData?.days?.[iso]?.statuses?.[p] || '') : '';
                      const st = statusStyle(code);
                      return { key: c.key, short: c.short, code, st };
                    });
                    const hasAnnual = weekDots.some(d => d.code);
                    return (
                      <div key={p} draggable
                        onDragStart={() => { setDragging(p); setSelected(null); }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(isSel ? null : p)}
                        style={{ padding: "8px 12px", border: `2px solid ${isSel ? sc.accent : sc.accent + "33"}`, borderRadius: 9, background: isSel ? `${sc.accent}28` : "rgba(255,255,255,0.04)", color: isSel ? sc.accent : "#aab0c0", fontSize: 13, cursor: "grab", fontWeight: isSel ? 700 : 400, userSelect: "none", boxShadow: isSel ? `0 0 0 2px ${sc.accent}33` : "none", transition: "all .12s", opacity: dragging === p ? .35 : 1 }}>
                        <div>{isSel ? "✓ " : "⠿ "}{p}</div>
                        {hasAnnual && (
                          <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
                            {weekDots.map(d => (
                              <span key={d.key} title={`${d.short}: ${d.code || 'זמין'}`}
                                style={{ width: 22, height: 14, borderRadius: 3, background: d.st?.bg || 'rgba(255,255,255,0.08)', fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                {d.code ? d.code.slice(0,2) : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ); })}
          </div>

          {/* Desktop grid */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "14px 14px 8px" }}
            onClick={e => { if (e.target === e.currentTarget) { setActiveCell(null); setSelected(null); } }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 5, minWidth: 680, margin: "0 auto" }}>
              <thead>
                <tr>
                  <th style={{ ...PTH, textAlign: "right", paddingRight: 14, width: 130 }}>מערכת</th>
                  {PLAN_COLS.map(c => {
                    const iso = wkDayToDate(planWk, c.key);
                    const dayNum = iso ? new Date(iso + "T00:00:00").getDate() : null;
                    return (
                      <th key={c.key} style={{ ...PTH, background: c.narrow ? "rgba(61,127,196,0.18)" : "rgba(74,158,255,0.1)", color: c.narrow ? "#5b9fd4" : "#6ab0ff", minWidth: c.narrow ? 66 : 130, width: c.narrow ? 66 : undefined }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{c.narrow ? c.short : c.label}</div>
                        {dayNum && <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>{dayNum}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.systems.map(sys => {
                  const col = sysMap[sys] || pal(0);
                  return (
                    <tr key={sys}>
                      <td style={{ ...PTD, background: `linear-gradient(135deg,${col.dark},rgba(8,12,24,0.9))`, borderRight: `4px solid ${col.accent}`, fontWeight: 700, fontSize: 13, color: col.accent, maxWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sys}</td>
                      {PLAN_COLS.map(c => {
                        const k = ck(sys, c.key);
                        const people = grid[k] || [];
                        const task = cellTasks[k] || "";
                        const isActive = activeCell === k;
                        const isOver = dragOver === k;
                        const hasContent = people.length > 0 || task;
                        return (
                          <td key={c.key}
                            onDragOver={e => { e.preventDefault(); setDragOver(k); }}
                            onDragLeave={() => { if (dragOver === k) setDragOver(null); }}
                            onDrop={e => { e.preventDefault(); if (dragging) { add(sys, c.key, dragging); setDragging(null); setDragOver(null); if (!activeCell) activateCell(k); } }}
                            onClick={() => handleCellClick(sys, c.key)}
                            style={{ ...PTD,
                              background: isActive ? `${col.accent}22` : isOver ? `${col.accent}33` : (hasContent ? `${col.accent}0d` : (c.narrow ? "rgba(61,127,196,0.06)" : "rgba(255,255,255,0.02)")),
                              border: `2px solid ${isActive ? col.accent : isOver ? col.accent + "99" : (hasContent ? col.accent + "44" : "rgba(255,255,255,0.09)")}`,
                              verticalAlign: "top", cursor: selected ? "copy" : "pointer", minHeight: 56,
                              width: c.narrow ? 66 : undefined, transition: "background .1s,border .1s",
                              boxShadow: isActive ? `0 0 0 2px ${col.accent}44 inset` : isOver ? `0 0 0 1px ${col.accent}55 inset` : "none" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {isActive
                                ? <input ref={taskInputRef} value={task} onChange={e => setCellTasks(t => ({ ...t, [k]: e.target.value }))}
                                    onClick={e => { if (!selected) e.stopPropagation(); }}
                                    placeholder="כתוב משימה..."
                                    style={{ width: "100%", background: "rgba(255,255,255,0.09)", border: `1px solid ${col.accent}66`, borderRadius: 6, color: "#fff", fontSize: 13, padding: "6px 8px", outline: "none", fontFamily: "inherit" }} />
                                : task
                                  ? <div style={{ fontSize: 13, color: col.accent, fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>✓ {task.length > 38 ? task.slice(0,36)+"…" : task}</div>
                                  : null
                              }
                              {people.map(p => (
                                <div key={p} onClick={e => { if (!selected) e.stopPropagation(); }}
                                  style={{ display: "flex", alignItems: "center", gap: 4, background: `${col.accent}22`, border: `1px solid ${col.accent}55`, borderRadius: 6, padding: "5px 8px" }}>
                                  <span style={{ fontSize: 12, color: col.accent, fontWeight: 600, flex: 1, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                                  <button onClick={e => { e.stopPropagation(); rem(sys, c.key, p); }} style={{ background: "none", border: "none", color: col.accent, cursor: "pointer", fontSize: 15, padding: "0 2px", lineHeight: 1, opacity: .6, flexShrink: 0 }}>×</button>
                                </div>
                              ))}
                              {!hasContent && !isActive && (
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", textAlign: "center", padding: "6px 0" }}>—</div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
const PTH = { padding: "11px 8px", textAlign: "center", borderRadius: 7, fontWeight: 700, background: "rgba(255,255,255,0.06)", color: "#8892b0", border: "1px solid rgba(255,255,255,0.08)" };
const PTD = { padding: "8px 7px", borderRadius: 8, fontSize: 13 };

/* ── ASSIGN DETAIL MODAL ── */
function AssignDetailModal({ a, sysMap, mgr, onClose, onEdit, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const col = sysMap[a.system] || pal(0);
  const days = a.days && a.days.length > 0 ? DAYS.filter(d => a.days.includes(d.key)).map(d => d.long) : DAYS.map(d => d.long);
  return (
    <Overlay onClose={onClose}>
      <div style={{ background: "#0f1525", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,.8)" }}>
        <div style={{ background: `linear-gradient(135deg,${col.dark},#0f1525)`, borderBottom: `3px solid ${col.accent}`, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: col.accent }}>{a.system}</div>
            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 3 }}>שבוע {a.week?.split("-W")[1]}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8892b0" }}><I n="x" s={16} /></button>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "65dvh", overflowY: "auto" }}>
          <div>
            <div style={{ fontSize: 10, color: "#8892b0", fontWeight: 700, letterSpacing: .7, marginBottom: 7, textTransform: "uppercase" }}>ימי פעילות</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {days.map(d => <span key={d} style={{ background: `${col.accent}22`, color: col.accent, border: `1px solid ${col.accent}44`, borderRadius: 20, padding: "4px 11px", fontSize: 12, fontWeight: 600 }}>{d}</span>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8892b0", fontWeight: 700, letterSpacing: .7, marginBottom: 7, textTransform: "uppercase" }}>משובצים ({(a.assignees || []).length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {(a.assignees || []).map(p => <Chip key={p} label={p} color={col.accent} />)}
              {!(a.assignees || []).length && <span style={{ fontSize: 12, color: "#556", fontStyle: "italic" }}>אין אנשים</span>}
            </div>
          </div>
          {(a.tasks || []).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#8892b0", fontWeight: 700, letterSpacing: .7, marginBottom: 7, textTransform: "uppercase" }}>משימות ({a.tasks.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {a.tasks.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8, borderRight: `3px solid ${col.accent}` }}>
                    <span style={{ color: col.accent, flexShrink: 0, marginTop: 2 }}><I n="check" s={12} /></span>
                    <span style={{ fontSize: 13, color: "#c8d0e4", lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {a.notes && (
            <div>
              <div style={{ fontSize: 10, color: "#8892b0", fontWeight: 700, letterSpacing: .7, marginBottom: 7, textTransform: "uppercase" }}>הערות</div>
              <div style={{ padding: "10px 13px", background: "rgba(255,255,255,0.04)", borderRadius: 9, borderRight: `3px solid ${col.accent}55`, fontSize: 13, color: "#a0aabb", lineHeight: 1.6 }}>{a.notes}</div>
            </div>
          )}
          {!(a.tasks || []).length && !a.notes && <div style={{ fontSize: 12, color: "#445", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>אין משימות או הערות לשיבוץ זה</div>}
        </div>
        {mgr && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
            {confirmDel
              ? <>
                  <span style={{ fontSize: 13, color: "#e74c3c", display: "flex", alignItems: "center", flex: 1 }}>למחוק את השיבוץ?</span>
                  <PillBtn onClick={onDelete} color="#e74c3c" small>מחק</PillBtn>
                  <PillBtn ghost onClick={() => setConfirmDel(false)} small>ביטול</PillBtn>
                </>
              : <>
                  <PillBtn onClick={onEdit} color={col.accent} small><I n="edit" s={13} />עריכה</PillBtn>
                  <PillBtn ghost onClick={() => setConfirmDel(true)} small><I n="trash" s={13} />מחיקה</PillBtn>
                </>
            }
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ── ASSIGN MODAL ── */
function AssignModal({ mode, a, wk, data, sysMap, onClose, onSave }) {
  const mob = useContext(MobileCtx);
  const [form, setForm] = useState(() => a
    ? { ...a, tasks: [...(a.tasks || [])], days: [...(a.days || ALL_DAYS)], assignees: [...(a.assignees || [])] }
    : { week: wk, system: data.systems[0] || "", assignees: [], tasks: [], days: [], notes: "" });
  const [task, setTask] = useState("");
  const taskRef = useRef();
  const toggleP = p => setForm(f => ({ ...f, assignees: f.assignees.includes(p) ? f.assignees.filter(x => x !== p) : [...f.assignees, p] }));
  const toggleD = k => setForm(f => ({ ...f, days: f.days.includes(k) ? f.days.filter(x => x !== k) : [...f.days, k] }));
  const addTask = () => { if (!task.trim()) return; setForm(f => ({ ...f, tasks: [...f.tasks, task.trim()] })); setTask(""); taskRef.current?.focus(); };
  const col = sysMap[form.system] || pal(0);
  return (
    <Overlay onClose={onClose} wide>
      <div style={{ background: "#0f1525", border: mob ? "none" : "1px solid rgba(255,255,255,0.1)", borderRadius: mob ? "20px 20px 0 0" : 18, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,.8)" }}>
        {mob && <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "10px auto 0" }} />}
        <div style={{ background: `linear-gradient(135deg,${col.dark},#0f1525)`, borderBottom: `1px solid ${col.accent}33`, padding: mob ? "14px 18px" : "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: mob ? 15 : 16, color: "#fff" }}>{mode === "add" ? "שיבוץ חדש" : "עריכת שיבוץ"}</div>
            <div style={{ fontSize: 11, color: col.accent, marginTop: 2 }}>{form.system || "בחר מערכת"}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8892b0" }}><I n="x" s={16} /></button>
        </div>
        <div style={{ padding: mob ? "14px 16px" : "18px 22px", maxHeight: mob ? "65dvh" : "62vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={lbl}>מערכת</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.systems.map(s => { const c = sysMap[s] || pal(0); const sel = form.system === s; return (
                <button key={s} onClick={() => setForm(f => ({ ...f, system: s }))} style={{ padding: "7px 14px", border: `2px solid ${sel ? c.accent : "rgba(255,255,255,0.1)"}`, borderRadius: 10, background: sel ? c.dark : "rgba(255,255,255,0.04)", color: sel ? c.accent : "#8892b0", fontSize: 13, cursor: "pointer", fontWeight: sel ? 700 : 400 }}>{s}</button>
              ); })}
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>ימי פעילות</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setForm(f => ({ ...f, days: [...ALL_DAYS] }))} style={{ fontSize: 10, background: "none", border: "none", color: "#4a9eff", cursor: "pointer", fontWeight: 600 }}>בחר הכל</button>
                <button onClick={() => setForm(f => ({ ...f, days: [] }))} style={{ fontSize: 10, background: "none", border: "none", color: "#8892b0", cursor: "pointer" }}>נקה</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {DAYS.map(d => { const sel = form.days.includes(d.key); return (
                <button key={d.key} onClick={() => toggleD(d.key)} style={{ flex: 1, padding: "8px 0", border: `1px solid ${sel ? col.accent : "rgba(255,255,255,0.1)"}`, borderRadius: 9, background: sel ? `${col.accent}22` : "rgba(255,255,255,0.04)", color: sel ? col.accent : "#8892b0", fontSize: 12, cursor: "pointer", fontWeight: sel ? 700 : 400, textAlign: "center" }}>
                  {d.short}<div style={{ fontSize: 9, marginTop: 2, opacity: .7 }}>{d.long}</div>
                </button>
              ); })}
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>אנשים משובצים</label>
              {form.assignees.length > 0 && <span style={{ fontSize: 11, color: col.accent, fontWeight: 600 }}>{form.assignees.length} נבחרו</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {getSections(data).map((sec, si) => sec.people.length === 0 ? null : (
                <div key={sec.name}>
                  <div style={{ fontSize: 10, color: "#8892b0", fontWeight: 700, letterSpacing: .5, marginBottom: 5, textTransform: "uppercase" }}>{sec.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {sec.people.map(p => { const sel = form.assignees.includes(p); return (
                      <button key={p} onClick={() => toggleP(p)} style={{ padding: "6px 13px", border: `1px solid ${sel ? col.accent : "rgba(255,255,255,0.1)"}`, borderRadius: 20, background: sel ? `${col.accent}22` : "rgba(255,255,255,0.04)", color: sel ? col.accent : "#8892b0", fontSize: 12, cursor: "pointer", fontWeight: sel ? 700 : 400 }}>
                        {sel && "✓ "}{p}
                      </button>
                    ); })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>משימות לשבוע</label>
            <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
              <input ref={taskRef} value={task} onChange={e => setTask(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()} placeholder="כתוב משימה ולחץ Enter או +" style={{ ...inp, flex: 1 }} />
              <button onClick={addTask} disabled={!task.trim()} style={{ width: 40, height: 40, flexShrink: 0, border: "none", borderRadius: 9, background: task.trim() ? `${col.accent}33` : "rgba(255,255,255,0.06)", color: task.trim() ? col.accent : "#445", cursor: task.trim() ? "pointer" : "default", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
            {form.tasks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                {form.tasks.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                    <span style={{ color: col.accent, flexShrink: 0 }}><I n="check" s={11} /></span>
                    <span style={{ flex: 1, fontSize: 12, color: "#c8d0e4" }}>{t}</span>
                    <button onClick={() => setForm(f => ({ ...f, tasks: f.tasks.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#556", cursor: "pointer", padding: "2px 4px", fontSize: 14, lineHeight: 1 }} onMouseEnter={e => e.currentTarget.style.color = "#e74c3c"} onMouseLeave={e => e.currentTarget.style.color = "#556"}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>הערות (אופציונלי)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="הערות נוספות..." rows={2} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
          </div>
        </div>
        <div style={{ padding: mob ? "12px 16px calc(12px + env(safe-area-inset-bottom,0px))" : "14px 22px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
          <button onClick={() => { const final = task.trim() ? { ...form, tasks: [...form.tasks, task.trim()] } : form; onSave(final); }} style={{ flex: 1, padding: "13px", background: `linear-gradient(135deg,${col.accent},${col.accent}99)`, border: "none", borderRadius: 11, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: `0 4px 16px ${col.accent}44` }} onMouseEnter={e => e.currentTarget.style.opacity = ".9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            {mode === "add" ? "✓  צור שיבוץ" : "✓  שמור שינויים"}
          </button>
          <button onClick={onClose} style={{ padding: "13px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 11, color: "#8892b0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>ביטול</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ═══════════════════════════════════════════════════════
   ANNUAL PLAN VIEW
═══════════════════════════════════════════════════════ */
const MONTHS_HE  = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const DAY_SHORT  = ['א','ב','ג','ד','ה','ו','ש'];
const DAY_LONG   = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

// Status category classification
const CAT_DAY      = new Set(['י','Y','2']);
const CAT_NIGHT    = new Set(['ל','L','ל2']);
const CAT_ONCALL   = new Set(['כ','כש','כמ','כמש']);
const CAT_UNAVAIL  = new Set(['ח','מיל','מ','פ','מנוחה','ק']);
const CAT_AWAY     = new Set(['חיפה','הרצליה','ראש פינה','PBB','רמון']);
const CAT_TRAINING = new Set(['ב. חשמל','ב. כללית','השתלמות','ניקיון תחנות','ב. שמיעה','ס. רפואי','ר. גובה','ר. מלגזה','ע. ראשונה']);

function classifyStatus(code) {
  if (!code) return null;
  if (CAT_DAY.has(code))      return 'day';
  if (CAT_NIGHT.has(code))    return 'night';
  if (CAT_ONCALL.has(code))   return 'oncall';
  if (CAT_UNAVAIL.has(code))  return 'unavail';
  if (CAT_AWAY.has(code))     return 'away';
  if (CAT_TRAINING.has(code)) return 'training';
  return 'other';
}

const CAT_STYLE = {
  day:      { bg: '#27ae60', light: '#1a4a2a', label: '☀️ משמרת יום',         labelShort: 'יום'     },
  night:    { bg: '#2980b9', light: '#0d2a40', label: '🌙 משמרת לילה',        labelShort: 'לילה'    },
  oncall:   { bg: '#e67e22', light: '#3a1f00', label: '🔶 כוננות',             labelShort: 'כוננות'  },
  unavail:  { bg: '#e74c3c', light: '#3a0c0c', label: '🔴 לא זמינים',         labelShort: 'חסרים'   },
  away:     { bg: '#16a085', light: '#0a2a24', label: '✈️ מחוץ לבסיס',        labelShort: 'בחוץ'    },
  training: { bg: '#8e44ad', light: '#2a1040', label: '📚 הכשרה / בטיחות',    labelShort: 'הכשרה'   },
};

function StatusBadge({ code, small }) {
  const st = statusStyle(code);
  if (!st) return <span style={{ color: '#334', fontSize: small ? 9 : 11 }}>—</span>;
  return (
    <span style={{ display: 'inline-block', background: st.bg, color: '#fff', borderRadius: small ? 3 : 4, padding: small ? '1px 4px' : '2px 7px', fontSize: small ? 9 : 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {code}
    </span>
  );
}

/* ── Daily briefing helpers ── */
function buildDayGroups(dayData, sections) {
  const statuses = dayData?.statuses || {};
  const groups   = { day: [], night: [], oncall: [], unavail: [], away: [], training: [] };
  const allPeople = sections.flatMap(s => s.people);
  for (const person of allPeople) {
    const code = statuses[person] || '';
    const cat  = classifyStatus(code);
    if (cat && groups[cat]) groups[cat].push({ person, code });
  }
  return groups;
}

function PersonChip({ person, code, isMe }) {
  const st = statusStyle(code);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 20, background: isMe ? 'rgba(74,158,255,0.1)' : 'rgba(255,255,255,0.05)', border: isMe ? '1px solid rgba(74,158,255,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontSize: 12, color: isMe ? '#4a9eff' : '#ccd6f6' }}>{person}</span>
      {code && st && <span style={{ background: st.bg, color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{code}</span>}
    </div>
  );
}

function AnnualView({ annualData, onSaveDay, mgr, myName }) {
  const mob = useContext(MobileCtx);
  // lens: 'daily' | 'monthly' | 'personal'
  const [lens,      setLens]      = useState('daily');
  const [selDate,   setSelDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [selMonth,  setSelMonth]  = useState(() => new Date().getMonth());
  const [selPerson, setSelPerson] = useState(myName || '');
  const [selSecIdx, setSelSecIdx] = useState(0);
  const [editCell,  setEditCell]  = useState(null);

  if (!annualData) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8892b0' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>תוכנית שנתית לא נטענה עדיין</div>
        <div style={{ fontSize: 13, marginBottom: 20 }}>יש לייבא את תוכנית העבודה מ-Excel</div>
        <div style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.2)', borderRadius: 12, padding: '14px 18px', maxWidth: 420, margin: '0 auto', fontSize: 12, color: '#8892b0', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: '#4a9eff', marginBottom: 8 }}>שלבי ייבוא:</div>
          <div>1. ודא ש-Python ו-openpyxl מותקנים</div>
          <div>2. הרץ: <code style={{ background: '#0a1020', padding: '2px 6px', borderRadius: 4, color: '#4a9eff' }}>python scripts/import_annual.py --upload</code></div>
          <div>3. רענן את הדף</div>
        </div>
      </div>
    );
  }

  const year     = annualData.year || 2026;
  const sections = annualData.sections || [];
  const days     = annualData.days || {};
  const today    = new Date().toISOString().slice(0, 10);

  const STATUS_OPTIONS = [
    '', 'י', 'ל', 'Y', 'L', 'כ', 'כש', 'כמ', 'כמש',
    'ח', 'מיל', 'מ', 'פ', 'מנוחה', 'ק',
    'חיפה', 'הרצליה', 'ראש פינה', 'PBB', 'רמון',
    'ב. חשמל', 'ב. כללית', 'השתלמות', 'ניקיון תחנות',
  ];

  function navDay(delta) {
    const d = new Date(selDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const iso = d.toISOString().slice(0, 10);
    setSelDate(iso);
    setSelMonth(d.getMonth());
    setEditCell(null);
  }

  function saveStatus(person, code) {
    const dayData = days[selDate] || {};
    const newStatuses = { ...(dayData.statuses || {}) };
    if (code) newStatuses[person] = code; else delete newStatuses[person];
    onSaveDay({ date: selDate, statuses: newStatuses });
  }

  // ── Lens tabs ─────────────────────────────────────────────────
  const LENSES = [
    { id: 'daily',    label: 'יומי',    icon: '☀️' },
    { id: 'weekly',   label: 'שבועי',   icon: '📅' },
    { id: 'monthly',  label: 'חודשי',   icon: '📊' },
    { id: 'personal', label: 'אישי',    icon: '👤' },
  ];

  return (
    <div>
      {/* Lens selector */}
      <div style={{ display: 'flex', marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        {LENSES.map(l => (
          <button key={l.id} onClick={() => setLens(l.id)}
            style={{ flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
              background: lens === l.id ? 'rgba(74,158,255,0.18)' : 'transparent',
              color: lens === l.id ? '#4a9eff' : '#556',
              fontWeight: lens === l.id ? 700 : 400,
              fontSize: 13,
              borderBottom: `2px solid ${lens === l.id ? '#4a9eff' : 'transparent'}`,
              transition: 'all .15s' }}>
            {l.icon} {l.label}
          </button>
        ))}
      </div>

      {/* ══ DAILY LENS ══════════════════════════════════════════════ */}
      {lens === 'daily' && (() => {
        const selDayData = days[selDate] || {};
        const selDateObj = selDate ? new Date(selDate + 'T00:00:00') : null;
        const selDow     = selDateObj ? selDateObj.getDay() : 0;
        const selNum     = selDateObj ? selDateObj.getDate() : 0;
        const selMon     = selDateObj ? selDateObj.getMonth() : 0;
        const groups     = buildDayGroups(selDayData, sections);

        return (
          <div>
            {/* Date nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <NavBtn onClick={() => navDay(-1)}><I n="cL" s={14} /></NavBtn>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>
                  {selNum} {MONTHS_HE[selMon]} {year}
                </div>
                <div style={{ fontSize: 12, color: '#8892b0' }}>
                  יום {DAY_LONG[selDow]}{selDate === today ? ' — היום' : ''}
                </div>
              </div>
              <NavBtn onClick={() => navDay(1)}><I n="cR" s={14} /></NavBtn>
            </div>

            {/* Summary bar */}
            {(selDayData.countDay != null || selDayData.countNight != null || selDayData.workDay || selDayData.workNight || selDayData.notes) && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: selDayData.notes ? 8 : 0 }}>
                  {selDayData.countDay   != null && <span style={{ background: 'rgba(39,174,96,0.12)',  border: '1px solid rgba(39,174,96,0.3)',  borderRadius: 8, padding: '4px 12px', fontSize: 12, color: '#2ecc71' }}>☀ יום: {selDayData.countDay}</span>}
                  {selDayData.countNight != null && <span style={{ background: 'rgba(41,128,185,0.12)', border: '1px solid rgba(41,128,185,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: 12, color: '#3498db' }}>🌙 לילה: {selDayData.countNight}</span>}
                  {selDayData.workDay    && <span style={{ background: 'rgba(39,174,96,0.08)',  border: '1px solid rgba(39,174,96,0.2)',  borderRadius: 8, padding: '4px 12px', fontSize: 12, color: '#2ecc71' }}>⚙ יום: {selDayData.workDay}</span>}
                  {selDayData.workNight  && <span style={{ background: 'rgba(41,128,185,0.08)', border: '1px solid rgba(41,128,185,0.2)', borderRadius: 8, padding: '4px 12px', fontSize: 12, color: '#3498db' }}>⚙ לילה: {selDayData.workNight}</span>}
                </div>
                {selDayData.notes && <div style={{ fontSize: 13, color: '#ccd6f6', textAlign: 'right' }}>📝 {selDayData.notes}</div>}
              </div>
            )}

            {/* Notes edit — managers only */}
            {mgr && (
              <div style={{ marginBottom: 14 }}>
                <input value={selDayData.notes || ''}
                  onChange={e => onSaveDay({ date: selDate, ...selDayData, notes: e.target.value })}
                  placeholder="הערות ליום..." style={{ ...inp, fontSize: 13 }} />
              </div>
            )}

            {/* Group cards — one per shift category */}
            {Object.entries(CAT_STYLE).map(([cat, style]) => {
              const people = groups[cat] || [];
              if (!people.length) return null;
              const emoji = style.label.match(/^\S+/)?.[0] || '';
              const title = style.label.replace(/^\S+\s*/, '');
              return (
                <div key={cat} style={{ marginBottom: 12, border: `1px solid ${style.bg}33`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: `${style.bg}22`, padding: '8px 14px', borderBottom: `1px solid ${style.bg}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: style.bg }}>{title}</span>
                    <span style={{ marginRight: 'auto', background: `${style.bg}33`, color: style.bg, borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{people.length}</span>
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {people.map(({ person, code }) => {
                      const isMe = person === myName;
                      const isEd = editCell?.person === person;
                      return (
                        <div key={person} style={{ display: 'flex', alignItems: 'center', gap: 6, background: isMe ? 'rgba(74,158,255,0.07)' : 'rgba(255,255,255,0.03)', border: isMe ? '1px solid rgba(74,158,255,0.22)' : '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '5px 9px', flexWrap: isEd ? 'wrap' : 'nowrap', maxWidth: isEd ? 340 : 'none' }}>
                          <span style={{ fontSize: 12, color: isMe ? '#4a9eff' : '#8892b0', whiteSpace: 'nowrap' }}>{person}</span>
                          {mgr ? (
                            isEd ? (
                              <>
                                {STATUS_OPTIONS.map(opt => (
                                  <button key={opt || '__none'} onClick={() => { saveStatus(person, opt); setEditCell(null); }}
                                    style={{ padding: '2px 7px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', background: opt === code ? (statusStyle(opt)?.bg || '#4a9eff') : 'rgba(255,255,255,0.08)', color: opt === code ? '#fff' : '#8892b0', fontWeight: opt === code ? 700 : 400, margin: '1px' }}>
                                    {opt || '—'}
                                  </button>
                                ))}
                                <button onClick={() => setEditCell(null)} style={{ padding: '2px 6px', fontSize: 10, borderRadius: 4, border: '1px solid #333', background: 'transparent', color: '#556', cursor: 'pointer' }}>✕</button>
                              </>
                            ) : (
                              <button onClick={() => setEditCell({ person })}
                                style={{ background: code && statusStyle(code) ? statusStyle(code).bg : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 11, color: code ? '#fff' : '#445', cursor: 'pointer', fontWeight: 700, minWidth: 30, whiteSpace: 'nowrap' }}>
                                {code || '—'}
                              </button>
                            )
                          ) : (
                            code
                              ? <span style={{ background: style.bg, borderRadius: 5, padding: '2px 8px', fontSize: 11, color: '#fff', fontWeight: 700 }}>{code}</span>
                              : <span style={{ fontSize: 11, color: '#334' }}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Quick date jump */}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <input type="date" value={selDate}
                onChange={e => { if (e.target.value) { setSelDate(e.target.value); setSelMonth(new Date(e.target.value + 'T00:00:00').getMonth()); }}}
                style={{ ...inp, fontSize: 12, width: 'auto', padding: '4px 10px' }} />
            </div>
          </div>
        );
      })()}

      {/* ══ WEEKLY LENS ═════════════════════════════════════════════ */}
      {lens === 'weekly' && (() => {
        // Derive Sunday of the week containing selDate
        const anchor = new Date(selDate + 'T00:00:00');
        anchor.setDate(anchor.getDate() - anchor.getDay()); // rewind to Sunday

        const weekDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(anchor);
          d.setDate(anchor.getDate() + i);
          const iso = d.toISOString().slice(0, 10);
          return { iso, d: d.getDate(), month: d.getMonth(), dow: d.getDay() };
        });

        const weekGroups = weekDays.map(({ iso }) => buildDayGroups(days[iso] || {}, sections));

        function navWeek(delta) {
          const d = new Date(anchor);
          d.setDate(d.getDate() + delta * 7);
          setSelDate(d.toISOString().slice(0, 10));
          setSelMonth(d.getMonth());
        }

        const startLabel = `${weekDays[0].d} ${MONTHS_HE[weekDays[0].month]}`;
        const endLabel   = `${weekDays[6].d} ${MONTHS_HE[weekDays[6].month]}`;

        return (
          <div>
            {/* Week nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
              <NavBtn onClick={() => navWeek(-1)}><I n="cL" s={14} /></NavBtn>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{startLabel} — {endLabel}</div>
                <div style={{ fontSize: 12, color: '#8892b0' }}>{year}</div>
              </div>
              <NavBtn onClick={() => navWeek(1)}><I n="cR" s={14} /></NavBtn>
            </div>

            {/* 7-column day grid */}
            <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: 6, minWidth: 560 }}>
                {weekDays.map(({ iso, d, month, dow }, di) => {
                  const isToday  = iso === today;
                  const isSat    = dow === 6;
                  const dayData  = days[iso] || {};
                  const g        = weekGroups[di];
                  const hasAny   = Object.values(g).some(arr => arr.length > 0);

                  return (
                    <div key={iso} style={{ border: `1px solid ${isToday ? 'rgba(74,158,255,0.45)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, overflow: 'hidden', background: isToday ? 'rgba(74,158,255,0.07)' : isSat ? 'rgba(255,255,255,0.012)' : 'rgba(255,255,255,0.02)' }}>
                      {/* Day header */}
                      <div onClick={() => { setSelDate(iso); setLens('daily'); }}
                        style={{ padding: '8px 6px', textAlign: 'center', cursor: 'pointer', background: isToday ? 'rgba(74,158,255,0.15)' : 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 10, color: isToday ? '#4a9eff' : isSat ? '#557' : '#556', fontWeight: 700 }}>{DAY_LONG[dow]}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#4a9eff' : '#ccd6f6', lineHeight: 1.2 }}>{d}</div>
                        <div style={{ fontSize: 9, color: '#445' }}>{MONTHS_HE[month]}</div>
                      </div>

                      {/* Category groups */}
                      <div style={{ padding: '7px 6px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 60 }}>
                        {!hasAny && <div style={{ fontSize: 10, color: '#334', textAlign: 'center', marginTop: 12 }}>—</div>}
                        {Object.entries(CAT_STYLE).map(([cat, style]) => {
                          const people = g[cat] || [];
                          if (!people.length) return null;
                          return (
                            <div key={cat}>
                              <div style={{ fontSize: 8, color: style.bg, fontWeight: 700, marginBottom: 2, letterSpacing: '0.3px' }}>{style.labelShort} ({people.length})</div>
                              {people.map(({ person, code }) => {
                                const isMe = person === myName;
                                return (
                                  <div key={person} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, padding: '1px 3px', borderRadius: 3, background: isMe ? 'rgba(74,158,255,0.1)' : 'transparent' }}>
                                    <span style={{ fontSize: 9, color: isMe ? '#4a9eff' : '#8892b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{person.split(' ')[0]}</span>
                                    {code && <span style={{ background: style.bg, color: '#fff', borderRadius: 2, padding: '0px 3px', fontSize: 7, fontWeight: 700, flexShrink: 0 }}>{code.slice(0, 3)}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                        {dayData.notes && (
                          <div style={{ fontSize: 9, color: '#556', marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 3 }} title={dayData.notes}>📝 {dayData.notes.slice(0, 30)}{dayData.notes.length > 30 ? '…' : ''}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick jump to today */}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button onClick={() => { setSelDate(today); setSelMonth(new Date().getMonth()); }}
                style={{ background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.25)', borderRadius: 8, padding: '5px 14px', fontSize: 11, color: '#4a9eff', cursor: 'pointer' }}>
                השבוע הנוכחי
              </button>
            </div>
          </div>
        );
      })()}

      {/* ══ MONTHLY LENS ════════════════════════════════════════════ */}
      {lens === 'monthly' && (() => {
        const daysInMonth = new Date(year, selMonth + 1, 0).getDate();
        const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
          const iso = `${year}-${String(selMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          return { num: i + 1, iso, dow: new Date(year, selMonth, i + 1).getDay() };
        });

        const sec    = sections[selSecIdx] || sections[0];
        const sc     = sec ? secPal(null, sec.name, selSecIdx) : { accent: '#4a9eff' };
        const people = sec?.people || [];

        return (
          <div>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <NavBtn onClick={() => setSelMonth(m => (m + 11) % 12)}><I n="cL" s={14} /></NavBtn>
              <div style={{ textAlign: 'center', minWidth: 130 }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>{MONTHS_HE[selMonth]}</div>
                <div style={{ fontSize: 13, color: '#8892b0' }}>{year}</div>
              </div>
              <NavBtn onClick={() => setSelMonth(m => (m + 1) % 12)}><I n="cR" s={14} /></NavBtn>
            </div>

            {/* Section tabs */}
            <div style={{ display: 'flex', marginBottom: 14, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              {sections.map((s, si) => {
                const c    = secPal(null, s.name, si);
                const isSel = si === selSecIdx;
                return (
                  <button key={s.name} onClick={() => setSelSecIdx(si)}
                    style={{ flex: 1, padding: '8px 4px', border: 'none', background: isSel ? `${c.accent}22` : 'transparent', color: isSel ? c.accent : '#556', fontSize: 10, fontWeight: isSel ? 700 : 400, cursor: 'pointer', borderBottom: `2px solid ${isSel ? c.accent : 'transparent'}`, transition: 'all .15s' }}>
                    {s.name.replace('מדור ', '').replace('משמרת ', 'משמרת ')}
                  </button>
                );
              })}
            </div>

            {/* People × Days grid */}
            <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${sc.accent}55`, boxShadow: `0 0 0 1px rgba(0,0,0,0.4)` }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', direction: 'rtl', minWidth: Math.max(320, people.length * 48 + 68) }}>
                <thead>
                  <tr style={{ background: `${sc.accent}30` }}>
                    <th style={{ padding: '8px 10px', fontSize: 12, color: sc.accent, textAlign: 'right', borderBottom: `2px solid ${sc.accent}66`, borderLeft: `1px solid rgba(255,255,255,0.1)`, width: 64, position: 'sticky', right: 0, background: `${sc.accent}30`, zIndex: 2 }}>יום</th>
                    {people.map((person) => {
                      const [firstName, ...rest] = person.split(' ');
                      const lastName = rest.join(' ');
                      const isMe = person === myName;
                      return (
                        <th key={person} style={{ padding: '7px 5px', fontSize: 11, color: isMe ? '#4a9eff' : '#dde8ff', borderBottom: `2px solid ${sc.accent}66`, borderRight: `1px solid rgba(255,255,255,0.1)`, textAlign: 'center', minWidth: 52, fontWeight: isMe ? 700 : 600, verticalAlign: 'middle' }}>
                          <div style={{ lineHeight: 1.4 }}>
                            <div>{firstName}</div>
                            {lastName && <div style={{ opacity: 0.75, fontSize: 10 }}>{lastName}</div>}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {monthDays.map(({ num, iso, dow }, ri) => {
                    const dayData  = days[iso] || {};
                    const isToday  = iso === today;
                    const isSat    = dow === 6;
                    const rowBg    = isToday ? 'rgba(74,158,255,0.1)' : isSat ? 'rgba(255,255,255,0.025)' : ri % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.15)';
                    const stickyBg = isToday ? '#0d1e3a' : isSat ? '#0b0f1e' : ri % 2 === 0 ? '#0c1022' : '#090d1a';
                    return (
                      <tr key={iso}
                        onClick={() => { setSelDate(iso); setLens('daily'); }}
                        style={{ cursor: 'pointer', background: rowBg, borderBottom: `1px solid rgba(255,255,255,${isSat ? '0.12' : '0.06'})` }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,158,255,0.07)'}
                        onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                        <td style={{ padding: '4px 8px', position: 'sticky', right: 0, background: stickyBg, zIndex: 1, whiteSpace: 'nowrap', verticalAlign: 'middle', borderLeft: `1px solid rgba(255,255,255,0.1)`, borderBottom: `1px solid rgba(255,255,255,${isSat ? '0.12' : '0.06'})` }}>
                          <span style={{ fontWeight: isToday ? 700 : isSat ? 600 : 400, color: isToday ? '#4a9eff' : isSat ? '#7788aa' : '#c0cce0', fontSize: 13 }}>{num}</span>
                          <span style={{ fontSize: 9, color: isSat ? '#556' : '#445', marginRight: 4 }}>{DAY_SHORT[dow]}</span>
                          {dayData.notes && <span style={{ fontSize: 9 }}>📝</span>}
                        </td>
                        {people.map((person, pi) => {
                          const code = dayData.statuses?.[person] || '';
                          const st   = statusStyle(code);
                          return (
                            <td key={person} style={{ padding: '4px 3px', textAlign: 'center', verticalAlign: 'middle', borderRight: `1px solid rgba(255,255,255,0.07)`, background: code && st ? `${st.bg}28` : 'transparent' }}>
                              {code && <StatusBadge code={code} small />}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Status legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              {[['י','יום'],['ל','לילה'],['כ','כוננות'],['ח','חופשה'],['מיל','מילואים'],['מ','מחלה'],['פ','פנוי'],['ק','קורס']].map(([code, lbl]) => (
                <span key={code} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8892b0' }}>
                  <span style={{ width: 18, height: 12, background: statusStyle(code)?.bg || '#333', borderRadius: 2, display: 'inline-block' }} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ══ PERSONAL LENS ═══════════════════════════════════════════ */}
      {lens === 'personal' && (() => {
        const allPeople = sections.flatMap(s => s.people);
        const person = selPerson || allPeople[0] || '';

        // Build 12-month grid for this person
        const yearMonths = Array.from({ length: 12 }, (_, m) => {
          const dInM = new Date(year, m + 1, 0).getDate();
          const ds = Array.from({ length: dInM }, (_, d) => {
            const iso  = `${year}-${String(m + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`;
            const code = days[iso]?.statuses?.[person] || '';
            const cat  = classifyStatus(code);
            return { iso, d: d + 1, code, cat, dow: new Date(year, m, d + 1).getDay() };
          });
          return { month: m, days: ds };
        });

        // Tally stats
        const stats = { day: 0, night: 0, oncall: 0, unavail: 0, away: 0, training: 0 };
        yearMonths.forEach(({ days: ds }) => ds.forEach(({ cat }) => { if (cat && stats[cat] !== undefined) stats[cat]++; }));

        return (
          <div>
            {/* Person picker */}
            <div style={{ marginBottom: 16 }}>
              <select value={person} onChange={e => setSelPerson(e.target.value)}
                style={{ ...inp, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                {sections.map(sec => (
                  <optgroup key={sec.name} label={sec.name}>
                    {sec.people.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Stat chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18, justifyContent: 'center' }}>
              {Object.entries(stats).filter(([, v]) => v > 0).map(([cat, count]) => {
                const st = CAT_STYLE[cat];
                return (
                  <span key={cat} style={{ background: `${st.bg}22`, color: st.bg, border: `1px solid ${st.bg}44`, borderRadius: 10, padding: '4px 12px', fontSize: 11, fontWeight: 700 }}>
                    {st.labelShort}: {count}
                  </span>
                );
              })}
            </div>

            {/* Year grid — GitHub contribution style */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {yearMonths.map(({ month, days: ds }) => (
                <div key={month}>
                  <div style={{ fontSize: 11, color: '#4a9eff', fontWeight: 700, marginBottom: 5 }}>{MONTHS_HE[month]}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {ds.map(({ iso, d, code, cat, dow }) => {
                      const st = cat ? CAT_STYLE[cat] : null;
                      const bg = st ? st.bg : 'rgba(255,255,255,0.04)';
                      const isToday = iso === today;
                      return (
                        <div key={iso} title={`${d} ${MONTHS_HE[month]}${code ? ` — ${code}` : ''}`}
                          onClick={() => { setSelDate(iso); setSelMonth(month); setLens('daily'); }}
                          style={{ width: 22, height: 22, borderRadius: 4, background: bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: st ? '#fff' : '#334', fontWeight: 700, border: isToday ? '2px solid #4a9eff' : dow === 6 ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent', opacity: dow === 6 ? 0.7 : 1 }}>
                          {code ? code.slice(0, 2) : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Color legend */}
            <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {Object.entries(CAT_STYLE).map(([cat, st]) => (
                <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#8892b0' }}>
                  <span style={{ width: 12, height: 12, background: st.bg, borderRadius: 3, display: 'inline-block' }} />
                  {st.labelShort}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── ABSENCE REGISTRATION MODAL ── */
const ABSENCE_TYPES = [
  { code: "ח",   label: "חופשה",             color: "#e74c3c" },
  { code: "מיל", label: "מילואים",           color: "#922b21" },
  { code: "מ",   label: "מחלה",              color: "#c0392b" },
  { code: "פ",   label: "יום פנוי",          color: "#7f8c8d" },
  { code: "מנוחה", label: "מנוחה",           color: "#7f8c8d" },
  { code: "ק",   label: "קורס",              color: "#8e44ad" },
  { code: "השתלמות", label: "השתלמות",       color: "#6c3483" },
  { code: "כ",   label: "כוננות",            color: "#e67e22" },
  { code: "כמ",  label: "כוננות מסלולים",   color: "#f39c12" },
  { code: "כש",  label: "כוננות שבת",        color: "#d35400" },
];

function AbsenceModal({ data, annualData, onClose, onSave }) {
  const mob = useContext(MobileCtx);
  const allPeople = getAllPeople(data);
  const today = new Date().toISOString().slice(0, 10);

  const [person,   setPerson]   = useState("");
  const [code,     setCode]     = useState("ח");
  const [fromDate, setFromDate] = useState(today);
  const [toDate,   setToDate]   = useState(today);
  const [saving,   setSaving]   = useState(false);

  // Count how many days in range
  const dayCount = (() => {
    if (!fromDate || !toDate) return 0;
    const d1 = new Date(fromDate), d2 = new Date(toDate);
    if (d2 < d1) return 0;
    return Math.round((d2 - d1) / 86400000) + 1;
  })();

  // Preview: existing status in range for this person
  const preview = (() => {
    if (!person || !fromDate || !toDate || !annualData) return [];
    const from = new Date(fromDate + "T00:00:00");
    const to   = new Date(toDate   + "T00:00:00");
    const out  = [];
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const iso      = d.toISOString().slice(0, 10);
      const existing = annualData.days?.[iso]?.statuses?.[person] || "";
      if (existing && existing !== code) out.push({ iso, existing });
    }
    return out.slice(0, 5);
  })();

  const selType = ABSENCE_TYPES.find(t => t.code === code) || ABSENCE_TYPES[0];

  const handleSave = async () => {
    if (!person)    return;
    if (!fromDate || !toDate) return;
    if (new Date(toDate) < new Date(fromDate)) return;
    setSaving(true);
    await onSave({ person, code, fromDate, toDate });
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div dir="rtl" style={{ background: "linear-gradient(160deg,#0f1a35,#0a1220)", border: "1px solid rgba(231,76,60,0.25)", borderRadius: 20, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,.8)", maxHeight: "90dvh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "rgba(231,76,60,0.1)", borderBottom: "1px solid rgba(231,76,60,0.2)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>📋 רישום היעדרות</div>
            <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>עדכון תוכנית שנתית + אזהרה בשיבוצים</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#556", fontSize: 20, cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Person */}
          <div>
            <label style={lbl}>עובד</label>
            <select value={person} onChange={e => setPerson(e.target.value)}
              style={{ ...inp, cursor: "pointer" }}>
              <option value="">— בחר עובד —</option>
              {getSections(data).map(sec => (
                <optgroup key={sec.name} label={sec.name}>
                  {sec.people.map(p => <option key={p} value={p}>{p}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Absence type */}
          <div>
            <label style={lbl}>סוג היעדרות</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ABSENCE_TYPES.map(t => (
                <button key={t.code} onClick={() => setCode(t.code)}
                  style={{ padding: "7px 13px", borderRadius: 20, border: `2px solid ${t.code === code ? t.color : t.color + "44"}`, background: t.code === code ? `${t.color}22` : "rgba(255,255,255,0.04)", color: t.code === code ? t.color : "#8892b0", fontSize: 12, fontWeight: t.code === code ? 700 : 400, cursor: "pointer", transition: "all .12s" }}>
                  {t.label}
                  <span style={{ marginRight: 5, fontSize: 10, opacity: 0.7 }}>{t.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>מתאריך</label>
              <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }}
                style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>עד תאריך</label>
              <input type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)}
                style={inp} />
            </div>
          </div>

          {/* Summary */}
          {person && fromDate && toDate && dayCount > 0 && (
            <div style={{ background: `${selType.color}11`, border: `1px solid ${selType.color}33`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, color: "#ccd6f6", fontWeight: 600, marginBottom: 4 }}>
                <span style={{ color: "#4a9eff" }}>{person}</span> — <span style={{ background: selType.color, color: "#fff", borderRadius: 5, padding: "1px 8px", fontSize: 12, fontWeight: 700 }}>{selType.label}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8892b0" }}>
                {fromDate === toDate ? `יום אחד: ${fromDate}` : `${dayCount} ימים: ${fromDate} עד ${toDate}`}
              </div>
              {preview.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#e67e22" }}>
                  ⚠ ידרוס סטטוסים קיימים: {preview.map(p => `${p.iso} (${p.existing})`).join(", ")}{preview.length === 5 ? "..." : ""}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
          <button onClick={handleSave} disabled={!person || dayCount === 0 || saving}
            style={{ flex: 1, padding: "12px", background: person && dayCount > 0 ? `linear-gradient(135deg,${selType.color},${selType.color}cc)` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 11, color: person && dayCount > 0 ? "#fff" : "#445", fontWeight: 700, fontSize: 14, cursor: person && dayCount > 0 ? "pointer" : "default", boxShadow: person && dayCount > 0 ? `0 4px 14px ${selType.color}44` : "none", transition: "all .15s" }}>
            {saving ? "שומר..." : `✓ שמור${dayCount > 1 ? ` (${dayCount} ימים)` : ""}`}
          </button>
          <button onClick={onClose} style={{ padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 11, color: "#8892b0", cursor: "pointer", fontSize: 14 }}>ביטול</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ── AUTH MODAL ── */
function AuthModal({ pin, managers, onOk, onClose }) {
  const [v, setV]     = useState("");
  const [err, setErr] = useState(false);
  const try_ = () => {
    if (v === pin) { onOk("מנהל ראשי"); return; }
    const mgr = (managers||[]).find(m => m.pin === v);
    if (mgr) { onOk(mgr.name); return; }
    setErr(true); setV(""); setTimeout(() => setErr(false), 1500);
  };
  return (
    <Overlay onClose={onClose}>
      <div dir="rtl" style={{ background: "#0f1525", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "28px 26px", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,.8)" }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>🔐</div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#fff", marginBottom: 4 }}>כניסת מנהל</div>
        <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 20 }}>הזן קוד PIN לגישה מלאה</div>
        <input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" value={v} onChange={e => { setV(e.target.value); setErr(false); }} onKeyDown={e => e.key === "Enter" && try_()}
          placeholder="● ● ● ●"
          style={{ ...inp, textAlign: "center", fontSize: 22, letterSpacing: 8, marginBottom: 10, border: `1px solid ${err ? "#e74c3c" : "rgba(255,255,255,0.12)"}`, background: err ? "rgba(231,76,60,0.08)" : "rgba(255,255,255,0.06)" }} />
        {err && <div style={{ color: "#e74c3c", fontSize: 12, marginBottom: 8, animation: "pulse .5s ease" }}>קוד שגוי, נסה שוב</div>}
        <button onClick={try_} style={{ width: "100%", padding: "11px", background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", border: "none", borderRadius: 11, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8, boxShadow: "0 4px 16px rgba(74,158,255,.3)" }}>כניסה</button>
        <button onClick={onClose} style={{ width: "100%", padding: "9px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 11, color: "#8892b0", cursor: "pointer", fontSize: 13 }}>ביטול</button>
        <div style={{ marginTop: 12, fontSize: 10, color: "#334" }}>ברירת מחדל: 1234 · שנה בהגדרות → אבטחה</div>
      </div>
    </Overlay>
  );
}
