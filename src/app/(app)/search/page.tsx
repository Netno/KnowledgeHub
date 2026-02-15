"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search as SearchIcon, Loader2, Lightbulb, Archive, ArchiveRestore, ChevronDown, ChevronUp } from "lucide-react";
import type { Entry } from "@/lib/types";
import { getLanguage } from "@/lib/use-language";

/** Parse date intent from natural language query */
function detectDateFilter(query: string): { from: string | null; to: string | null; label: string | null } {
  const q = query.toLowerCase();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const yesterdayStr = daysAgo(1);

  // "sedan idag" / "since today" → only today
  if (/\b(sedan idag|sedan i dag|since today)\b/.test(q)) {
    return { from: today, to: today, label: today };
  }

  // "sedan igår" / "since yesterday" → yesterday + today
  if (/\b(sedan igår|sedan i går|since yesterday|från igår|från i går)\b/.test(q)) {
    return { from: yesterdayStr, to: today, label: `${yesterdayStr} → ${today}` };
  }

  // "sedan i förrgår" / "since day before yesterday" (must be before "i förrgår")
  if (/\b(sedan i förrgår|sedan förrgår|since day before yesterday)\b/.test(q)) {
    return { from: daysAgo(2), to: today, label: `${daysAgo(2)} → ${today}` };
  }

  // "i förrgår" / "day before yesterday"
  if (/\b(i förrgår|i förrgar|förrgår|förrgar|day before yesterday)\b/.test(q)) {
    return { from: daysAgo(2), to: daysAgo(2), label: daysAgo(2) };
  }

  // Just "idag" / "today"
  if (/\b(idag|today|i dag)\b/.test(q)) {
    return { from: today, to: today, label: today };
  }

  // Just "igår" / "yesterday"
  if (/\b(igår|yesterday|i går)\b/.test(q)) {
    return { from: yesterdayStr, to: yesterdayStr, label: yesterdayStr };
  }

  // "senaste X dagarna" / "last X days"
  const daysMatch = q.match(/\b(?:senaste|sista|last)\s+(\d+)\s+(?:dagarna|dagar|days)\b/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1]);
    return { from: daysAgo(n), to: today, label: `${daysAgo(n)} → ${today}` };
  }

  // This week / last 7 days
  if (/\b(denna vecka|den här veckan|this week|senaste veckan|sista veckan|last week)\b/.test(q)) {
    return { from: daysAgo(7), to: today, label: `${daysAgo(7)} → ${today}` };
  }

  // This month / last 30 days
  if (/\b(denna månad|den här månaden|this month|senaste månaden|sista månaden|last month)\b/.test(q)) {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return { from: monthAgo.toISOString().slice(0, 10), to: today, label: `${monthAgo.toISOString().slice(0, 10)} → ${today}` };
  }

  // Specific date YYYY-MM-DD
  const dateMatch = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    return { from: dateMatch[1], to: dateMatch[1], label: dateMatch[1] };
  }

  return { from: null, to: null, label: null };
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setAiSummary("");
    setDateLabel(null);

    try {
      // Detect date intent from query
      const dateFilter = detectDateFilter(query);
      if (dateFilter.label) setDateLabel(dateFilter.label);

      const supabase = createClient();
      let filtered: Entry[] = [];

      if (dateFilter.from) {
        // Date-based query: fetch ALL entries in the date range directly from DB
        let dbQuery = supabase
          .from("entries")
          .select("*")
          .gte("created_at", `${dateFilter.from}T00:00:00`)
          .order("created_at", { ascending: false });

        if (dateFilter.to) {
          // Add one day to 'to' to include the full day
          const toDate = new Date(dateFilter.to);
          toDate.setDate(toDate.getDate() + 1);
          dbQuery = dbQuery.lt("created_at", toDate.toISOString().slice(0, 10) + "T00:00:00");
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
        // For large result sets, summarize categories/counts rather than all entries
        const totalCount = filtered.length;
        let summariesForAI: string[];

        if (totalCount > 20) {
          // Group by category and give counts + sample summaries
          const categories: Record<string, { count: number; samples: string[] }> = {};
          for (const r of filtered) {
            const cat = r.ai_analysis?.category || "Okategoriserat";
            if (!categories[cat]) categories[cat] = { count: 0, samples: [] };
            categories[cat].count++;
            if (categories[cat].samples.length < 2) {
              categories[cat].samples.push(r.ai_analysis?.summary || r.content.slice(0, 80));
            }
          }
          summariesForAI = [
            `Totalt ${totalCount} poster.`,
            ...Object.entries(categories).map(([cat, { count, samples }]) =>
              `${cat}: ${count} st (t.ex. "${samples[0]}"${samples[1] ? `, "${samples[1]}"` : ""})`
            ),
          ];
        } else {
          summariesForAI = filtered.map((r: Entry) => {
            const summary = r.ai_analysis?.summary || r.content.slice(0, 100);
            const date = r.created_at.slice(0, 10);
            return `[${date}] ${summary}`;
          });
        }

        const sumRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, summaries: summariesForAI, language: getLanguage() }),
        });
        const { summary } = await sumRes.json();
        setAiSummary(summary || "");
      } else {
        const lang = getLanguage();
        const noResults = dateFilter.label
          ? (lang === "sv" ? `Inga poster hittades för ${dateFilter.label}.` : `No entries found for ${dateFilter.label}.`)
          : (lang === "sv" ? "Inga matchande poster hittades." : "No matching entries found.");
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
    await supabase.from("entries").update({ archived: !currentlyArchived }).eq("id", id);
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, archived: !currentlyArchived } : r))
    );
  };

  const sentimentEmoji: Record<string, string> = {
    positive: "😊",
    negative: "😟",
    neutral: "😐",
    mixed: "🤔",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Search Knowledge</h1>

      {/* Search input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Ask anything..."
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-3 bg-brand-400 hover:bg-brand-500 text-gray-900 rounded-xl transition-colors disabled:opacity-50"
        >
          {searching ? <Loader2 size={18} className="animate-spin" /> : <SearchIcon size={18} />}
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
          <p>{aiSummary}</p>
        </div>
      )}

      {/* Stats */}
      {results.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold">{results.length}</div>
            <div className="text-xs text-gray-500">Resultat</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold">
              {new Set(results.flatMap((r) => r.ai_analysis?.entities || [])).size}
            </div>
            <div className="text-xs text-gray-500">Entiteter</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold">
              {new Set(results.map((r) => r.ai_analysis?.category).filter(Boolean)).size}
            </div>
            <div className="text-xs text-gray-500">Kategorier</div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-4 space-y-3">
        {results.map((result, i) => {
          const ai = result.ai_analysis || {};
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
                    {i + 1}. {ai.summary || result.content.slice(0, 80)}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                    {ai.category && <span>📁 {ai.category}</span>}
                    {ai.entities && ai.entities.length > 0 && (
                      <span>🏢 {ai.entities.slice(0, 2).join(", ")}</span>
                    )}
                    {ai.sentiment && (
                      <span>
                        {sentimentEmoji[ai.sentiment.toLowerCase()] || "💭"} {ai.sentiment}
                      </span>
                    )}
                    <span>📅 {result.created_at.slice(0, 10)}</span>
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

              {/* Topics */}
              {ai.topics && ai.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ai.topics.slice(0, 5).map((t, j) => (
                    <span key={j} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => setExpandedId(expanded ? null : result.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expanded ? "Hide" : "Show content"}
                </button>
                <button
                  onClick={() => toggleArchive(result.id, !!result.archived)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  title={result.archived ? "Restore" : "Archive"}
                >
                  {result.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </div>

              {/* Expanded content */}
              {expanded && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm whitespace-pre-wrap break-words">
                  {result.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!searching && query && results.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 text-center">Inga resultat hittades.</p>
      )}
    </div>
  );
}
