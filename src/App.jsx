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
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y = d.getFullYear(), w = Math.ceil(((d - new Date(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
function wDates(wk) {
  const [y, w] = wk.split("-W");
  const j = new Date(Number(y), 0, 1), dw = j.getDay() || 7;
  const m = new Date(j); m.setDate(j.getDate() + (8 - dw) % 7 + (Number(w) - 1) * 7);
  const s = new Date(m); s.setDate(m.getDate() - 1);
  const t = new Date(s); t.setDate(s.getDate() + 4);
  return { sun: s, thu: t };
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
  const [tab, setTab]       = useState("calendar");
  const [wk, setWk]         = useState(wKey(new Date()));
  const [mgr, setMgr]       = useState(false);
  const [modal, setModal]   = useState(null);
  const [myName, setMyName] = useState(() => sessionStorage.getItem("myName") || "");
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

  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => {
        // migrate old data that has people[] but no sections
        if (!d.sections?.length && d.people?.length) {
          const migrated = { ...d, sections: getSections(d) };
          delete migrated.people;
          setData(migrated);
        } else {
          setData(d);
        }
      })
      .catch(() => { setData(DEF); setSaveErr(true); });
  }, []);

  const save = useCallback(async (nd, msg) => {
    setData(nd);
    try {
      const r = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nd),
      });
      if (!r.ok) throw new Error();
      setSaveErr(false);
    } catch {
      setSaveErr(true);
      toast("שגיאה בשמירה", "error");
    }
    if (msg) toast(msg);
  }, [toast]);

  const weekA = data ? data.assignments.filter(a => a.week === wk) : [];
  const prevA  = data ? data.assignments.filter(a => a.week === adjW(wk, -1)) : [];

  const copyFromPrev = () => {
    if (!prevA.length) { toast("אין שיבוצים בשבוע הקודם", "info"); return; }
    const copied = prevA.map(a => ({ ...a, id: Date.now() + Math.random(), week: wk }));
    save({ ...data, assignments: [...data.assignments, ...copied] }, `הועתקו ${copied.length} שיבוצים`);
  };

  const deleteAssign = id => save({ ...data, assignments: data.assignments.filter(a => a.id !== id) }, "השיבוץ נמחק");

  const upsertAssign = a => {
    const isEdit = data.assignments.some(x => x.id === a.id);
    const assignments = isEdit
      ? data.assignments.map(x => x.id === a.id ? a : x)
      : [...data.assignments, { ...a, id: Date.now().toString() }];
    save({ ...data, assignments }, isEdit ? "השיבוץ עודכן ✓" : "שיבוץ נוסף ✓");
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
    { id: "me",       label: "השיבוצים שלי", icon: "user" },
    { id: "settings", label: "הגדרות",       icon: "cog"  },
  ];

  const openAdd = () => setModal({ t: "assign", mode: "add" });

  return (
    <MobileCtx.Provider value={mob}>
      <style>{CSS}</style>
      <div dir="rtl" style={{ minHeight: "100vh", background: "#080c18", color: "#dde2f0", fontFamily: "'Segoe UI','Arial Hebrew',Arial,sans-serif", display: "flex", flexDirection: "column" }}>
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
          <button onClick={() => { if (mgr) setMgr(false); else setModal({ t: "auth" }); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", border: `1px solid ${mgr ? "rgba(39,174,96,.4)" : "rgba(255,255,255,.1)"}`, borderRadius: 9, background: mgr ? "rgba(39,174,96,.1)" : "rgba(255,255,255,.04)", color: mgr ? "#2ecc71" : "#8892b0", cursor: "pointer", fontSize: 12, fontWeight: mgr ? 700 : 400, transition: "all .2s", minHeight: 36 }}>
            <I n={mgr ? "unlock" : "lock"} s={14} />{mob ? (mgr ? "מנהל" : "") : (mgr ? "מנהל פעיל" : "כניסת מנהל")}
          </button>
        </header>

        <main className="main-pad" style={{ flex: 1, padding: "20px 18px", maxWidth: 1320, margin: "0 auto", width: "100%" }}>
          {tab === "board"    && <BoardView    wk={wk} setWk={setWk} weekA={weekA} prevA={prevA} data={data} sysMap={sysColorMap} mgr={mgr} filterPerson={filterPerson} setFilterPerson={setFilterPerson} onAdd={openAdd} onEdit={a => setModal({ t: "assign", mode: "edit", a })} onDelete={deleteAssign} onCopy={copyFromPrev} onCSV={() => doExportCSV(wk, weekA)} onPrint={() => doPrint(wk, weekA, data.systems)} onView={a => setViewAssign(a)} />}
          {tab === "calendar" && <CalendarView wk={wk} setWk={setWk} weekA={weekA} prevA={prevA} data={data} sysMap={sysColorMap} mgr={mgr} onAdd={openAdd} onEdit={a => setModal({ t: "assign", mode: "edit", a })} onCopy={copyFromPrev} onView={a => setViewAssign(a)} onPlan={() => setPlanner(true)} />}
          {tab === "me"       && <MyView       wk={wk} setWk={setWk} weekA={weekA} data={data} sysMap={sysColorMap} myName={myName} setMyName={n => { setMyName(n); sessionStorage.setItem("myName", n); }} onView={a => setViewAssign(a)} />}
          {tab === "settings" && <SettingsView data={data} save={save} mgr={mgr} toast={toast} />}
        </main>

        <BottomNav tab={tab} setTab={setTab} TABS={TABS} />
        {mgr && (tab === "board" || tab === "calendar") && (
          <button className="fab" onClick={openAdd} style={{ position: "fixed", left: 20, bottom: 80, width: 56, height: 56, borderRadius: 28, background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", border: "none", color: "#fff", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(74,158,255,.5)", cursor: "pointer", zIndex: 150 }}>+</button>
        )}
        <ToastContainer toasts={toasts} />
      </div>
      {modal?.t === "assign" && <AssignModal mode={modal.mode} a={modal.a} wk={wk} data={data} sysMap={sysColorMap} onClose={() => setModal(null)} onSave={upsertAssign} />}
      {modal?.t === "auth"   && <AuthModal pin={data.pin} onOk={() => { setMgr(true); setModal(null); toast("ברוך הבא, מנהל", "info"); }} onClose={() => setModal(null)} />}
      {viewAssign && <AssignDetailModal a={viewAssign} sysMap={sysColorMap} mgr={mgr} onClose={() => setViewAssign(null)} onEdit={() => { setModal({ t: "assign", mode: "edit", a: viewAssign }); setViewAssign(null); }} onDelete={() => { deleteAssign(viewAssign.id); setViewAssign(null); }} />}
      {planner && <PlannerView wk={wk} data={data} sysMap={sysColorMap} weekA={weekA} onClose={() => setPlanner(false)} onSave={assignments => { save({ ...data, assignments }, "שבוע תוכנן ✓"); }} />}
    </MobileCtx.Provider>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <NavBtn onClick={() => setWk(adjW(wk, -1))}><I n="cR" s={15} /></NavBtn>
          <div style={{ textAlign: "center", minWidth: mob ? 120 : 165 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <span style={{ fontWeight: 700, fontSize: mob ? 15 : 17, color: "#fff" }}>שבוע {wk.split("-W")[1]}</span>
              {isToday && <span style={{ background: "rgba(74,158,255,0.2)", color: "#4a9eff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(74,158,255,0.3)" }}>עכשיו</span>}
            </div>
            <div style={{ fontSize: 10, color: "#8892b0", marginTop: 1 }}>{wLabel(wk)}</div>
          </div>
          <NavBtn onClick={() => setWk(adjW(wk, 1))}><I n="cL" s={15} /></NavBtn>
          {!isToday && <button onClick={() => setWk(wKey(new Date()))} style={{ padding: "4px 9px", border: "1px solid rgba(74,158,255,.3)", borderRadius: 8, background: "rgba(74,158,255,.1)", color: "#4a9eff", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>היום</button>}
        </div>
        {!mob && <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>{children}</div>}
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
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{active.map(a => { const c = sysMap[a.system] || pal(0); const tasks = a.tasks || []; return <div key={a.id}><Chip label={a.system} color={c.accent} />{tasks.length > 0 && <div style={{ fontSize: 10, color: "#8892b0", marginTop: 2, paddingRight: 2 }}>{tasks.slice(0,1).map((t,i)=><span key={i} style={{ color: c.accent, fontSize: 9 }}>✓ {t.length>24?t.slice(0,22)+"…":t}</span>)}</div>}</div>; })}</div>
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
  const [expanded, setExpanded] = useState({});
  const rows = mode === "sys" ? activeSys : activePeople;
  const WORK = DAYS.slice(0, 5);   // ראשון–חמישי
  const WKND = DAYS.slice(5);      // שישי–שבת
  const firstName = n => n.split(" ")[0];
  const MAX = 4;

  const getDayData = (rowA, key) => {
    const dayA = rowA.filter(a => !a.days || a.days.length === 0 || a.days.includes(key));
    const people = mode === "sys" ? [...new Set(dayA.flatMap(a => a.assignees || []))] : (dayA.length ? [rows[0]] : []);
    return { dayA, people };
  };

  return (
    <div style={{ width: "100%" }}>
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
function MyView({ wk, setWk, weekA, data, sysMap, myName, setMyName, onView }) {
  const todayKey      = todayDayKey();
  const isTodayWork   = isWorkDay(todayKey);
  const isCurrentWeek = wk === wKey(new Date());
  const mine      = myName ? weekA.filter(a => (a.assignees || []).includes(myName)) : [];
  const todayMine = isCurrentWeek && isTodayWork ? mine.filter(a => !a.days || a.days.length === 0 || a.days.includes(todayKey)) : [];
  const restMine  = mine.filter(a => !todayMine.includes(a));
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <WeekNav wk={wk} setWk={setWk} />
      <div style={{ marginBottom: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 13, padding: "14px 16px" }}>
        <label style={{ ...lbl, marginBottom: 10 }}>מי אתה?</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {getSections(data).map((sec, si) => sec.people.length === 0 ? null : (
            <div key={sec.name}>
              <div style={{ fontSize: 10, color: pal(si).accent, fontWeight: 700, letterSpacing: .5, marginBottom: 6, textTransform: "uppercase" }}>{sec.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sec.people.map(p => (
                  <button key={p} onClick={() => setMyName(myName === p ? "" : p)} style={{ padding: "7px 14px", border: `1px solid ${myName === p ? pal(si).accent : "rgba(255,255,255,0.1)"}`, borderRadius: 20, background: myName === p ? `${pal(si).accent}22` : "rgba(255,255,255,0.04)", color: myName === p ? pal(si).accent : "#8892b0", fontSize: 12, cursor: "pointer", fontWeight: myName === p ? 700 : 400 }}>
                    {myName === p && "● "}{p}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!myName && <div style={{ textAlign: "center", padding: "48px 24px", opacity: .5 }}><div style={{ fontSize: 40, marginBottom: 10 }}>👆</div><div style={{ fontSize: 15, fontWeight: 600, color: "#ccd6f6" }}>בחר את שמך</div></div>}
      {myName && mine.length === 0 && <div style={{ textAlign: "center", padding: "48px 24px", opacity: .5 }}><div style={{ fontSize: 40, marginBottom: 10 }}>📭</div><div style={{ fontSize: 15, fontWeight: 600, color: "#ccd6f6" }}>אין שיבוצים ל{myName} בשבוע זה</div></div>}
      {todayMine.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <I n="sun" s={14} /><span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>היום — {DAYS.find(d => d.key === todayKey)?.long}</span>
            <span style={{ background: "rgba(74,158,255,0.2)", color: "#4a9eff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(74,158,255,0.3)" }}>עכשיו</span>
          </div>
          {todayMine.map((a, i) => <AssignRow key={a.id} a={a} col={sysMap[a.system] || pal(i)} highlight onView={() => onView(a)} />)}
        </div>
      )}
      {myName && mine.length > 0 && todayMine.length === 0 && isCurrentWeek && isTodayWork && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#8892b0", textAlign: "center" }}>
          אין שיבוצים להיום ספציפית — בדוק שיבוצי השבוע למטה
        </div>
      )}
      {myName && restMine.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "#8892b0", fontWeight: 600, letterSpacing: .5, marginBottom: 10, textTransform: "uppercase" }}>שאר השבוע</div>
          {restMine.map((a, i) => <AssignRow key={a.id} a={a} col={sysMap[a.system] || pal(i + 2)} onView={() => onView(a)} />)}
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

/* ── SETTINGS ── */
function SettingsView({ data, save, mgr, toast }) {
  const [st, setSt]     = useState("sys");
  const [vSys, setVSys] = useState("");
  const [vP, setVP]     = useState("");
  const [vPin, setVPin] = useState("");
  if (!mgr) return (
    <div style={{ textAlign: "center", padding: "80px 24px", opacity: .4 }}>
      <div style={{ fontSize: 42, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#ccd6f6", marginBottom: 6 }}>הגדרות זמינות למנהלים בלבד</div>
      <div style={{ fontSize: 12, color: "#8892b0" }}>לחץ על ״כניסת מנהל״ למעלה</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 540, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
        {[{ id: "sys", l: "מערכות" }, { id: "ppl", l: "אנשי צוות" }, { id: "sec", l: "אבטחה" }].map(t => (
          <button key={t.id} onClick={() => setSt(t.id)} style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: st === t.id ? 700 : 400, background: st === t.id ? "rgba(74,158,255,0.2)" : "transparent", color: st === t.id ? "#4a9eff" : "#8892b0" }}>{t.l}</button>
        ))}
      </div>
      {st === "sys" && <SystemsEditor data={data} save={save} toast={toast} vSys={vSys} setVSys={setVSys} />}
      {st === "ppl" && <SectionsEditor data={data} save={save} toast={toast} />}
      {st === "sec" && (
        <div>
          <label style={lbl}>שנה קוד PIN של מנהל</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={vPin} onChange={e => setVPin(e.target.value)} type="password" placeholder="קוד PIN חדש (לפחות 4 תווים)" style={inp} />
            <PillBtn onClick={() => { if (vPin.length < 4) { toast("קוד חייב להיות לפחות 4 תווים", "error"); return; } save({ ...data, pin: vPin }, "קוד PIN עודכן ✓"); setVPin(""); }}>עדכן</PillBtn>
          </div>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.2)", borderRadius: 9, fontSize: 12, color: "#e67e22" }}>
            PIN נוכחי: {data.pin} · שמור את הקוד במקום בטוח
          </div>
        </div>
      )}
    </div>
  );
}
function SectionsEditor({ data, save, toast }) {
  const sections = getSections(data);
  const [vals, setVals] = useState(() => Object.fromEntries(sections.map(s => [s.name, ""])));

  const addPerson = (secName) => {
    const val = (vals[secName] || "").trim();
    if (!val) return;
    if (getAllPeople(data).includes(val)) { toast("שם כבר קיים", "error"); return; }
    const newSections = sections.map(s => s.name === secName ? { ...s, people: [...s.people, val] } : s);
    save({ ...data, sections: newSections }, "איש צוות נוסף");
    setVals(v => ({ ...v, [secName]: "" }));
  };

  const removePerson = (secName, person) => {
    const newSections = sections.map(s => s.name === secName ? { ...s, people: s.people.filter(p => p !== person) } : s);
    save({ ...data, sections: newSections }, "איש צוות הוסר");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {sections.map((sec, si) => {
        const c = pal(si);
        return (
          <div key={sec.name} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${c.accent}22`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: c.accent }}>{sec.name}</span>
              <span style={{ fontSize: 11, color: "#556", marginRight: "auto" }}>{sec.people.length} אנשים</span>
            </div>
            <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
              <input value={vals[sec.name] || ""} onChange={e => setVals(v => ({ ...v, [sec.name]: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPerson(sec.name)} placeholder="שם מלא" style={inp} />
              <PillBtn onClick={() => addPerson(sec.name)} color={c.accent}>הוסף</PillBtn>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sec.people.map(person => (
                <div key={person} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRight: `3px solid ${c.accent}`, borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
                  <span style={{ fontSize: 13 }}>{person}</span>
                  <button onClick={() => removePerson(sec.name, person)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", opacity: .7 }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".7"}><I n="trash" s={14} /></button>
                </div>
              ))}
              {sec.people.length === 0 && <div style={{ fontSize: 12, color: "#445", fontStyle: "italic", padding: "4px 2px" }}>אין אנשים במדור זה</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SystemsEditor({ data, save, toast, vSys, setVSys }) {
  const [colorPick, setColorPick] = useState(null); // system name being color-edited
  const sysColors = data.systemColors || {};
  const setColor = (sys, idx) => {
    save({ ...data, systemColors: { ...sysColors, [sys]: idx } });
    setColorPick(null);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 13 }}>
        <input value={vSys} onChange={e => setVSys(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (!vSys.trim() || data.systems.includes(vSys.trim())) { toast("שם כבר קיים", "error"); return; } save({ ...data, systems: [...data.systems, vSys.trim()] }, "מערכת נוספה"); setVSys(""); })()} placeholder="שם המערכת החדשה" style={inp} />
        <PillBtn onClick={() => { if (!vSys.trim() || data.systems.includes(vSys.trim())) { toast("שם כבר קיים", "error"); return; } save({ ...data, systems: [...data.systems, vSys.trim()] }, "מערכת נוספה"); setVSys(""); }} color="#4a9eff">הוסף</PillBtn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.systems.map((sys, i) => {
          const idx = sysColors[sys] ?? i;
          const col = pal(idx);
          const open = colorPick === sys;
          return (
            <div key={sys}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", background: "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,0.07)`, borderRight: `3px solid ${col.accent}`, borderRadius: open ? "9px 9px 0 0" : 9 }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
                <span style={{ fontSize: 13 }}>{sys}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => setColorPick(open ? null : sys)} title="בחר צבע"
                    style={{ width: 22, height: 22, borderRadius: "50%", background: col.accent, border: `2px solid ${open ? "#fff" : "transparent"}`, cursor: "pointer", flexShrink: 0, transition: "border .15s" }} />
                  <button onClick={() => save({ ...data, systems: data.systems.filter(s => s !== sys) }, "מערכת הוסרה")}
                    style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", opacity: .7 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = ".7"}><I n="trash" s={14} /></button>
                </div>
              </div>
              {open && (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 9px 9px", padding: "10px 13px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 10, color: "#8892b0", width: "100%", marginBottom: 4 }}>בחר צבע למערכת:</div>
                  {PALETTE.map((p, pi) => (
                    <button key={pi} onClick={() => setColor(sys, pi)} title={`צבע ${pi + 1}`}
                      style={{ width: 30, height: 30, borderRadius: "50%", background: p.accent, border: `3px solid ${idx === pi ? "#fff" : "transparent"}`, cursor: "pointer", transition: "border .15s", boxShadow: idx === pi ? `0 0 0 2px ${p.accent}` : "none" }} />
                  ))}
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

function PlannerView({ wk, data, sysMap, weekA, onClose, onSave }) {
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

  const ck  = (sys, col) => `${sys}__${col}`;
  const add = (sys, col, p) => setGrid(g => { const k = ck(sys,col); return { ...g, [k]: [...new Set([...(g[k]||[]),p])] }; });
  const rem = (sys, col, p) => setGrid(g => { const k = ck(sys,col); return { ...g, [k]: (g[k]||[]).filter(x=>x!==p) }; });

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
    onSave([...otherWeeks, ...newA]);
  };

  const hintText = selected
    ? `✓ נבחר: ${selected} — לחץ על תא לשיבוץ`
    : activeCell
    ? "כתוב משימה בתיבה הפתוחה • גרור/לחץ שמות מלמטה"
    : (mob ? "לחץ תא → כתוב משימה → בחר אנשים מלמטה" : "לחץ תא → כתוב משימה → גרור אנשים לתוכו");

  return (
    <div dir="rtl" style={{ position: "fixed", inset: 0, background: "#080c18", zIndex: 400, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI','Arial Hebrew',Arial,sans-serif", color: "#dde2f0" }}
      onClick={e => { if (e.target.dataset.outside) { setActiveCell(null); setSelected(null); } }}>

      {/* Header */}
      <div style={{ background: "#0f1525", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 8 }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "7px 12px", color: "#8892b0", cursor: "pointer", fontSize: 13 }}>✕ סגור</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
          <button onClick={() => goWeek(-1)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "5px 10px", color: "#8892b0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>›</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>שבוע {planWk.split("-W")[1]}</div>
            <div style={{ fontSize: 10, color: "#3d7fc4" }}>{wLabel(planWk)}</div>
          </div>
          <button onClick={() => goWeek(1)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "5px 10px", color: "#8892b0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>‹</button>
        </div>
        <button onClick={handleSave} style={{ background: "linear-gradient(135deg,#4a9eff,#3d7fc4)", border: "none", borderRadius: 9, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 3px 12px rgba(74,158,255,0.3)" }}>שמור ✓</button>
      </div>

      {/* Hint */}
      <div style={{ background: "rgba(61,127,196,0.08)", borderBottom: "1px solid rgba(61,127,196,0.15)", padding: "5px 14px", fontSize: 11, color: "#3d7fc4", textAlign: "center", flexShrink: 0 }}>{hintText}</div>

      {/* Body: sidebar (desktop) or grid-only (mobile) */}
      <div style={{ flex: 1, display: "flex", flexDirection: mob ? "column" : "row", overflow: "hidden" }}>

        {/* ── Desktop left sidebar ── */}
        {!mob && (
          <div style={{ width: 210, flexShrink: 0, overflowY: "auto", borderLeft: "2px solid rgba(255,255,255,0.07)", background: "#090e1c", padding: "14px 12px" }}>
            <div style={{ fontSize: 10, color: "#556", fontWeight: 700, letterSpacing: .5, marginBottom: 10, textTransform: "uppercase" }}>
              {selected ? `✓ ${selected}` : "גרור לתא ← שם"}
            </div>
            {getSections(data).map((sec, si) => sec.people.length === 0 ? null : (
              <div key={sec.name} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: pal(si).accent, fontWeight: 700, marginBottom: 6, borderBottom: `1px solid ${pal(si).accent}33`, paddingBottom: 4 }}>{sec.name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {sec.people.map(p => {
                    const isSel = selected === p;
                    return (
                      <div key={p} draggable
                        onDragStart={() => { setDragging(p); setSelected(null); }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSelected(isSel ? null : p)}
                        style={{ padding: "6px 10px", border: `2px solid ${isSel ? pal(si).accent : pal(si).accent + "33"}`, borderRadius: 8, background: isSel ? `${pal(si).accent}28` : "rgba(255,255,255,0.03)", color: isSel ? pal(si).accent : "#9aa0b0", fontSize: 12, cursor: "grab", fontWeight: isSel ? 700 : 400, userSelect: "none", boxShadow: isSel ? `0 0 0 2px ${pal(si).accent}33` : "none", transition: "all .12s", opacity: dragging === p ? .35 : 1 }}>
                        {isSel ? "✓ " : "⠿ "}{p}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Grid ── */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "10px 10px 4px" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 4, minWidth: mob ? 520 : 600 }}>
            <thead>
              <tr>
                <th style={{ ...PTH, textAlign: "right", paddingRight: 10, width: mob ? 80 : 110 }}>מערכת</th>
                {PLAN_COLS.map(c => (
                  <th key={c.key} style={{ ...PTH, background: c.narrow ? "rgba(61,127,196,0.14)" : "rgba(74,158,255,0.08)", color: c.narrow ? "#3d7fc4" : "#4a9eff", minWidth: c.narrow ? 58 : (mob ? 80 : 120), width: c.narrow ? 58 : undefined }}>
                    {c.narrow || mob ? c.short : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.systems.map(sys => {
                const col = sysMap[sys] || pal(0);
                return (
                  <tr key={sys}>
                    <td style={{ ...PTD, background: col.dark, borderRight: `3px solid ${col.accent}`, fontWeight: 700, fontSize: mob ? 10 : 12, color: col.accent, maxWidth: mob ? 80 : 110, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sys}</td>
                    {PLAN_COLS.map(c => {
                      const k = ck(sys, c.key);
                      const people = grid[k] || [];
                      const task = cellTasks[k] || "";
                      const isActive = activeCell === k;
                      const isOver = dragOver === k;
                      return (
                        <td key={c.key}
                          onDragOver={e => { e.preventDefault(); setDragOver(k); }}
                          onDragLeave={() => { if (dragOver === k) setDragOver(null); }}
                          onDrop={e => { e.preventDefault(); if (dragging) { add(sys, c.key, dragging); setDragging(null); setDragOver(null); if (!activeCell) activateCell(k); } }}
                          onClick={() => handleCellClick(sys, c.key)}
                          style={{ ...PTD, background: isActive ? `${col.accent}18` : isOver ? `${col.accent}28` : (c.narrow ? "rgba(61,127,196,0.05)" : (people.length || task ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)")), border: `2px solid ${isActive ? col.accent : isOver ? col.accent + "88" : (people.length || task ? col.accent + "33" : "rgba(255,255,255,0.07)")}`, verticalAlign: "top", cursor: selected ? "copy" : "pointer", minHeight: 44, width: c.narrow ? 58 : undefined, transition: "background .1s,border .1s", boxShadow: isActive ? `0 0 0 1px ${col.accent}44 inset` : "none" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {isActive
                              ? <input ref={taskInputRef} value={task} onChange={e => setCellTasks(t => ({ ...t, [k]: e.target.value }))}
                                  onClick={e => { if (!selected) e.stopPropagation(); }}
                                  placeholder="כתוב משימה..."
                                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: `1px solid ${col.accent}55`, borderRadius: 5, color: "#fff", fontSize: 11, padding: "4px 6px", outline: "none", fontFamily: "inherit" }} />
                              : task
                                ? <div style={{ fontSize: 10, color: col.accent, fontWeight: 600, lineHeight: 1.3, marginBottom: 2, opacity: .9 }}>✓ {task.length > 28 ? task.slice(0,26)+"…" : task}</div>
                                : <div style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", textAlign: "center", padding: "2px 0" }}>לחץ</div>
                            }
                            {people.map(p => (
                              <div key={p} onClick={e => { if (!selected) e.stopPropagation(); }} style={{ display: "flex", alignItems: "center", gap: 3, background: `${col.accent}1e`, border: `1px solid ${col.accent}44`, borderRadius: 5, padding: mob ? "2px 4px" : "3px 6px" }}>
                                <span style={{ fontSize: mob ? 10 : 11, color: col.accent, fontWeight: 600, flex: 1, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                                <button onClick={e => { e.stopPropagation(); rem(sys, c.key, p); }} style={{ background: "none", border: "none", color: col.accent, cursor: "pointer", fontSize: 13, padding: "0 1px", lineHeight: 1, opacity: .55, flexShrink: 0 }}>×</button>
                              </div>
                            ))}
                            {!people.length && !task && !isActive && (
                              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.07)", textAlign: "center" }}>—</div>
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

      {/* ── Mobile bottom panel (multi-row wrap) ── */}
      {mob && (
        <div style={{ flexShrink: 0, borderTop: "2px solid rgba(255,255,255,0.1)", background: "#090e1c", padding: "12px 12px 16px", overflowY: "auto", maxHeight: "40vh" }}>
          <div style={{ fontSize: 12, color: selected ? "#4a9eff" : "#667", fontWeight: 700, marginBottom: 10 }}>
            {selected ? `✓ ${selected} — לחץ תא לשיבוץ` : "בחר שם ← לחץ על תא"}
          </div>
          {getSections(data).map((sec, si) => sec.people.length === 0 ? null : (
            <div key={sec.name} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: pal(si).accent, fontWeight: 700, marginBottom: 6, opacity: .9 }}>
                {sec.name}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {sec.people.map(p => {
                  const isSel = selected === p;
                  return (
                    <div key={p}
                      onClick={() => setSelected(isSel ? null : p)}
                      style={{ padding: "9px 16px", border: `2px solid ${isSel ? pal(si).accent : pal(si).accent + "44"}`, borderRadius: 22, background: isSel ? `${pal(si).accent}33` : "rgba(255,255,255,0.05)", color: isSel ? pal(si).accent : "#aab", fontSize: 15, cursor: "pointer", fontWeight: isSel ? 700 : 500, userSelect: "none", boxShadow: isSel ? `0 0 0 3px ${pal(si).accent}33` : "none", transition: "all .12s", minHeight: 40, display: "flex", alignItems: "center" }}>
                      {isSel ? "✓ " : ""}{p}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const PTH = { padding: "7px 6px", textAlign: "center", borderRadius: 6, fontWeight: 600, background: "rgba(255,255,255,0.04)", color: "#8892b0" };
const PTD = { padding: "4px 4px", borderRadius: 6, fontSize: 11 };

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

/* ── AUTH MODAL ── */
function AuthModal({ pin, onOk, onClose }) {
  const [v, setV]     = useState("");
  const [err, setErr] = useState(false);
  const try_ = () => { if (v === pin) { onOk(); } else { setErr(true); setV(""); setTimeout(() => setErr(false), 1500); } };
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
