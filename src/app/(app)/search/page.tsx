"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Search as SearchIcon,
  Loader2,
  Lightbulb,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  X,
  Trash2,
} from "lucide-react";
import type { Entry } from "@/lib/types";
import { getLanguage } from "@/lib/use-language";
import { useLanguage } from "@/lib/use-language";
import ImageLightbox from "@/components/image-lightbox";
import { getLocalizedAnalysis, needsTranslation } from "@/lib/analysis-i18n";
import MarkdownContent from "@/components/markdown-content";

const PAGE_SIZE = 50;

interface QueryIntent {
  type: "date" | "latest" | "semantic";
  from?: string | null;
  to?: string | null;
  label?: string | null;
  limit?: number;
}

/** Parse date/recency intent from natural language query */
function detectQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const yesterdayStr = daysAgo(1);

  // "senaste N dokumenten/posterna" / "latest N entries/documents"
  const latestNMatch = q.match(
    /(?:senaste|sista|latest|last|nyaste|newest)\s+(\d+)\s*(?:dokumenten|dokument|posterna|poster|entries|documents|inläggen|inlägg)?/,
  );
  if (latestNMatch) {
    const n = parseInt(latestNMatch[1]);
    return { type: "latest", limit: n, label: `${n} senaste` };
  }

  // "senaste dokumenten/posterna" without a number → default 10
  if (
    /(?:senaste|sista|nyaste|newest|latest|most recent)\s*(?:dokumenten|dokument|posterna|poster|entries|documents|inläggen|inlägg)/.test(
      q,
    )
  ) {
    return { type: "latest", limit: 10, label: "10 senaste" };
  }

  // "sedan idag" / "since today" → only today
  if (/\b(sedan idag|sedan i dag|since today)\b/.test(q)) {
    return { type: "date", from: today, to: today, label: today };
  }

  // "sedan igår" / "since yesterday" → yesterday + today
  if (
    /\b(sedan igår|sedan i går|since yesterday|från igår|från i går)\b/.test(q)
  ) {
    return {
      type: "date",
      from: yesterdayStr,
      to: today,
      label: `${yesterdayStr} → ${today}`,
    };
  }

  // "sedan i förrgår" / "since day before yesterday" (must be before "i förrgår")
  if (
    /\b(sedan i förrgår|sedan förrgår|since day before yesterday)\b/.test(q)
  ) {
    return {
      type: "date",
      from: daysAgo(2),
      to: today,
      label: `${daysAgo(2)} → ${today}`,
    };
  }

  // "i förrgår" / "day before yesterday"
  if (
    /\b(i förrgår|i förrgar|förrgår|förrgar|day before yesterday)\b/.test(q)
  ) {
    return {
      type: "date",
      from: daysAgo(2),
      to: daysAgo(2),
      label: daysAgo(2),
    };
  }

  // Just "idag" / "today"
  if (/\b(idag|today|i dag)\b/.test(q)) {
    return { type: "date", from: today, to: today, label: today };
  }

  // Just "igår" / "yesterday"
  if (/\b(igår|yesterday|i går)\b/.test(q)) {
    return {
      type: "date",
      from: yesterdayStr,
      to: yesterdayStr,
      label: yesterdayStr,
    };
  }

  // "senaste X dagarna" / "last X days"
  const daysMatch = q.match(
    /\b(?:senaste|sista|last)\s+(\d+)\s+(?:dagarna|dagar|days)\b/,
  );
  if (daysMatch) {
    const n = parseInt(daysMatch[1]);
    return {
      type: "date",
      from: daysAgo(n),
      to: today,
      label: `${daysAgo(n)} → ${today}`,
    };
  }

  // This week / last 7 days
  if (
    /\b(denna vecka|den här veckan|this week|senaste veckan|sista veckan|last week)\b/.test(
      q,
    )
  ) {
    return {
      type: "date",
      from: daysAgo(7),
      to: today,
      label: `${daysAgo(7)} → ${today}`,
    };
  }

  // This month / last 30 days
  if (
    /\b(denna månad|den här månaden|this month|senaste månaden|sista månaden|last month)\b/.test(
      q,
    )
  ) {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return {
      type: "date",
      from: monthAgo.toISOString().slice(0, 10),
      to: today,
      label: `${monthAgo.toISOString().slice(0, 10)} → ${today}`,
    };
  }

  // Specific date YYYY-MM-DD
  const dateMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    return {
      type: "date",
      from: dateMatch[1],
      to: dateMatch[1],
      label: dateMatch[1],
    };
  }

  return { type: "semantic" };
}

export default function SearchPage() {
  const { language } = useLanguage();
  const sv = language === "sv";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [dateLabel, setDateLabel] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const translatingRef = useRef<Set<string>>(new Set());
  const initialSearchDone = useRef(false);

  // Handle query parameter from URL (e.g., from clickable tags on browse page)
  useEffect(() => {
    if (initialSearchDone.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setQuery(q);
      initialSearchDone.current = true;
      // Trigger search after state update
      setTimeout(() => {
        const searchBtn = document.querySelector(
          "[data-search-btn]",
        ) as HTMLButtonElement;
        searchBtn?.click();
      }, 100);
    }
  }, []);

  // Lazy-translate entries whose ai_analysis is in a different language
  useEffect(() => {
    if (results.length === 0) return;
    const toTranslate = results.filter(
      (r) =>
        r.ai_analysis &&
        needsTranslation(r.ai_analysis, language) &&
        !translatingRef.current.has(r.id),
    );
    if (toTranslate.length === 0) return;

    // Mark as in-flight
    toTranslate.forEach((r) => translatingRef.current.add(r.id));

    // Translate up to 5 at a time to avoid hammering the API
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
        // Update the entry in state with the translation cached
        setResults((prev) =>
          prev.map((r) => {
            if (r.id !== entry.id || !r.ai_analysis) return r;
            return {
              ...r,
              ai_analysis: {
                ...r.ai_analysis,
                _translations: {
                  ...(r.ai_analysis._translations || {}),
                  [language]: translated,
                },
              },
            };
          }),
        );
      } catch {
        // Silently fail — original text is still shown
      }
    });
  }, [results, language]);

  // Infinite scroll: load more when sentinel enters viewport
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting) {
      setDisplayCount((prev) => prev + PAGE_SIZE);
    }
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver, results]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setAiSummary("");
    setDateLabel(null);
    setDisplayCount(PAGE_SIZE);

    try {
      // Detect query intent (date range, latest N, or semantic)
      const intent = detectQueryIntent(query);
      if (intent.label) setDateLabel(intent.label);

      const supabase = createClient();
      let filtered: Entry[] = [];

      if (intent.type === "latest") {
        // Fetch the N most recent entries
        const { data, error } = await supabase
          .from("entries")
          .select(
            "id, content, ai_analysis, file_type, file_name, created_at, updated_at, archived, image_url",
          )
          .order("created_at", { ascending: false })
          .limit(intent.limit || 10);

        if (error) throw error;
        filtered = data || [];
      } else if (intent.type === "date" && intent.from) {
        // Date-based query: fetch ALL entries in the date range directly from DB
        // Exclude embedding column to avoid huge response sizes
        let dbQuery = supabase
          .from("entries")
          .select(
            "id, content, ai_analysis, file_type, file_name, created_at, updated_at, archived, image_url",
          )
          .gte("created_at", `${intent.from}T00:00:00`)
          .order("created_at", { ascending: false });

        if (intent.to) {
          // Add one day to 'to' to include the full day
          const toDate = new Date(intent.to);
          toDate.setDate(toDate.getDate() + 1);
          dbQuery = dbQuery.lt(
            "created_at",
            toDate.toISOString().slice(0, 10) + "T00:00:00",
          );
        }

        const { data, error } = await dbQuery;
        if (error) throw error;
        filtered = data || [];
      } else {
        // Content-based query: use semantic search
        const embedRes = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: query, taskType: "RETRIEVAL_QUERY" }),
        });
        const { embedding } = await embedRes.json();
        if (!embedding) throw new Error("Failed to generate embedding");

        const { data, error } = await supabase.rpc("match_entries", {
          query_embedding: embedding,
          match_threshold: 0.65,
          match_count: 20,
        });

        if (error) throw error;
        filtered = data || [];
      }

      setResults(filtered);

      // Generate AI summary with dates included
      if (filtered.length > 0) {
        // Collect metadata for richer AI context
        const categoryCounts: Record<string, number> = {};
        const allEntities = new Set<string>();
        for (const r of filtered) {
          const cat = r.ai_analysis?.category || "Okategoriserat";
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          (r.ai_analysis?.entities || []).forEach((e) => allEntities.add(e));
        }

        // For large result sets, summarize categories/counts rather than all entries
        const totalCount = filtered.length;
        let summariesForAI: string[];

        if (totalCount > 20) {
          // Group by category and give counts + sample summaries
          const categories: Record<
            string,
            { count: number; samples: string[] }
          > = {};
          for (const r of filtered) {
            const cat = r.ai_analysis?.category || "Okategoriserat";
            if (!categories[cat]) categories[cat] = { count: 0, samples: [] };
            categories[cat].count++;
            if (categories[cat].samples.length < 3) {
              const entities = r.ai_analysis?.entities?.join(", ") || "";
              const summary = r.ai_analysis?.summary || r.content.slice(0, 80);
              categories[cat].samples.push(
                entities ? `${summary} [${entities}]` : summary,
              );
            }
          }
          summariesForAI = [
            `Totalt ${totalCount} poster.`,
            ...Object.entries(categories).map(
              ([cat, { count, samples }]) =>
                `${cat} (${count} st): ${samples.map((s) => `"${s}"`).join("; ")}`,
            ),
          ];
        } else {
          summariesForAI = filtered.map((r: Entry) => {
            const summary = r.ai_analysis?.summary || r.content.slice(0, 100);
            const date = r.created_at.slice(0, 10);
            const cat = r.ai_analysis?.category || "";
            const entities = r.ai_analysis?.entities?.join(", ") || "";
            const parts = [`[${date}]`, summary];
            if (cat) parts.push(`(${cat})`);
            if (entities) parts.push(`[${entities}]`);
            return parts.join(" ");
          });
        }

        const sumRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            summaries: summariesForAI,
            language: getLanguage(),
            dateContext: intent.label || null,
            totalCount: filtered.length,
            categories: categoryCounts,
            entities: [...allEntities].slice(0, 30),
            isLatestQuery: intent.type === "latest",
          }),
        });
        const { summary } = await sumRes.json();
        setAiSummary(summary || "");
      } else {
        const lang = getLanguage();
        const noResults = intent.label
          ? lang === "sv"
            ? `Inga poster hittades för ${intent.label}.`
            : `No entries found for ${intent.label}.`
          : lang === "sv"
            ? "Inga matchande poster hittades."
            : "No matching entries found.";
        setAiSummary(noResults);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  };

  const toggleArchive = async (id: string, currentlyArchived: boolean) => {
    const supabase = createClient();
    await supabase
      .from("entries")
      .update({ archived: !currentlyArchived })
      .eq("id", id);
    setResults((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, archived: !currentlyArchived } : r,
      ),
    );
  };

  const deleteEntry = async (id: string) => {
    if (!confirm(sv ? "Ta bort permanent?" : "Delete permanently?")) return;
    const supabase = createClient();
    await supabase.from("entries").delete().eq("id", id);
    setResults((prev) => prev.filter((r) => r.id !== id));
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
      setResults((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, content: editContent, ai_analysis, updated_at }
            : r,
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

  const sentimentEmoji: Record<string, string> = {
    positive: "😊",
    negative: "😟",
    neutral: "😐",
    mixed: "🤔",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {sv ? "Sök kunskap" : "Search Knowledge"}
      </h1>

      {/* Search input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={sv ? "Fråga vad som helst..." : "Ask anything..."}
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
        />
        <button
          data-search-btn
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-3 bg-brand-400 hover:bg-brand-500 text-gray-900 rounded-xl transition-colors disabled:opacity-50"
        >
          {searching ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <SearchIcon size={18} />
          )}
        </button>
      </div>

      {/* Auto-detected date filter indicator */}
      {dateLabel && (
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          📅 Filtrerat på: {dateLabel}
        </p>
      )}

      {/* AI Summary */}
      {aiSummary && (
        <div className="mt-4 flex gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm">
          <Lightbulb size={18} className="text-brand-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 max-w-none">
            <MarkdownContent content={aiSummary} />
          </div>
        </div>
      )}

      {/* Stats */}
      {results.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold">{results.length}</div>
            <div className="text-xs text-gray-500">
              {sv ? "Resultat" : "Results"}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold">
              {
                new Set(results.flatMap((r) => r.ai_analysis?.entities || []))
                  .size
              }
            </div>
            <div className="text-xs text-gray-500">
              {sv ? "Entiteter" : "Entities"}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold">
              {
                new Set(
                  results.map((r) => r.ai_analysis?.category).filter(Boolean),
                ).size
              }
            </div>
            <div className="text-xs text-gray-500">
              {sv ? "Kategorier" : "Categories"}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-4 space-y-3">
        {results.slice(0, displayCount).map((result, i) => {
          const ai = getLocalizedAnalysis(result.ai_analysis, language) || {};
          const similarity = Math.round((result.similarity || 0) * 100);
          const expanded = expandedId === result.id;

          return (
            <div
              key={result.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">
                    {i + 1}. {ai.title || ai.summary || result.content.slice(0, 80)}
                  </h3>
                  {ai.summary && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {ai.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                    {ai.category && <span>📁 {ai.category}</span>}
                    {ai.entities && ai.entities.length > 0 && (
                      <span>🏢 {ai.entities.slice(0, 2).join(", ")}</span>
                    )}
                    {ai.sentiment && (
                      <span>
                        {sentimentEmoji[ai.sentiment.toLowerCase()] || "💭"}{" "}
                        {ai.sentiment}
                      </span>
                    )}
                    <span>
                      📅{" "}
                      {new Date(result.created_at).toLocaleString("sv-SE", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    {result.updated_at && (
                      <span title={sv ? "Redigerad" : "Edited"}>
                        ✏️{" "}
                        {new Date(result.updated_at).toLocaleString("sv-SE", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    )}
                    {result.file_type === "url" && result.file_name && (
                      <a
                        href={result.file_name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-500 hover:underline flex items-center gap-0.5"
                      >
                        🔗 {sv ? "Källa" : "Source"}
                      </a>
                    )}
                  </div>
                </div>
                {result.similarity != null && result.similarity > 0 && (
                  <span
                    className={`shrink-0 text-xs font-bold px-2 py-1 rounded ${
                      similarity >= 80
                        ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                        : similarity >= 70
                          ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400"
                          : "text-gray-400"
                    }`}
                  >
                    {similarity}%
                  </span>
                )}
              </div>

              {/* Topics — clickable to search */}
              {ai.topics && ai.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ai.topics.slice(0, 5).map((t, j) => (
                    <button
                      key={j}
                      onClick={() => {
                        setQuery(t);
                        // Trigger search after setting query
                        setTimeout(() => {
                          const searchBtn = document.querySelector(
                            "[data-search-btn]",
                          ) as HTMLButtonElement;
                          searchBtn?.click();
                        }, 50);
                      }}
                      className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => setExpandedId(expanded ? null : result.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  {expanded ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {expanded
                    ? sv
                      ? "Dölj"
                      : "Hide"
                    : sv
                      ? "Visa innehåll"
                      : "Show content"}
                </button>
                <button
                  onClick={() => startEdit(result)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-500 transition-colors"
                  title={sv ? "Redigera" : "Edit"}
                >
                  <Pencil size={14} />
                  {sv ? "Redigera" : "Edit"}
                </button>
                <button
                  onClick={() => toggleArchive(result.id, !!result.archived)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  title={
                    result.archived
                      ? sv
                        ? "Återställ"
                        : "Restore"
                      : sv
                        ? "Arkivera"
                        : "Archive"
                  }
                >
                  {result.archived ? (
                    <ArchiveRestore size={14} />
                  ) : (
                    <Archive size={14} />
                  )}
                </button>
                <button
                  onClick={() => deleteEntry(result.id)}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  title={sv ? "Ta bort" : "Delete"}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded content */}
              {expanded && (
                <div className="mt-3">
                  {editingId === result.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => {
                          setEditContent(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
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
                          onClick={() => saveEdit(result.id)}
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
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm break-words">
                      {result.image_url && (
                        <ImageLightbox
                          src={result.image_url}
                          className="max-w-full max-h-64 rounded-lg mb-3 object-contain"
                        />
                      )}
                      <MarkdownContent content={result.content} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Infinite scroll sentinel + status */}
      {results.length > 0 && displayCount < results.length && (
        <div ref={sentinelRef} className="mt-4 flex justify-center">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      )}
      {results.length > 0 &&
        displayCount >= results.length &&
        results.length > PAGE_SIZE && (
          <p className="mt-4 text-xs text-gray-400 text-center">
            {sv
              ? `Alla ${results.length} poster visas.`
              : `All ${results.length} entries shown.`}
          </p>
        )}

      {!searching && query && results.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 text-center">
          {sv ? "Inga resultat hittades." : "No results found."}
        </p>
      )}
    </div>
  );
}
