"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search as SearchIcon, Loader2, Lightbulb, Archive, ArchiveRestore, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import type { Entry } from "@/lib/types";
import { getLanguage } from "@/lib/use-language";

type DateFilter = "all" | "today" | "yesterday" | "week" | "month" | "custom";

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  switch (filter) {
    case "today":
      return { from: todayStr, to: null };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: y.toISOString().slice(0, 10), to: todayStr };
    }
    case "week": {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      return { from: w.toISOString().slice(0, 10), to: null };
    }
    case "month": {
      const m = new Date(now);
      m.setMonth(m.getMonth() - 1);
      return { from: m.toISOString().slice(0, 10), to: null };
    }
    case "custom":
      return { from: customFrom || null, to: customTo || null };
    default:
      return { from: null, to: null };
  }
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setAiSummary("");

    try {
      // Generate query embedding
      const embedRes = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query, taskType: "RETRIEVAL_QUERY" }),
      });
      const { embedding } = await embedRes.json();
      if (!embedding) throw new Error("Failed to generate embedding");

      // Search via Supabase RPC
      const supabase = createClient();
      const { data, error } = await supabase.rpc("match_entries", {
        query_embedding: embedding,
        match_threshold: 0.65,
        match_count: 50,
      });

      if (error) throw error;

      // Apply date filter client-side
      const { from, to } = getDateRange(dateFilter, customFrom, customTo);
      let filtered = data || [];
      if (from) {
        filtered = filtered.filter((r: Entry) => r.created_at.slice(0, 10) >= from);
      }
      if (to) {
        filtered = filtered.filter((r: Entry) => r.created_at.slice(0, 10) <= to);
      }

      // Limit to top 10 after filtering
      filtered = filtered.slice(0, 10);
      setResults(filtered);

      // Generate AI summary with dates included
      if (filtered.length > 0) {
        const summariesWithDates = filtered.map((r: Entry) => {
          const summary = r.ai_analysis?.summary || r.content.slice(0, 100);
          const date = r.created_at.slice(0, 10);
          return `[${date}] ${summary}`;
        });

        const sumRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, summaries: summariesWithDates, language: getLanguage() }),
        });
        const { summary } = await sumRes.json();
        setAiSummary(summary || "");
      } else {
        const lang = getLanguage();
        setAiSummary(lang === "sv"
          ? "Inga poster hittades för det valda datumintervallet."
          : "No entries found for the selected date range.");
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

      {/* Date filter */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-gray-400" />
        {([
          ["all", "Alla"],
          ["today", "Idag"],
          ["yesterday", "Igår"],
          ["week", "Senaste veckan"],
          ["month", "Senaste månaden"],
          ["custom", "Välj datum"],
        ] as [DateFilter, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setDateFilter(value)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              dateFilter === value
                ? "bg-brand-400 text-gray-900 font-medium"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {dateFilter === "custom" && (
        <div className="mt-2 flex gap-2 items-center">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
          <span className="text-xs text-gray-400">—</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
        </div>
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
