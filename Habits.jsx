import { useState, useEffect, useCallback, useRef } from "react";

// ─── STORAGE HELPERS ───────────────────────────────────────────────────────────
const STORAGE_KEY = "habittracker_v1";

async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : { entries: [], settings: {} };
  } catch { return { entries: [], settings: {} }; }
}

async function saveData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "work",    label: "Trabajo",   emoji: "💼", color: "#3b82f6",
    options: ["Trabajando", "Reunión", "Estudiando", "Planificando", "Emails"] },
  { id: "health",  label: "Ejercicio", emoji: "🏃", color: "#10b981",
    options: ["Ejercitando", "Caminando", "Estirando", "Descansando activo"] },
  { id: "food",    label: "Comida",    emoji: "🍽️", color: "#f59e0b",
    options: ["Desayunando", "Almorzando", "Cenando", "Snack", "Tomando agua"] },
  { id: "rest",    label: "Descanso",  emoji: "😴", color: "#8b5cf6",
    options: ["Durmiendo", "Siesta", "Relajándome", "Meditando"] },
  { id: "hobby",   label: "Hobbies",   emoji: "🎮", color: "#ec4899",
    options: ["Juegos", "Música", "Lectura", "Arte", "Series/Películas"] },
  { id: "other",   label: "Otro",      emoji: "✨", color: "#6b7280",
    options: ["Transporte", "Compras", "Social", "Sin hacer nada"] },
];

const MOODS = ["😫","😕","😐","🙂","😄"];

function fmt(date) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit", minute: "2-digit", day: "2-digit",
    month: "short",
  }).format(new Date(date));
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs/24)}d`;
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
export default function HabitTracker() {
  const [data, setData]         = useState({ entries: [], settings: {} });
  const [view, setView]         = useState("home"); // home | checkin | history | stats
  const [checkin, setCheckin]   = useState({ cat: null, option: null, note: "", mood: null });
  const [notifPerm, setNotifPerm] = useState("default");
  const [pulse, setPulse]       = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [nextIn, setNextIn]     = useState(null);
  const intervalRef             = useRef(null);
  const checkinTimeRef          = useRef(null);

  // Load persisted data
  useEffect(() => {
    loadData().then(d => { setData(d); setLoaded(true); });
  }, []);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window) setNotifPerm(Notification.permission);
  }, []);

  const requestNotif = async () => {
    if ("Notification" in window) {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
    }
  };

  // Hourly notification timer
  useEffect(() => {
    if (!loaded) return;
    const scheduleNext = () => {
      const now = new Date();
      const msToNext = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000;
      setNextIn(msToNext);
      return msToNext;
    };

    const fireCheckin = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 3000);
      if (notifPerm === "granted") {
        try {
          new Notification("⏰ ¿Qué estás haciendo?", {
            body: "Es hora de registrar tu actividad",
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌿</text></svg>",
          });
        } catch {}
      }
      setView("checkin");
      setCheckin({ cat: null, option: null, note: "", mood: null });
    };

    const ms = scheduleNext();
    const timeout = setTimeout(() => {
      fireCheckin();
      intervalRef.current = setInterval(() => {
        fireCheckin();
        scheduleNext();
      }, 3600000);
    }, ms);

    const countdownInterval = setInterval(() => {
      setNextIn(p => p !== null ? Math.max(0, p - 1000) : null);
    }, 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(intervalRef.current);
      clearInterval(countdownInterval);
    };
  }, [loaded, notifPerm]);

  const saveEntry = useCallback(async () => {
    if (!checkin.cat) return;
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      category: checkin.cat,
      option: checkin.option,
      note: checkin.note.trim(),
      mood: checkin.mood,
    };
    const newData = { ...data, entries: [entry, ...data.entries] };
    setData(newData);
    await saveData(newData);
    setView("home");
  }, [checkin, data]);

  const deleteEntry = useCallback(async (id) => {
    const newData = { ...data, entries: data.entries.filter(e => e.id !== id) };
    setData(newData);
    await saveData(newData);
  }, [data]);

  const getCat = (id) => CATEGORIES.find(c => c.id === id);

  // Stats calculations
  const stats = (() => {
    const counts = {};
    CATEGORIES.forEach(c => counts[c.id] = 0);
    data.entries.forEach(e => { if (counts[e.category] !== undefined) counts[e.category]++; });
    const total = data.entries.length;
    const today = data.entries.filter(e =>
      new Date(e.timestamp).toDateString() === new Date().toDateString()
    ).length;
    const avgMood = data.entries.filter(e => e.mood !== null).length
      ? (data.entries.filter(e=>e.mood!==null).reduce((s,e)=>s+e.mood,0) /
         data.entries.filter(e=>e.mood!==null).length).toFixed(1)
      : null;
    return { counts, total, today, avgMood };
  })();

  const fmtCountdown = (ms) => {
    if (!ms) return "--:--";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  if (!loaded) return (
    <div style={styles.shell}>
      <div style={{ margin: "auto", color: "#a3e635", fontSize: 32 }}>🌿</div>
    </div>
  );

  // ── CHECK-IN SCREEN ──────────────────────────────────────────────────────────
  if (view === "checkin") return (
    <div style={styles.shell}>
      <div style={styles.page}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏰</div>
          <div style={styles.heading}>¿Qué estás haciendo?</div>
          <div style={styles.sub}>{new Date().toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit" })}</div>
        </div>

        {/* Category grid */}
        <div style={styles.label}>Categoría</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCheckin(p => ({ ...p, cat: cat.id, option: null }))}
              style={{
                ...styles.catBtn,
                background: checkin.cat === cat.id ? cat.color + "33" : "#1a1f2e",
                border: `2px solid ${checkin.cat === cat.id ? cat.color : "#2a3040"}`,
                color: checkin.cat === cat.id ? cat.color : "#6b7280",
              }}>
              <div style={{ fontSize: 22 }}>{cat.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{cat.label}</div>
            </button>
          ))}
        </div>

        {/* Quick options */}
        {checkin.cat && (
          <>
            <div style={styles.label}>Actividad rápida</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {getCat(checkin.cat).options.map(opt => (
                <button key={opt} onClick={() => setCheckin(p => ({ ...p, option: opt }))}
                  style={{
                    ...styles.chip,
                    background: checkin.option === opt ? getCat(checkin.cat).color : "#1a1f2e",
                    color: checkin.option === opt ? "#fff" : "#9ca3af",
                    border: `1px solid ${checkin.option === opt ? getCat(checkin.cat).color : "#2a3040"}`,
                  }}>
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Free text */}
        <div style={styles.label}>Nota libre (opcional)</div>
        <textarea
          value={checkin.note}
          onChange={e => setCheckin(p => ({ ...p, note: e.target.value }))}
          placeholder="Ej: Trabajé en el proyecto X, comí sano, etc."
          style={styles.textarea}
          rows={2}
        />

        {/* Mood */}
        <div style={styles.label}>Estado de ánimo</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {MOODS.map((m, i) => (
            <button key={i} onClick={() => setCheckin(p => ({ ...p, mood: i }))}
              style={{
                fontSize: 26, background: "none", border: "none", cursor: "pointer",
                opacity: checkin.mood === null ? 0.5 : checkin.mood === i ? 1 : 0.3,
                transform: checkin.mood === i ? "scale(1.3)" : "scale(1)",
                transition: "all 0.15s",
              }}>
              {m}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setView("home")} style={styles.btnSec}>Cancelar</button>
          <button onClick={saveEntry} disabled={!checkin.cat}
            style={{ ...styles.btnPri, opacity: checkin.cat ? 1 : 0.4 }}>
            Guardar ✓
          </button>
        </div>
      </div>
    </div>
  );

  // ── HISTORY SCREEN ───────────────────────────────────────────────────────────
  if (view === "history") return (
    <div style={styles.shell}>
      <div style={styles.page}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setView("home")} style={styles.back}>←</button>
          <div style={styles.heading}>Historial</div>
          <div style={{ flex: 1 }} />
          <span style={styles.badge}>{data.entries.length}</span>
        </div>
        {data.entries.length === 0 && (
          <div style={{ textAlign: "center", color: "#6b7280", marginTop: 60 }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <div>Sin registros aún</div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.entries.map(entry => {
            const cat = getCat(entry.category);
            return (
              <div key={entry.id} style={{ ...styles.card, borderLeft: `3px solid ${cat?.color}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{cat?.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: cat?.color, fontWeight: 700, fontSize: 13 }}>{cat?.label}</span>
                      {entry.option && <span style={styles.pill}>{entry.option}</span>}
                      {entry.mood !== null && <span style={{ fontSize: 16 }}>{MOODS[entry.mood]}</span>}
                    </div>
                    {entry.note && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{entry.note}</div>}
                    <div style={{ color: "#4b5563", fontSize: 11, marginTop: 4 }}>{fmt(entry.timestamp)} · {timeAgo(entry.timestamp)}</div>
                  </div>
                  <button onClick={() => deleteEntry(entry.id)}
                    style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", fontSize: 16 }}>
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── STATS SCREEN ─────────────────────────────────────────────────────────────
  if (view === "stats") return (
    <div style={styles.shell}>
      <div style={styles.page}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setView("home")} style={styles.back}>←</button>
          <div style={styles.heading}>Estadísticas</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total registros", value: stats.total, emoji: "📊" },
            { label: "Hoy", value: stats.today, emoji: "📅" },
            { label: "Ánimo promedio", value: stats.avgMood ? `${MOODS[Math.round(stats.avgMood)]} ${stats.avgMood}` : "—", emoji: "😊" },
            { label: "Categorías", value: CATEGORIES.length, emoji: "🏷️" },
          ].map(s => (
            <div key={s.label} style={styles.statCard}>
              <div style={{ fontSize: 24 }}>{s.emoji}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#a3e635" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={styles.label}>Distribución por categoría</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CATEGORIES.map(cat => {
            const count = stats.counts[cat.id] || 0;
            const pct = stats.total ? Math.round(count / stats.total * 100) : 0;
            return (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18, width: 24 }}>{cat.emoji}</span>
                <span style={{ color: "#9ca3af", fontSize: 12, width: 70 }}>{cat.label}</span>
                <div style={{ flex: 1, background: "#1a1f2e", borderRadius: 99, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: cat.color, borderRadius: 99, transition: "width 0.5s" }} />
                </div>
                <span style={{ color: "#6b7280", fontSize: 12, width: 36, textAlign: "right" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── HOME SCREEN ───────────────────────────────────────────────────────────────
  const lastEntry = data.entries[0];
  const lastCat = lastEntry ? getCat(lastEntry.category) : null;

  return (
    <div style={styles.shell}>
      {/* Pulse ring when hourly check-in fires */}
      {pulse && <div style={styles.pulseRing} />}

      <div style={styles.page}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, color: "#4b5563", letterSpacing: 3, fontWeight: 700 }}>HABIT TRACKER</div>
            <div style={styles.heading}>Tu día 🌿</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#4b5563" }}>próximo check-in</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#a3e635", fontVariantNumeric: "tabular-nums" }}>
              {fmtCountdown(nextIn)}
            </div>
          </div>
        </div>

        {/* Notification permission banner */}
        {notifPerm !== "granted" && (
          <div style={{ ...styles.card, borderColor: "#f59e0b", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <div style={{ flex: 1, fontSize: 13, color: "#d1d5db" }}>
              Activá notificaciones para que te avise cada hora
            </div>
            <button onClick={requestNotif} style={{ ...styles.btnPri, padding: "6px 12px", fontSize: 12 }}>
              Activar
            </button>
          </div>
        )}

        {/* Manual check-in button */}
        <button onClick={() => { setView("checkin"); setCheckin({ cat: null, option: null, note: "", mood: null }); }}
          style={{
            ...styles.bigBtn,
            animation: pulse ? "ripple 0.6s ease" : "none",
          }}>
          <span style={{ fontSize: 32 }}>✏️</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Registrar ahora</div>
            <div style={{ fontSize: 12, color: "#86efac", opacity: 0.8 }}>¿Qué estás haciendo?</div>
          </div>
        </button>

        {/* Last entry */}
        {lastEntry && (
          <div style={{ marginBottom: 20 }}>
            <div style={styles.label}>Último registro</div>
            <div style={{ ...styles.card, borderLeft: `3px solid ${lastCat?.color}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>{lastCat?.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: lastCat?.color, fontWeight: 700 }}>{lastCat?.label}</span>
                    {lastEntry.option && <span style={styles.pill}>{lastEntry.option}</span>}
                    {lastEntry.mood !== null && <span>{MOODS[lastEntry.mood]}</span>}
                  </div>
                  {lastEntry.note && <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{lastEntry.note}</div>}
                  <div style={{ color: "#374151", fontSize: 11, marginTop: 2 }}>{timeAgo(lastEntry.timestamp)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Today summary */}
        {stats.today > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={styles.label}>Hoy — {stats.today} registros</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIES.filter(c => stats.counts[c.id] > 0).map(cat => (
                <div key={cat.id} style={{
                  background: cat.color + "22", border: `1px solid ${cat.color}44`,
                  borderRadius: 10, padding: "6px 12px", display: "flex", gap: 6, alignItems: "center",
                }}>
                  <span>{cat.emoji}</span>
                  <span style={{ color: cat.color, fontSize: 12, fontWeight: 700 }}>{stats.counts[cat.id]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 16 }}>
          <button onClick={() => setView("history")} style={styles.navBtn}>
            📋 Historial
          </button>
          <button onClick={() => setView("stats")} style={styles.navBtn}>
            📊 Stats
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1117; }
        textarea { font-family: inherit; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a3040; border-radius: 4px; }
        @keyframes ripple {
          0% { box-shadow: 0 0 0 0 rgba(163,230,53,0.4); }
          100% { box-shadow: 0 0 0 30px rgba(163,230,53,0); }
        }
        @keyframes pulseRing {
          0% { transform: translate(-50%,-50%) scale(0.5); opacity: 0.8; }
          100% { transform: translate(-50%,-50%) scale(2); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
const styles = {
  shell: {
    minHeight: "100vh",
    background: "#0d1117",
    fontFamily: "'Sora', sans-serif",
    color: "#e2e8f0",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
  },
  page: {
    maxWidth: 480,
    width: "100%",
    margin: "0 auto",
    padding: "24px 16px 32px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    animation: "fadeIn 0.3s ease",
  },
  heading: {
    fontSize: 22,
    fontWeight: 800,
    color: "#f1f5f9",
  },
  sub: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#4b5563",
    fontWeight: 700,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    background: "#131820",
    border: "1px solid #1e2533",
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 8,
  },
  statCard: {
    background: "#131820",
    border: "1px solid #1e2533",
    borderRadius: 14,
    padding: 16,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  catBtn: {
    borderRadius: 12,
    padding: "12px 8px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    transition: "all 0.15s",
    fontFamily: "inherit",
  },
  chip: {
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 600,
    transition: "all 0.15s",
  },
  pill: {
    background: "#1e2533",
    color: "#9ca3af",
    borderRadius: 20,
    padding: "2px 8px",
    fontSize: 11,
  },
  textarea: {
    width: "100%",
    background: "#131820",
    border: "1px solid #1e2533",
    borderRadius: 12,
    color: "#e2e8f0",
    padding: "10px 14px",
    fontSize: 14,
    resize: "none",
    outline: "none",
    marginBottom: 16,
  },
  bigBtn: {
    width: "100%",
    background: "linear-gradient(135deg, #166534, #15803d)",
    border: "none",
    borderRadius: 18,
    padding: "20px 24px",
    color: "#dcfce7",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    fontFamily: "inherit",
    textAlign: "left",
    transition: "transform 0.15s",
  },
  btnPri: {
    flex: 1,
    background: "#a3e635",
    color: "#1a2e05",
    border: "none",
    borderRadius: 12,
    padding: "13px",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnSec: {
    flex: 1,
    background: "#1a1f2e",
    color: "#6b7280",
    border: "1px solid #2a3040",
    borderRadius: 12,
    padding: "13px",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  navBtn: {
    flex: 1,
    background: "#131820",
    border: "1px solid #1e2533",
    color: "#9ca3af",
    borderRadius: 12,
    padding: "12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  back: {
    background: "#131820",
    border: "1px solid #1e2533",
    color: "#9ca3af",
    borderRadius: 10,
    width: 36,
    height: 36,
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "inherit",
  },
  badge: {
    background: "#a3e635",
    color: "#1a2e05",
    borderRadius: 20,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  pulseRing: {
    position: "fixed",
    top: "50%", left: "50%",
    width: 200, height: 200,
    borderRadius: "50%",
    border: "3px solid #a3e635",
    animation: "pulseRing 1s ease-out forwards",
    pointerEvents: "none",
    zIndex: 50,
  },
};

