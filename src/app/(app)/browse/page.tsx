"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import type { Entry } from "@/lib/types";

export default function BrowsePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [filterCategory, setFilterCategory] = useState("Alla");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from("entries").select("id, content, ai_analysis, file_type, file_name, created_at, archived").order("created_at", { ascending: false }).limit(500);

    if (!showArchived) {
      query = query.eq("archived", false);
    }

    const { data } = await query;
    setEntries(data || []);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const toggleArchive = async (id: string, archived: boolean) => {
    const supabase = createClient();
    await supabase.from("entries").update({ archived: !archived }).eq("id", id);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, archived: !archived } : e)));
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Ta bort permanent?")) return;
    const supabase = createClient();
    await supabase.from("entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // Collect categories
  const categories = Array.from(
    new Set(
      entries
        .map((e) => e.ai_analysis?.category)
        .filter(Boolean)
    )
  ).sort();

  const filtered = entries.filter(
    (e) => filterCategory === "Alla" || e.ai_analysis?.category === filterCategory
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Browse All</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Visa arkiverade
        </label>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        >
          <option value="Alla">Alla kategorier</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <span className="text-sm text-gray-500">
          {filtered.length} {filterCategory !== "Alla" ? `av ${entries.length}` : ""} poster
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">Inga poster hittades.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const ai = entry.ai_analysis || {};
            return (
              <div
                key={entry.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {ai.category || "Entry"}
                      </span>
                      {entry.archived && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                          📦 Arkiverad
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {ai.summary || entry.content.slice(0, 200)}
                    </p>
                    {ai.topics && ai.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {ai.topics.slice(0, 5).map((t, i) => (
                          <span
                            key={i}
                            className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400">{entry.created_at.slice(0, 10)}</span>
                    {entry.file_type && (
                      <span className="text-xs text-gray-400">📎 {entry.file_type}</span>
                    )}
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => toggleArchive(entry.id, !!entry.archived)}
                        className="p-1 text-gray-400 hover:text-brand-500 transition-colors"
                        title={entry.archived ? "Återställ" : "Arkivera"}
                      >
                        {entry.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Ta bort"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
