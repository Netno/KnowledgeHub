"use client";

import { useState, useCallback, useRef, DragEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, Paperclip, Loader2, CheckCircle, AlertCircle, Upload, X, Eye, Pencil } from "lucide-react";
import type { AiAnalysis } from "@/lib/types";
import { getLanguage } from "@/lib/use-language";

export default function AddPage() {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileStatus, setFileStatus] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [processing, setProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Extract content from any supported file
  const extractFileContent = useCallback(async (file: File): Promise<{ text: string; type: "text" | "image" | "document" } | null> => {
    const name = file.name.toLowerCase();
    const mime = file.type;

    // Plain text files — read directly
    const textTypes = ["text/", "application/json", "application/xml", "application/csv"];
    const textExtensions = [".txt", ".csv", ".json", ".xml", ".md", ".log", ".html", ".css", ".js", ".ts", ".py"];
    const isText = textTypes.some((t) => mime.startsWith(t)) ||
      textExtensions.some((ext) => name.endsWith(ext));

    if (isText) {
      const text = await file.text();
      return { text, type: "text" };
    }

    // Images — send to Gemini Vision API
    if (mime.startsWith("image/")) {
      setFileStatus(`🔍 Analyserar bild: ${file.name}...`);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", getLanguage());
      const res = await fetch("/api/describe-image", { method: "POST", body: formData });
      const { description } = await res.json();
      setFileStatus("");
      if (description) return { text: description, type: "image" };
      return null;
    }

    // PDF, DOCX, XLSX — send to extract-text API
    if (name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc") ||
        name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const label = name.endsWith(".pdf") ? "PDF" : name.endsWith(".xlsx") || name.endsWith(".xls") ? "Excel" : "Word";
      setFileStatus(`📄 Läser ${label}: ${file.name}...`);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-text", { method: "POST", body: formData });
      const { text } = await res.json();
      setFileStatus("");
      if (text) return { text, type: "document" };
      return null;
    }

    return null;
  }, []);

  // Process files: extract content and append to textarea
  const processFiles = useCallback(async (fileList: File[]) => {
    setProcessing(true);
    for (const file of fileList) {
      const result = await extractFileContent(file);
      if (result) {
        const prefix = result.type === "image" ? `[Bild: ${file.name}]` : `[${file.name}]`;
        setContent((prev) => prev + (prev ? "\n\n" : "") + `${prefix}\n${result.text}`);
      } else {
        addFiles([file]);
      }
    }
    setProcessing(false);
    if (fileList.length > 0) setShowPreview(true);
  }, [extractFileContent, addFiles]);

  // Handle paste — text goes into textarea, files get added as attachments
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    let hasFiles = false;

    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          // Give pasted images a name if they don't have one
          const namedFile = file.name === "image.png" || !file.name
            ? new File([file], `paste-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type })
            : file;
          pastedFiles.push(namedFile);
          hasFiles = true;
        }
      }
    }

    if (hasFiles) {
      e.preventDefault();
      await processFiles(pastedFiles);
    }
    // If no files, let default text paste happen
  }, [processFiles]);

  // Drag & drop
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;
    await processFiles(droppedFiles);
  }, [processFiles]);

  const handleSave = useCallback(async () => {
    if (!content.trim() && files.length === 0) {
      setStatus({ type: "error", message: "Lägg till innehåll eller bifoga en fil." });
      return;
    }

    setSaving(true);
    setStatus(null);
    setAnalysis(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fullContent = content;

      // AI Analysis
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fullContent,
          fileInfo: files.length > 0 ? `${files.length} file(s)` : undefined,
          language: getLanguage(),
        }),
      });
      const aiAnalysis: AiAnalysis = await analyzeRes.json();
      setAnalysis(aiAnalysis);

      // Generate embedding
      const embedRes = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullContent }),
      });
      const { embedding } = await embedRes.json();

      // Save to Supabase
      const { error } = await supabase.from("entries").insert({
        user_id: user.id,
        content: fullContent,
        ai_analysis: aiAnalysis,
        file_type: files.length > 0 ? files[0].type : null,
        file_name: files.length > 0 ? files[0].name : null,
        embedding,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      setStatus({ type: "success", message: "Sparad!" });
      setContent("");
      setFiles([]);
      setShowPreview(false);
      setAnalysis(null);
    } catch (err) {
      setStatus({ type: "error", message: `Error: ${err}` });
    } finally {
      setSaving(false);
    }
  }, [content, files]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Add Knowledge</h1>

      {/* Drop zone + textarea */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 transition-colors ${
          dragging
            ? "border-brand-400 bg-brand-400/10"
            : "border-gray-200 dark:border-gray-700"
        }`}
      >
        {dragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-brand-400/10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-brand-500">
              <Upload size={32} />
              <span className="font-medium text-sm">Släpp filer här</span>
            </div>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePaste}
          placeholder="Skriv, klistra in text/filer, eller dra & släpp filer här..."
          className="w-full h-32 px-4 py-3 rounded-xl bg-white dark:bg-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm border-0"
        />
      </div>

      {/* File upload + attached files */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-brand-500 transition-colors">
          <Paperclip size={16} />
          <span>Bifoga filer</span>
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.csv,.pdf,.txt,.xlsx,.xls,.docx,.doc,.json,.xml,.md,.log"
            onChange={(e) => processFiles(Array.from(e.target.files || []))}
            className="hidden"
          />
        </label>
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative group">
                {f.type.startsWith("image/") ? (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded flex items-center gap-1">
                    {f.name}
                    <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {fileStatus && (
          <p className="mt-2 text-xs text-brand-500 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> {fileStatus}
          </p>
        )}
      </div>

      {/* Content preview (shown after file import or via button) */}
      {content.trim() && (
        <div className="mt-4">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-500 transition-colors"
          >
            {showPreview ? <Pencil size={14} /> : <Eye size={14} />}
            {showPreview ? "Redigera" : `Förhandsgranska (${content.length.toLocaleString()} tecken, ~${content.split(/\s+/).length} ord)`}
          </button>

          {showPreview && (
            <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  {content.length.toLocaleString()} tecken &middot; ~{content.split(/\s+/).length} ord &middot; {content.split("\n").length} rader
                </span>
              </div>
              <pre className="text-sm whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
                {content}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        {content.trim() && !showPreview && (
          <button
            onClick={() => setShowPreview(true)}
            className="flex-1 flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 rounded-xl transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Eye size={18} />
            Förhandsgranska
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || processing || (!content.trim() && files.length === 0)}
          className="flex-1 flex items-center justify-center gap-2 bg-brand-400 hover:bg-brand-500 text-gray-900 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? "Sparar..." : "Spara"}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div
          className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
            status.type === "success"
              ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
          }`}
        >
          {status.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {status.message}
        </div>
      )}

      {/* AI Analysis */}
      {analysis && !analysis.error && (
        <div className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-sm mb-3">AI Analysis</h3>
          <div className="space-y-2 text-sm">
            {analysis.summary && (
              <p><span className="font-medium">Summary:</span> {analysis.summary}</p>
            )}
            {analysis.category && (
              <p><span className="font-medium">Category:</span> {analysis.category}</p>
            )}
            {analysis.topics && analysis.topics.length > 0 && (
              <p><span className="font-medium">Topics:</span> {analysis.topics.join(", ")}</p>
            )}
            {analysis.entities && analysis.entities.length > 0 && (
              <p><span className="font-medium">Entities:</span> {analysis.entities.join(", ")}</p>
            )}
            {analysis.sentiment && (
              <p><span className="font-medium">Sentiment:</span> {analysis.sentiment}</p>
            )}
            {analysis.action_items && analysis.action_items.length > 0 && (
              <div>
                <span className="font-medium">Action Items:</span>
                <ul className="list-disc list-inside mt-1">
                  {analysis.action_items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
