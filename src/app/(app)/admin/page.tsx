"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, Loader2, Upload, CheckCircle, XCircle } from "lucide-react";
import type { Entry } from "@/lib/types";

export default function AdminPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from("entries").select("*").order("created_at", { ascending: false });
    setEntries(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const errorEntries = entries.filter((e) => {
    const ai = e.ai_analysis || {};
    return ai.error || !ai.category;
  });

  const missingEmbeddings = entries.filter((e) => !e.embedding);

  const reanalyzeAll = async () => {
    setProcessing(true);
    setProgress({ current: 0, total: errorEntries.length });

    const supabase = createClient();
    for (let i = 0; i < errorEntries.length; i++) {
      const entry = errorEntries[i];
      setProgress({ current: i + 1, total: errorEntries.length });

      try {
        // Wait between requests
        if (i > 0) await new Promise((r) => setTimeout(r, 5000));

        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: entry.content }),
        });
        const analysis = await res.json();

        if (!analysis.error) {
          await supabase.from("entries").update({ ai_analysis: analysis }).eq("id", entry.id);
        }
      } catch (err) {
        console.error(`Failed entry ${i + 1}:`, err);
      }
    }

    setProcessing(false);
    fetchEntries();
  };

  const regenerateEmbeddings = async () => {
    setProcessing(true);
    setProgress({ current: 0, total: missingEmbeddings.length });

    const supabase = createClient();
    for (let i = 0; i < missingEmbeddings.length; i++) {
      const entry = missingEmbeddings[i];
      setProgress({ current: i + 1, total: missingEmbeddings.length });

      try {
        const res = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: entry.content }),
        });
        const { embedding } = await res.json();

        if (embedding) {
          await supabase.from("entries").update({ embedding }).eq("id", entry.id);
        }
      } catch (err) {
        console.error(`Failed embedding ${i + 1}:`, err);
      }
    }

    setProcessing(false);
    fetchEntries();
  };

  const handleBulkImport = async () => {
    if (!importFile) return;
    setProcessing(true);
    setImportStatus("Reading file...");

    try {
      const text = await importFile.text();
      const rows = text.split("\n").filter((r) => r.trim());
      if (rows.length < 2) throw new Error("File needs header + data rows");

      // Simple CSV parse (first column = content)
      const header = rows[0].split(",");
      const dataRows = rows.slice(1);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let success = 0;
      setProgress({ current: 0, total: dataRows.length });

      for (let i = 0; i < dataRows.length; i++) {
        const cols = dataRows[i].split(",");
        const content = cols[0]?.trim();
        if (!content) continue;

        // Add other columns as context
        const extra = header.slice(1).map((h, j) => `${h}: ${cols[j + 1] || ""}`).join("\n");
        const fullContent = extra ? `${content}\n\n${extra}` : content;

        setProgress({ current: i + 1, total: dataRows.length });
        setImportStatus(`Importing ${i + 1}/${dataRows.length}...`);

        if (i > 0) await new Promise((r) => setTimeout(r, 5000));

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fullContent }),
        });
        const analysis = await analyzeRes.json();

        await new Promise((r) => setTimeout(r, 2000));

        const embedRes = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fullContent }),
        });
        const { embedding } = await embedRes.json();

        const { error } = await supabase.from("entries").insert({
          user_id: user.id,
          content: fullContent,
          ai_analysis: analysis,
          file_type: "csv",
          file_name: importFile.name,
          embedding,
          created_at: new Date().toISOString(),
        });

        if (!error) success++;
      }

      setImportStatus(`Imported ${success} entries!`);
      setImportFile(null);
      fetchEntries();
    } catch (err) {
      setImportStatus(`Error: ${err}`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Tools</h1>

      <p className="text-sm text-gray-500 mb-6">Model: gemma-3-27b-it</p>

      {/* Progress bar */}
      {processing && progress.total > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Processing...</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-brand-400 h-2 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Re-analyze section */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <h2 className="font-semibold mb-2">Re-analyze entries with errors</h2>
        {errorEntries.length > 0 ? (
          <>
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
              {errorEntries.length} entries with missing/failed AI analysis
            </p>
            <button
              onClick={reanalyzeAll}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-500 text-gray-900 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Re-analyze all (5s delay)
            </button>
            <div className="mt-3 space-y-2">
              {errorEntries.slice(0, 5).map((e) => (
                <div key={e.id} className="text-xs text-gray-500 flex items-start gap-1">
                  <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="truncate">{e.content.slice(0, 60)}...</span>
                </div>
              ))}
              {errorEntries.length > 5 && (
                <p className="text-xs text-gray-400">...and {errorEntries.length - 5} more</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle size={14} /> All entries have valid AI analysis!
          </p>
        )}
      </section>

      {/* Embeddings section */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <h2 className="font-semibold mb-2">Regenerate embeddings</h2>
        {missingEmbeddings.length > 0 ? (
          <>
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
              {missingEmbeddings.length} entries without embeddings
            </p>
            <button
              onClick={regenerateEmbeddings}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-500 text-gray-900 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Generate embeddings
            </button>
          </>
        ) : (
          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle size={14} /> All entries have embeddings!
          </p>
        )}
      </section>

      {/* Bulk import */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold mb-2">Bulk import from CSV</h2>
        <p className="text-xs text-gray-500 mb-3">
          CSV file where each row becomes a separate entry. First column = main content.
        </p>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Upload size={14} />
            {importFile ? importFile.name : "Choose CSV file"}
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {importFile && (
            <button
              onClick={handleBulkImport}
              disabled={processing}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-500 text-gray-900 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Import
            </button>
          )}
        </div>
        {importStatus && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{importStatus}</p>
        )}
      </section>
    </div>
  );
}
