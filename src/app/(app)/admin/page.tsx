"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, Loader2, Upload, CheckCircle, XCircle, FileSpreadsheet } from "lucide-react";
import type { Entry } from "@/lib/types";
import * as XLSX from "xlsx";
import { getLanguage } from "@/lib/use-language";

type SheetData = { [sheetName: string]: string[][] };

export default function AdminPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState("");

  // Excel state
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [contentCol, setContentCol] = useState("");
  const [includeCols, setIncludeCols] = useState<string[]>([]);

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
          body: JSON.stringify({ content: entry.content, language: getLanguage() }),
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

  const handleFileSelect = async (file: File | null) => {
    setImportFile(file);
    setSheetData(null);
    setSelectedSheet("");
    setContentCol("");
    setIncludeCols([]);
    setImportStatus("");

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      const sheets: SheetData = {};
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];
        if (rows.length > 1) {
          sheets[name] = rows;
        }
      }

      if (Object.keys(sheets).length === 0) {
        setImportStatus("No sheets with data found");
        return;
      }

      setSheetData(sheets);
      const firstSheet = Object.keys(sheets)[0];
      setSelectedSheet(firstSheet);
      setContentCol(String(sheets[firstSheet][0][0] || ""));
    } catch {
      setImportStatus("Error reading file");
    }
  };

  const getHeaders = (): string[] => {
    if (!sheetData || !selectedSheet) return [];
    return (sheetData[selectedSheet][0] || []).map(String);
  };

  const getDataRows = (): string[][] => {
    if (!sheetData || !selectedSheet) return [];
    return sheetData[selectedSheet].slice(1).filter((r) => r.some((c) => c !== undefined && String(c).trim() !== ""));
  };

  const handleBulkImport = async () => {
    if (!importFile || !sheetData || !contentCol) return;
    setProcessing(true);
    setImportStatus("Starting import...");

    try {
      const headers = getHeaders();
      const dataRows = getDataRows();
      const contentIdx = headers.indexOf(contentCol);
      if (contentIdx === -1) throw new Error("Content column not found");

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let success = 0;
      setProgress({ current: 0, total: dataRows.length });

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const mainContent = String(row[contentIdx] || "").trim();
        if (!mainContent || mainContent === "undefined") continue;

        // Build extra info from selected columns
        let fullContent = mainContent;
        if (includeCols.length > 0) {
          const extra = includeCols
            .map((col) => {
              const idx = headers.indexOf(col);
              const val = idx >= 0 ? row[idx] : undefined;
              return val !== undefined && String(val).trim() !== "" ? `${col}: ${val}` : null;
            })
            .filter(Boolean)
            .join("\n");
          if (extra) fullContent = `${mainContent}\n\n${extra}`;
        }

        setProgress({ current: i + 1, total: dataRows.length });
        setImportStatus(`Importing ${i + 1}/${dataRows.length}...`);

        if (i > 0) await new Promise((r) => setTimeout(r, 5000));

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fullContent, language: getLanguage() }),
        });
        const analysis = await analyzeRes.json();

        await new Promise((r) => setTimeout(r, 2000));

        const embedRes = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fullContent }),
        });
        const { embedding } = await embedRes.json();

        const isExcel = importFile.name.endsWith(".xlsx") || importFile.name.endsWith(".xls");
        const { error } = await supabase.from("entries").insert({
          user_id: user.id,
          content: fullContent,
          ai_analysis: analysis,
          file_type: isExcel ? "xlsx" : "csv",
          file_name: importFile.name,
          embedding,
          created_at: new Date().toISOString(),
        });

        if (!error) success++;
      }

      setImportStatus(`Imported ${success} entries!`);
      setImportFile(null);
      setSheetData(null);
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
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <FileSpreadsheet size={16} />
          Bulk import from Excel / CSV
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Import Excel (.xlsx) or CSV files. Each row becomes a separate entry.
        </p>

        {/* File picker */}
        <div className="flex gap-2 items-center mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Upload size={14} />
            {importFile ? importFile.name : "Choose file"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {importFile && !sheetData && (
            <span className="text-xs text-gray-400">Reading...</span>
          )}
        </div>

        {/* Sheet & column selection */}
        {sheetData && (
          <div className="space-y-3 mb-4">
            {/* Sheet selector */}
            {Object.keys(sheetData).length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sheet</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => {
                    setSelectedSheet(e.target.value);
                    setContentCol(String((sheetData[e.target.value]?.[0]?.[0]) || ""));
                    setIncludeCols([]);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                >
                  {Object.keys(sheetData).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Content column */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Main content column
              </label>
              <select
                value={contentCol}
                onChange={(e) => {
                  setContentCol(e.target.value);
                  setIncludeCols((prev) => prev.filter((c) => c !== e.target.value));
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              >
                {getHeaders().map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            {/* Extra columns */}
            {getHeaders().filter((h) => h !== contentCol).length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Include extra columns
                </label>
                <div className="flex flex-wrap gap-2">
                  {getHeaders().filter((h) => h !== contentCol).map((h) => (
                    <label key={h} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeCols.includes(h)}
                        onChange={(e) => {
                          if (e.target.checked) setIncludeCols((prev) => [...prev, h]);
                          else setIncludeCols((prev) => prev.filter((c) => c !== h));
                        }}
                        className="rounded border-gray-300 text-brand-400 focus:ring-brand-400"
                      />
                      {h}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {getDataRows().length} rows, {getHeaders().length} columns
              </p>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {getHeaders().map((h) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                            h === contentCol
                              ? "text-brand-600 dark:text-brand-400"
                              : includeCols.includes(h)
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-gray-500"
                          }`}
                        >
                          {h}
                          {h === contentCol && " ★"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getDataRows().slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        {getHeaders().map((h, j) => (
                          <td key={j} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                            {row[j] !== undefined ? String(row[j]) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {getDataRows().length > 5 && (
                <p className="text-xs text-gray-400 mt-1">Showing 5 of {getDataRows().length} rows</p>
              )}
            </div>

            {/* Import button */}
            <button
              onClick={handleBulkImport}
              disabled={processing || !contentCol}
              className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-500 text-gray-900 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Upload size={14} />
              Import {getDataRows().length} rows as separate entries
            </button>
          </div>
        )}

        {importStatus && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{importStatus}</p>
        )}
      </section>
    </div>
  );
}
