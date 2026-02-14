"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, Paperclip, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import type { AiAnalysis } from "@/lib/types";

export default function AddPage() {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);

  const handleSave = useCallback(async () => {
    if (!content.trim() && files.length === 0) {
      setStatus({ type: "error", message: "Add some content or attach a file." });
      return;
    }

    setSaving(true);
    setStatus(null);
    setAnalysis(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let fullContent = content;

      // Process text-based files
      for (const file of files) {
        const text = await file.text();
        fullContent += `\n\n[${file.type || "FILE"}: ${file.name}]\n${text.slice(0, 5000)}`;
      }

      // AI Analysis
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fullContent,
          fileInfo: files.length > 0 ? `${files.length} file(s)` : undefined,
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

      setStatus({ type: "success", message: "Saved!" });
      setContent("");
      setFiles([]);
    } catch (err) {
      setStatus({ type: "error", message: `Error: ${err}` });
    } finally {
      setSaving(false);
    }
  }, [content, files]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Add Knowledge</h1>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type or paste text here..."
        className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
      />

      {/* File upload */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-brand-500 transition-colors">
          <Paperclip size={16} />
          <span>Attach files</span>
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.csv,.pdf,.txt,.xlsx,.docx"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="hidden"
          />
        </label>
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span key={i} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-brand-400 hover:bg-brand-500 text-gray-900 font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        {saving ? "Saving..." : "Save"}
      </button>

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
