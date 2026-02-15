"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Archive,
  ArchiveRestore,
  Trash2,
  Loader2,
  Pencil,
  Save,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Entry } from "@/lib/types";
import { useLanguage } from "@/lib/use-language";
import { getLanguage } from "@/lib/use-language";
import { getLocalizedAnalysis, needsTranslation } from "@/lib/analysis-i18n";
import MarkdownContent from "@/components/markdown-content";
import ImageLightbox from "@/components/image-lightbox";

export default function BrowsePage() {
  const { language } = useLanguage();
  const sv = language === "sv";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [filterCategory, setFilterCategory] = useState("Alla");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const translatingRef = useRef<Set<string>>(new Set());

  // Lazy-translate entries whose ai_analysis is in a different language
  useEffect(() => {
    if (entries.length === 0) return;
    const toTranslate = entries.filter(
      (e) =>
        e.ai_analysis &&
        needsTranslation(e.ai_analysis, language) &&
        !translatingRef.current.has(e.id),
    );
    if (toTranslate.length === 0) return;

    toTranslate.forEach((e) => translatingRef.current.add(e.id));

    const batch = toTranslate.slice(0, 5);
    batch.forEach(async (entry) => {
      try {
        const res = await fetch("/api/translate-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: entry.id,
            analysis: entry.ai_analysis,
            targetLang: language,
          }),
        });
        if (!res.ok) return;
        const { translated } = await res.json();
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== entry.id || !e.ai_analysis) return e;
            return {
              ...e,
              ai_analysis: {
                ...e.ai_analysis,
                _translations: {
                  ...(e.ai_analysis._translations || {}),
                  [language]: translated,
                },
              },
            };
          }),
        );
      } catch {
        // Silently fail
      }
    });
  }, [entries, language]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("entries")
      .select(
        "id, content, ai_analysis, file_type, file_name, created_at, updated_at, archived, image_url",
      )
      .order("created_at", { ascending: false })
      .limit(500);

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
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, archived: !archived } : e)),
    );
  };

  const deleteEntry = async (id: string) => {
    if (!confirm(sv ? "Ta bort permanent?" : "Delete permanently?")) return;
    const supabase = createClient();
    await supabase.from("entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
    setExpandedId(entry.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/update-entry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: id,
          content: editContent,
          language: getLanguage(),
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const { ai_analysis, updated_at } = await res.json();
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, content: editContent, ai_analysis, updated_at }
            : e,
        ),
      );
      setEditingId(null);
      setEditContent("");
    } catch (err) {
      console.error("Edit error:", err);
    } finally {
      setEditSaving(false);
    }
  };

  // Collect categories
  // Collect categories (use localized names)
  const categories = Array.from(
    new Set(
      entries
        .map((e) => getLocalizedAnalysis(e.ai_analysis, language)?.category)
        .filter(Boolean),
    ),
  ).sort();

  const filtered = entries.filter(
    (e) =>
      filterCategory === "Alla" ||
      getLocalizedAnalysis(e.ai_analysis, language)?.category ===
        filterCategory,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {sv ? "Bläddra" : "Browse All"}
      </h1>

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
          {filtered.length}{" "}
          {filterCategory !== "Alla" ? `av ${entries.length}` : ""} poster
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          Inga poster hittades.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const ai = getLocalizedAnalysis(entry.ai_analysis, language) || {};
            return (
              <div
                key={entry.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {ai.title || ai.category || "Entry"}
                      </span>
                      {ai.title && ai.category && (
                        <span className="text-xs text-gray-400">{ai.category}</span>
                      )}
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
                          <a
                            key={i}
                            href={`/search?q=${encodeURIComponent(t)}`}
                            className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
                          >
                            {t}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400">
                      {new Date(entry.created_at).toLocaleString("sv-SE", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    {entry.updated_at && (
                      <span
                        className="text-xs text-gray-400"
                        title={sv ? "Redigerad" : "Edited"}
                      >
                        ✏️{" "}
                        {new Date(entry.updated_at).toLocaleString("sv-SE", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    )}
                    {entry.file_type && entry.file_type !== "url" && (
                      <span className="text-xs text-gray-400">
                        📎 {entry.file_type}
                      </span>
                    )}
                    {entry.file_type === "url" && entry.file_name && (
                      <a
                        href={entry.file_name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-500 hover:underline"
                      >
                        🔗 {sv ? "Källa" : "Source"}
                      </a>
                    )}
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => startEdit(entry)}
                        className="p-1 text-gray-400 hover:text-brand-500 transition-colors"
                        title={sv ? "Redigera" : "Edit"}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() =>
                          toggleArchive(entry.id, !!entry.archived)
                        }
                        className="p-1 text-gray-400 hover:text-brand-500 transition-colors"
                        title={entry.archived ? "Återställ" : "Arkivera"}
                      >
                        {entry.archived ? (
                          <ArchiveRestore size={14} />
                        ) : (
                          <Archive size={14} />
                        )}
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

                {/* Expand / Edit actions */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    {expandedId === entry.id ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    {expandedId === entry.id
                      ? sv
                        ? "Dölj"
                        : "Hide"
                      : sv
                        ? "Visa innehåll"
                        : "Show content"}
                  </button>
                </div>

                {/* Expanded content / Edit mode */}
                {expandedId === entry.id && (
                  <div className="mt-2">
                    {editingId === entry.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => {
                            setEditContent(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height =
                              e.target.scrollHeight + "px";
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = el.scrollHeight + "px";
                            }
                          }}
                          className="w-full min-h-[12rem] max-h-[70vh] p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-400 border border-gray-200 dark:border-gray-700"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(entry.id)}
                            disabled={editSaving}
                            className="flex items-center gap-1 text-xs bg-brand-400 hover:bg-brand-500 text-gray-900 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium"
                          >
                            {editSaving ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Save size={12} />
                            )}
                            {editSaving
                              ? sv
                                ? "Sparar & analyserar..."
                                : "Saving & analyzing..."
                              : sv
                                ? "Spara"
                                : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <X size={12} />
                            {sv ? "Avbryt" : "Cancel"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm break-words whitespace-pre-wrap">
                        {entry.image_url && (
                          <ImageLightbox
                            src={entry.image_url}
                            className="max-w-full max-h-64 rounded-lg mb-3 object-contain"
                          />
                        )}
                        {entry.content}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
