import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";
import AuthGate from "./AuthGate";
import VolumeBuilder from "./VolumeBuilder";

export default function App() {
  return <AuthGate>{({ session }) => <Loaded userId={session.user.id} />}</AuthGate>;
}

function Loaded({ userId }) {
  const [exercises, setExercises] = useState([]);
  const [planRow, setPlanRow] = useState(null); // training_plans row
  const [plan, setPlan] = useState({}); // { dayIndex: [entry, ...] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial load: exercise library + this user's plan + its entries.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: exData, error: exErr } = await supabase
        .from("exercises")
        .select("*")
        .eq("status", "approved")
        .order("name");
      if (exErr) {
        if (!cancelled) {
          setError(exErr.message);
          setLoading(false);
        }
        return;
      }

      let { data: planRows, error: planErr } = await supabase
        .from("training_plans")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (planErr) {
        if (!cancelled) {
          setError(planErr.message);
          setLoading(false);
        }
        return;
      }
      let planData = planRows && planRows.length > 0 ? planRows[0] : null;

      if (!planData) {
        const { data: created, error: createErr } = await supabase
          .from("training_plans")
          .upsert({ user_id: userId, goal: "hypertrophy", days_per_week: 4 }, { onConflict: "user_id" })
          .select()
          .single();
        if (createErr) {
          if (!cancelled) {
            setError(createErr.message);
            setLoading(false);
          }
          return;
        }
        planData = created;
      }

      const { data: entries, error: entriesErr } = await supabase
        .from("plan_entries")
        .select("*")
        .eq("plan_id", planData.id);
      if (entriesErr) {
        if (!cancelled) {
          setError(entriesErr.message);
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      const grouped = {};
      (entries || []).forEach((e) => {
        grouped[e.day_index] = grouped[e.day_index] || [];
        grouped[e.day_index].push(e);
      });

      setExercises(exData || []);
      setPlanRow(planData);
      setPlan(grouped);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updatePlanRow = useCallback(
    async (fields) => {
      if (!planRow) return;
      const updated = { ...planRow, ...fields };
      setPlanRow(updated); // optimistic
      const { error } = await supabase
        .from("training_plans")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", planRow.id);
      if (error) setError(error.message);
    },
    [planRow]
  );

  const handleAddExercise = useCallback(
    async (dayIndex, ex) => {
      const { data, error } = await supabase
        .from("plan_entries")
        .insert({ plan_id: planRow.id, day_index: dayIndex, exercise_id: ex.id, sets: 3, reps: 10 })
        .select()
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      setPlan((prev) => ({ ...prev, [dayIndex]: [...(prev[dayIndex] || []), data] }));
    },
    [planRow]
  );

  const handleUpdateEntry = useCallback(async (entryId, field, value) => {
    setPlan((prev) => {
      const next = {};
      for (const [day, entries] of Object.entries(prev)) {
        next[day] = entries.map((e) => (e.id === entryId ? { ...e, [field]: value } : e));
      }
      return next;
    });
    const { error } = await supabase.from("plan_entries").update({ [field]: value }).eq("id", entryId);
    if (error) setError(error.message);
  }, []);

  const handleRemoveEntry = useCallback(async (entryId) => {
    setPlan((prev) => {
      const next = {};
      for (const [day, entries] of Object.entries(prev)) {
        next[day] = entries.filter((e) => e.id !== entryId);
      }
      return next;
    });
    const { error } = await supabase.from("plan_entries").delete().eq("id", entryId);
    if (error) setError(error.message);
  }, []);

  const handleReorderEntries = useCallback(async (dayIndex, orderedEntryIds) => {
    // Optimistic local reorder so the UI updates immediately.
    setPlan((prev) => {
      const entries = prev[dayIndex] || [];
      const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
      const reordered = orderedEntryIds
        .map((id, i) => (byId[id] ? { ...byId[id], order_index: i } : null))
        .filter(Boolean);
      return { ...prev, [dayIndex]: reordered };
    });

    // Persist each entry's new order_index. Individual updates rather than
    // a single bulk call since Supabase's client doesn't support a
    // multi-row "update different values per row" in one request.
    const results = await Promise.all(
      orderedEntryIds.map((id, i) =>
        supabase.from("plan_entries").update({ order_index: i }).eq("id", id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed) setError(failed.error.message);
  }, []);

  const handleRequestExercise = useCallback(
    async (payload) => {
      const { error } = await supabase
        .from("exercise_submissions")
        .insert({ ...payload, requested_by: userId, status: "pending" });
      if (error) setError(error.message);
    },
    [userId]
  );

  if (loading) {
    return (
      <div style={{ background: "#0F1923", color: "#E7EEF3", minHeight: "100vh", padding: 24 }}>
        Loading…
        {error && (
          <div style={{ color: "#E84545", marginTop: 12, fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  if (!planRow) {
    return (
      <div style={{ background: "#0F1923", color: "#E7EEF3", minHeight: "100vh", padding: 24 }}>
        <div style={{ color: "#E84545", fontSize: 14 }}>
          Something went wrong loading your plan{error ? `: ${error}` : "."}
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div style={{ background: "#E84545", color: "#fff", padding: "8px 16px", fontSize: 13 }}>
          {error}
        </div>
      )}
      <VolumeBuilder
        exercises={exercises}
        goalKey={planRow.goal}
        daysPerWeek={planRow.days_per_week}
        onGoalChange={(goal) => updatePlanRow({ goal })}
        onDaysChange={(days_per_week) => updatePlanRow({ days_per_week })}
        plan={plan}
        onAddExercise={handleAddExercise}
        onUpdateEntry={handleUpdateEntry}
        onRemoveEntry={handleRemoveEntry}
        onReorderEntries={handleReorderEntries}
        onRequestExercise={handleRequestExercise}
      />
    </>
  );
}
