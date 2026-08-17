import React, { useMemo, useState } from "react";

const C = {
  bg: "#0F1923",
  panel: "#16222E",
  panelAlt: "#1C2B38",
  border: "#28394A",
  text: "#E7EEF3",
  textDim: "#8FA3B3",
  teal: "#00C9A7",
  yellow: "#F5A623",
  red: "#E84545",
};

const MUSCLES = [
  { key: "quads", label: "Quads" },
  { key: "hamstrings", label: "Hamstrings" },
  { key: "glutes", label: "Glutes" },
  { key: "chest", label: "Chest" },
  { key: "back", label: "Back" },
  { key: "shoulders", label: "Shoulders" },
  { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" },
  { key: "calves", label: "Calves" },
  { key: "core", label: "Core" },
];

const GOALS = {
  hypertrophy: { label: "Hypertrophy (Size)", min: 10, max: 20, plyoMin: 0, plyoMax: 4 },
  strength: { label: "Strength", min: 8, max: 15, plyoMin: 0, plyoMax: 4 },
  powerlifting: { label: "Powerlifting", min: 6, max: 12, plyoMin: 0, plyoMax: 2 },
  endurance: { label: "Muscular Endurance", min: 15, max: 25, plyoMin: 0, plyoMax: 4 },
  athleticism: { label: "Athleticism / Sport (Power & Speed)", min: 10, max: 16, plyoMin: 3, plyoMax: 6 },
};

/**
 * Props (all data now comes from Supabase via App.jsx, not local state):
 *  - exercises: [{ id, name, type, primary_muscle, secondary_muscle }] from `exercises` table
 *  - goalKey, daysPerWeek: from the user's `training_plans` row
 *  - onGoalChange(goalKey), onDaysChange(n)
 *  - plan: { [dayIndex]: [{ id, exercise_id, sets, reps, weight }] } from `plan_entries`
 *  - onAddExercise(dayIndex, exercise)
 *  - onUpdateEntry(entryId, field, value)
 *  - onRemoveEntry(entryId)
 *  - onReorderEntries(dayIndex, orderedEntryIds) -> parent persists order_index
 *  - onRequestExercise({ exercise_name, notes, suggested_muscle }) -> writes to exercise_submissions
 */
export default function VolumeBuilder({
  exercises,
  goalKey,
  daysPerWeek,
  onGoalChange,
  onDaysChange,
  plan,
  onAddExercise,
  onUpdateEntry,
  onRemoveEntry,
  onReorderEntries,
  onRequestExercise,
}) {
  const [activeDay, setActiveDay] = useState(0);
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [reqMuscle, setReqMuscle] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [draggedEntryId, setDraggedEntryId] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");

  const EX_BY_ID = useMemo(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises]
  );

  const goal = GOALS[goalKey];
  const days = Array.from({ length: daysPerWeek }, (_, i) => i);

  const filteredExercises = exercises.filter((ex) => {
    if (muscleFilter !== "all" && (ex.primary_muscle || "").toLowerCase() !== muscleFilter) return false;
    if (typeFilter !== "all" && ex.type !== typeFilter) return false;
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tally = useMemo(() => {
    const t = Object.fromEntries(MUSCLES.map((m) => [m.key, { resistance: 0, plyo: 0 }]));
    Object.values(plan).forEach((entries) => {
      (entries || []).forEach((entry) => {
        const ex = EX_BY_ID[entry.exercise_id];
        if (!ex) return;
        const bucket = ex.type === "plyometric" ? "plyo" : "resistance";
        // Normalize casing defensively — muscle values may arrive as "Back",
        // "back", or otherwise depending on data source (manual entry vs
        // AI-enriched submissions), so match against the lowercase tally keys.
        const primaryKey = (ex.primary_muscle || "").toLowerCase();
        const secondaryKey = (ex.secondary_muscle || "").toLowerCase();
        if (t[primaryKey]) {
          t[primaryKey][bucket] += entry.sets;
        }
        if (secondaryKey && t[secondaryKey]) {
          t[secondaryKey][bucket] += entry.sets * 0.5;
        }
      });
    });
    return t;
  }, [plan, EX_BY_ID]);

  const statusFor = (total, min, max) => {
    if (total === 0) return { label: "No work", color: C.textDim };
    if (total < min) return { label: "Under MED", color: C.yellow };
    if (total > max) return { label: "Over range", color: C.red };
    return { label: "In range", color: C.teal };
  };

  const sortedEntries = (dayIndex) =>
    (plan[dayIndex] || [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const handleDrop = (dayIndex, targetEntryId) => {
    if (!draggedEntryId || draggedEntryId === targetEntryId) {
      setDraggedEntryId(null);
      return;
    }
    const ordered = sortedEntries(dayIndex).map((e) => e.id);
    const from = ordered.indexOf(draggedEntryId);
    const to = ordered.indexOf(targetEntryId);
    if (from === -1 || to === -1) {
      setDraggedEntryId(null);
      return;
    }
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    setDraggedEntryId(null);
    // Parent is responsible for persisting the new order_index values
    // (e.g. bulk-updating plan_entries.order_index) since this component
    // doesn't own the data source.
    if (onReorderEntries) onReorderEntries(dayIndex, ordered);
  };

  const buildSummaryText = () => {
    const lines = [`Weekly Workout Plan — ${goal.label}`, ""];
    days.forEach((d) => {
      const entries = sortedEntries(d);
      lines.push(`Day ${d + 1}`);
      if (entries.length === 0) {
        lines.push("  (no exercises added)");
      } else {
        entries.forEach((entry) => {
          const ex = EX_BY_ID[entry.exercise_id];
          if (!ex) return;
          const weightStr = entry.weight ? ` @ ${entry.weight} lbs` : "";
          lines.push(`  • ${ex.name} — ${entry.sets} x ${entry.reps}${weightStr}`);
        });
      }
      lines.push("");
    });
    lines.push("Weekly muscle volume:");
    MUSCLES.forEach((m) => {
      const data = tally[m.key];
      const total = data.resistance + data.plyo;
      if (total > 0) {
        lines.push(`  ${m.label}: ${total.toFixed(1)} sets`);
      }
    });
    return lines.join("\n");
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText());
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch {
      setCopyStatus("Copy failed — select text manually");
      setTimeout(() => setCopyStatus(""), 3000);
    }
  };

  const emailSummary = () => {
    const body = encodeURIComponent(buildSummaryText());
    window.location.href = `mailto:?subject=${encodeURIComponent("Weekly Workout Plan")}&body=${body}`;
  };

  const submitRequest = (e) => {
    e.preventDefault();
    if (!reqName.trim()) return;
    onRequestExercise({
      exercise_name: reqName.trim(),
      notes: reqNotes.trim() || null,
      suggested_muscle: reqMuscle || null,
    });
    setReqName("");
    setReqNotes("");
    setReqMuscle("");
    setShowRequestForm(false);
  };

  const s = styles;

  return (
    <div className="vb-app" style={s.app}>
      <style>{`
        .vb-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
          gap: 16px;
        }
        @media (max-width: 720px) {
          .vb-grid {
            grid-template-columns: 1fr;
          }
        }
        .vb-controls-row {
          display: flex;
          gap: 20px;
          align-items: flex-end;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        @media (max-width: 480px) {
          .vb-app { padding: 12px !important; }
          .vb-controls-row { gap: 12px; }
          .vb-controls-row > div { flex: 1 1 100%; }
          .vb-target { margin-left: 0 !important; }
        }
        @media print {
          body * { visibility: hidden; }
          .vb-print-area, .vb-print-area * { visibility: visible; }
          .vb-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            color: #000;
          }
        }
      `}</style>
      <div style={s.header}>
        <h1 style={s.title}>Volume Builder</h1>
        <div style={s.subtitle}>
          MED-based weekly set tracking, per muscle group — build your week and watch the tally update live.
        </div>
      </div>

      <div className="vb-controls-row">
        <div>
          <div style={s.label}>Training goal</div>
          <select style={s.select} value={goalKey} onChange={(e) => onGoalChange(e.target.value)}>
            {Object.entries(GOALS).map(([k, g]) => (
              <option key={k} value={k}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={s.label}>Days per week</div>
          <select
            style={s.select}
            value={daysPerWeek}
            onChange={(e) => {
              const n = Number(e.target.value);
              onDaysChange(n);
              if (activeDay >= n) setActiveDay(0);
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>
        <div className="vb-target" style={{ fontSize: 12, color: C.textDim, marginLeft: "auto", minWidth: 0 }}>
          Target: <span style={{ color: C.teal, fontWeight: 700 }}>{goal.min}–{goal.max} sets</span> / muscle / week
          {goal.plyoMax > 0 && (
            <> · Plyo: <span style={{ color: C.teal, fontWeight: 700 }}>{goal.plyoMin}–{goal.plyoMax} sets</span></>
          )}
        </div>
      </div>

      {/* PLAN — full-width banner */}
      <div style={{ ...s.panel, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ ...s.panelTitle, marginBottom: 0 }}>Weekly plan</div>
          <button style={s.summaryBtn} onClick={() => setShowSummary(true)}>
            View & export
          </button>
        </div>
        <div style={s.dayTabs}>
          {days.map((d) => (
            <div key={d} style={s.dayTab(d === activeDay)} onClick={() => setActiveDay(d)}>
              Day {d + 1}
            </div>
          ))}
        </div>
        {(plan[activeDay] || []).length === 0 && (
          <div style={{ color: C.textDim, fontSize: 13 }}>
            No exercises added to Day {activeDay + 1} yet. Add some from the library below.
          </div>
        )}
        {sortedEntries(activeDay).map((entry) => {
          const ex = EX_BY_ID[entry.exercise_id];
          if (!ex) return null;
          return (
            <div
              key={entry.id}
              style={{
                ...s.planEntry,
                opacity: draggedEntryId === entry.id ? 0.5 : 1,
                cursor: "grab",
              }}
              draggable
              onDragStart={() => setDraggedEntryId(entry.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(activeDay, entry.id)}
              onDragEnd={() => setDraggedEntryId(null)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: C.textDim, fontSize: 12 }}>⠿</span>
                  {ex.name}
                </div>
                <button style={s.removeBtn} onClick={() => onRemoveEntry(entry.id)}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 11, color: C.textDim }}>
                  Sets{" "}
                  <input
                    style={s.numInput}
                    type="number"
                    value={entry.sets}
                    onChange={(e) => onUpdateEntry(entry.id, "sets", Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
                <label style={{ fontSize: 11, color: C.textDim }}>
                  Reps{" "}
                  <input
                    style={s.numInput}
                    type="number"
                    value={entry.reps}
                    onChange={(e) => onUpdateEntry(entry.id, "reps", Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
                <label style={{ fontSize: 11, color: C.textDim }}>
                  Weight{" "}
                  <input
                    style={{ ...s.numInput, width: 60 }}
                    type="number"
                    step="0.5"
                    placeholder="lbs"
                    value={entry.weight ?? ""}
                    onChange={(e) =>
                      onUpdateEntry(entry.id, "weight", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="vb-grid">
        {/* LIBRARY */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Exercise library</div>
          <input
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...s.select, width: "100%", marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <select style={{ ...s.select, flex: 1 }} value={muscleFilter} onChange={(e) => setMuscleFilter(e.target.value)}>
              <option value="all">All muscles</option>
              {MUSCLES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <select style={{ ...s.select, flex: 1 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              <option value="resistance">Resistance</option>
              <option value="plyometric">Plyometric</option>
            </select>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {filteredExercises.map((ex) => (
              <div key={ex.id} style={s.exRow}>
                <div>
                  <div>{ex.name}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>
                    {MUSCLES.find((m) => m.key === (ex.primary_muscle || "").toLowerCase())?.label}
                    {ex.secondary_muscle && ` · +${MUSCLES.find((m) => m.key === (ex.secondary_muscle || "").toLowerCase())?.label}`}
                    {ex.type === "plyometric" ? " · Plyo" : ""}
                  </div>
                </div>
                <button style={s.addBtn} onClick={() => onAddExercise(activeDay, ex)}>Add</button>
              </div>
            ))}
            {filteredExercises.length === 0 && (
              <div style={{ color: C.textDim, fontSize: 13 }}>No exercises match.</div>
            )}
          </div>

          {!showRequestForm ? (
            <button style={s.requestBtn} onClick={() => setShowRequestForm(true)}>
              + Request an exercise
            </button>
          ) : (
            <form onSubmit={submitRequest} style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <input
                placeholder="Exercise name"
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
                required
                style={{ ...s.select, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
              />
              <select
                style={{ ...s.select, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
                value={reqMuscle}
                onChange={(e) => setReqMuscle(e.target.value)}
              >
                <option value="">Suggested muscle (optional)</option>
                {MUSCLES.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              <textarea
                placeholder="Notes (optional)"
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                style={{ ...s.select, width: "100%", marginBottom: 6, boxSizing: "border-box", minHeight: 50, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button type="submit" style={s.addBtn}>Submit</button>
                <button type="button" style={s.removeTextBtn} onClick={() => setShowRequestForm(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>

        {/* TALLY */}
        <div style={s.panel}>
          <div style={s.panelTitle}>Weekly muscle volume</div>
          {MUSCLES.map((m) => {
            const data = tally[m.key];
            const total = data.resistance + data.plyo;
            const status = statusFor(total, goal.min, goal.max);
            const pct = Math.min(100, (total / goal.max) * 100);
            return (
              <div key={m.key} style={s.muscleRow}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{m.label}</span>
                  <span style={{ color: status.color, fontWeight: 700 }}>
                    {total.toFixed(1)} sets — {status.label}
                  </span>
                </div>
                <div style={s.barTrack}>
                  <div style={{ width: `${pct}%`, background: status.color, height: "100%" }} />
                </div>
                {goal.plyoMax > 0 && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    Plyo: {data.plyo.toFixed(1)} / {goal.plyoMin}-{goal.plyoMax} target
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showSummary && (
        <div style={s.modalOverlay} onClick={() => setShowSummary(false)}>
          <div style={s.modalPanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={s.panelTitle}>Weekly summary</div>
              <button style={s.removeBtn} onClick={() => setShowSummary(false)}>✕</button>
            </div>
            <div className="vb-print-area" style={s.summaryText}>
              {buildSummaryText()}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button style={s.addBtn} onClick={copySummary}>Copy to clipboard</button>
              <button style={s.addBtn} onClick={() => window.print()}>Print</button>
              <button style={s.addBtn} onClick={emailSummary}>Email</button>
              {copyStatus && <span style={{ fontSize: 12, color: C.teal, alignSelf: "center" }}>{copyStatus}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    background: C.bg,
    color: C.text,
    minHeight: "100vh",
    padding: 24,
    fontFamily: "'Space Grotesk', sans-serif",
    boxSizing: "border-box",
  },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 24 },
  subtitle: { color: C.textDim, fontSize: 13, marginTop: 4 },
  label: { fontSize: 11, color: C.textDim, marginBottom: 4 },
  controlsRow: { display: "flex", gap: 20, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" },
  select: {
    background: C.panelAlt,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontFamily: "inherit",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(260px,1.3fr) minmax(260px,1fr)",
    gap: 16,
  },
  panel: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 },
  panelTitle: {
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: C.textDim,
    marginBottom: 12,
  },
  exRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 8,
    background: C.panelAlt,
    marginBottom: 6,
    fontSize: 13,
  },
  addBtn: {
    background: C.teal,
    color: "#04241d",
    border: "none",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  requestBtn: {
    marginTop: 10,
    width: "100%",
    background: "transparent",
    color: C.teal,
    border: `1px dashed ${C.teal}`,
    borderRadius: 8,
    padding: "8px 0",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  removeTextBtn: {
    background: "transparent",
    color: C.textDim,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
  },
  dayTabs: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  dayTab: (active) => ({
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? C.teal : C.panelAlt,
    color: active ? "#04241d" : C.textDim,
    border: `1px solid ${active ? C.teal : C.border}`,
  }),
  planEntry: { background: C.panelAlt, borderRadius: 8, padding: "10px 12px", marginBottom: 8 },
  numInput: {
    width: 48,
    background: C.bg,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "3px 6px",
    fontSize: 12,
    textAlign: "center",
    fontFamily: "inherit",
  },
  removeBtn: { background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 14 },
  muscleRow: { marginBottom: 14 },
  barTrack: { background: C.bg, borderRadius: 6, height: 8, overflow: "hidden", marginTop: 4, border: `1px solid ${C.border}` },
  summaryBtn: {
    background: "transparent",
    color: C.teal,
    border: `1px solid ${C.teal}`,
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
  },
  modalPanel: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 20,
    maxWidth: 520,
    width: "100%",
    maxHeight: "80vh",
    overflowY: "auto",
  },
  summaryText: {
    whiteSpace: "pre-wrap",
    fontSize: 13,
    fontFamily: "'Space Grotesk', monospace",
    lineHeight: 1.6,
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 12,
  },
};
