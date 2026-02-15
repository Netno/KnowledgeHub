"use client";

import { useState, useCallback, useRef, useEffect, DragEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Save,
  Paperclip,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  X,
  Link,
  Globe,
} from "lucide-react";
import type { AiAnalysis } from "@/lib/types";
import { getLanguage } from "@/lib/use-language";
import { useLanguage } from "@/lib/use-language";

export default function AddPage() {
  const { language } = useLanguage();
  const sv = language === "sv";
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileStatus, setFileStatus] = useState<string>("");
  const [showPreview] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  // Auto-resize textarea when content changes programmatically
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.max(96, el.scrollHeight) + "px";
    }
  }, [content]);

  // URL detection regex
  const urlRegex = /https?:\/\/[^\s]+/;

  // Detect URL when content changes
  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);
      const trimmed = value.trim();
      // If the entire content is just a URL (or URL + whitespace), offer to fetch it
      const match = trimmed.match(/^(https?:\/\/[^\s]+)\s*$/);
      if (match && !sourceUrl) {
        setDetectedUrl(match[1]);
      } else {
        setDetectedUrl(null);
      }
    },
    [sourceUrl],
  );

  // Fetch content from a URL
  const fetchUrlContent = useCallback(
    async (url: string) => {
      setUrlLoading(true);
      setDetectedUrl(null);
      setFileStatus(
        sv
          ? `🌐 Hämtar innehåll från URL...`
          : `🌐 Fetching content from URL...`,
      );
      try {
        const res = await fetch("/api/extract-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch URL");

        const { title, text, imageUrl } = data;
        const header = title ? `[${title}]` : `[${url}]`;
        const body = `${header}\nKälla: ${url}\n\n${text}`;
        setContent(body);
        setSourceUrl(url);
        if (imageUrl) setSourceImageUrl(imageUrl);
      } catch (err) {
        setStatus({
          type: "error",
          message: `${sv ? "Kunde inte hämta URL" : "Could not fetch URL"}: ${err}`,
        });
      } finally {
        setUrlLoading(false);
        setFileStatus("");
      }
    },
    [sv],
  );

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Extract content from any supported file
  const extractFileContent = useCallback(
    async (
      file: File,
    ): Promise<{
      text: string;
      type: "text" | "image" | "document";
    } | null> => {
      const name = file.name.toLowerCase();
      const mime = file.type;

      // Plain text files — read directly
      const textTypes = [
        "text/",
        "application/json",
        "application/xml",
        "application/csv",
      ];
      const textExtensions = [
        ".txt",
        ".csv",
        ".json",
        ".xml",
        ".md",
        ".log",
        ".html",
        ".css",
        ".js",
        ".ts",
        ".py",
      ];
      const isText =
        textTypes.some((t) => mime.startsWith(t)) ||
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
        const res = await fetch("/api/describe-image", {
          method: "POST",
          body: formData,
        });
        const { description } = await res.json();
        setFileStatus("");
        if (description) return { text: description, type: "image" };
        return null;
      }

      // PDF, DOCX, XLSX — send to extract-text API
      if (
        name.endsWith(".pdf") ||
        name.endsWith(".docx") ||
        name.endsWith(".doc") ||
        name.endsWith(".xlsx") ||
        name.endsWith(".xls")
      ) {
        const label = name.endsWith(".pdf")
          ? "PDF"
          : name.endsWith(".xlsx") || name.endsWith(".xls")
            ? "Excel"
            : "Word";
        setFileStatus(`📄 Läser ${label}: ${file.name}...`);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract-text", {
          method: "POST",
          body: formData,
        });
        const { text } = await res.json();
        setFileStatus("");
        if (text) return { text, type: "document" };
        return null;
      }

      return null;
    },
    [],
  );

  // Process files: extract content and append to textarea
  const processFiles = useCallback(
    async (fileList: File[]) => {
      setProcessing(true);
      for (const file of fileList) {
        const result = await extractFileContent(file);
        if (result) {
          const prefix =
            result.type === "image" ? `[Bild: ${file.name}]` : `[${file.name}]`;
          setContent(
            (prev) => prev + (prev ? "\n\n" : "") + `${prefix}\n${result.text}`,
          );
        } else {
          addFiles([file]);
        }
      }
      setProcessing(false);
    },
    [extractFileContent, addFiles],
  );

  // Handle paste — text goes into textarea, files get added as attachments
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      let hasFiles = false;

      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            // Give pasted images a name if they don't have one
            const namedFile =
              file.name === "image.png" || !file.name
                ? new File(
                    [file],
                    `paste-${Date.now()}.${file.type.split("/")[1] || "png"}`,
                    { type: file.type },
                  )
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
    },
    [processFiles],
  );

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

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      dragCounter.current = 0;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      await processFiles(droppedFiles);
    },
    [processFiles],
  );

  const handleSave = useCallback(async () => {
    if (!content.trim() && files.length === 0) {
      setStatus({
        type: "error",
        message: "Lägg till innehåll eller bifoga en fil.",
      });
      return;
    }

    setSaving(true);
    setStatus(null);
    setAnalysis(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        file_type: sourceUrl ? "url" : files.length > 0 ? files[0].type : null,
        file_name: sourceUrl || (files.length > 0 ? files[0].name : null),
        image_url: sourceImageUrl || null,
        embedding,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      setStatus({ type: "success", message: "Sparad!" });
      setContent("");
      setFiles([]);
      setAnalysis(null);
      setSourceUrl(null);
      setSourceImageUrl(null);
    } catch (err) {
      setStatus({ type: "error", message: `Error: ${err}` });
    } finally {
      setSaving(false);
    }
  }, [content, files]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {sv ? "Lägg till kunskap" : "Add Knowledge"}
      </h1>

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
          onChange={(e) => {
            handleContentChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.max(96, e.target.scrollHeight) + "px";
          }}
          onPaste={handlePaste}
          placeholder={
            sv
              ? "Skriv, klistra in text/filer, eller dra & släpp filer här..."
              : "Type, paste text/files, or drag & drop files here..."
          }
          className="w-full min-h-[6rem] max-h-[70vh] px-4 py-3 rounded-xl bg-white dark:bg-gray-900 resize-y focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm border-0"
        />
      </div>

      {/* Image preview below textarea */}
      {sourceImageUrl && (
        <div className="mt-2 flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <img
            src={sourceImageUrl}
            alt=""
            className="h-16 w-16 object-cover rounded-lg"
          />
          <span className="text-xs text-gray-500">
            {sv ? "Bild sparas med posten" : "Image will be saved with entry"}
          </span>
        </div>
      )}

      {/* URL detected banner */}
      {detectedUrl && !urlLoading && (
        <div className="mt-2 flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <Globe size={16} className="text-blue-500 shrink-0" />
          <span className="text-sm text-blue-700 dark:text-blue-300 flex-1 truncate">
            {sv ? "URL upptäckt" : "URL detected"}: {detectedUrl}
          </span>
          <button
            onClick={() => fetchUrlContent(detectedUrl)}
            className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium shrink-0"
          >
            {sv ? "Hämta innehåll" : "Fetch content"}
          </button>
          <button
            onClick={() => setDetectedUrl(null)}
            className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {urlLoading && (
        <div className="mt-2 flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Loader2 size={16} className="animate-spin text-blue-500" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            {sv
              ? "Hämtar innehåll från URL..."
              : "Fetching content from URL..."}
          </span>
        </div>
      )}

      {/* Source URL indicator */}
      {sourceUrl && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <Link size={12} />
          <span>{sv ? "Källa" : "Source"}:</span>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 hover:underline truncate"
          >
            {sourceUrl}
          </a>
          <button
            onClick={() => setSourceUrl(null)}
            className="text-gray-400 hover:text-red-500"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* File upload + attached files */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-brand-500 transition-colors">
          <Paperclip size={16} />
          <span>{sv ? "Bifoga filer" : "Attach files"}</span>
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
                    <button
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500"
                    >
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

      {/* Content stats */}
      {content.trim() && (
        <div className="mt-2 text-xs text-gray-400">
          {content.length.toLocaleString()} {sv ? "tecken" : "chars"} &middot; ~
          {content.split(/\s+/).length} {sv ? "ord" : "words"} &middot;{" "}
          {content.split("\n").length} {sv ? "rader" : "lines"}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSave}
          disabled={
            saving || processing || (!content.trim() && files.length === 0)
          }
          className="flex-1 flex items-center justify-center gap-2 bg-brand-400 hover:bg-brand-500 text-gray-900 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Save size={18} />
          )}
          {saving ? (sv ? "Sparar..." : "Saving...") : sv ? "Spara" : "Save"}
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
          {status.type === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {status.message}
        </div>
      )}

      {/* AI Analysis */}
      {analysis && !analysis.error && (
        <div className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-sm mb-3">
            {sv ? "AI-analys" : "AI Analysis"}
          </h3>
          <div className="space-y-2 text-sm">
            {analysis.summary && (
              <p>
                <span className="font-medium">
                  {sv ? "Sammanfattning:" : "Summary:"}
                </span>{" "}
                {analysis.summary}
              </p>
            )}
            {analysis.category && (
              <p>
                <span className="font-medium">
                  {sv ? "Kategori:" : "Category:"}
                </span>{" "}
                {analysis.category}
              </p>
            )}
            {analysis.topics && analysis.topics.length > 0 && (
              <p>
                <span className="font-medium">{sv ? "Ämnen:" : "Topics:"}</span>{" "}
                {analysis.topics.join(", ")}
              </p>
            )}
            {analysis.entities && analysis.entities.length > 0 && (
              <p>
                <span className="font-medium">
                  {sv ? "Entiteter:" : "Entities:"}
                </span>{" "}
                {analysis.entities.join(", ")}
              </p>
            )}
            {analysis.sentiment && (
              <p>
                <span className="font-medium">
                  {sv ? "Sentiment:" : "Sentiment:"}
                </span>{" "}
                {analysis.sentiment}
              </p>
            )}
            {analysis.action_items && analysis.action_items.length > 0 && (
              <div>
                <span className="font-medium">
                  {sv ? "Åtgärder:" : "Action Items:"}
                </span>
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
