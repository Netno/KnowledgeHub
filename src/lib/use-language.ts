"use client";

import { useState, useEffect } from "react";

export type Language = "sv" | "en";

const STORAGE_KEY = "knowledgehub-language";

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("sv");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "sv" || stored === "en") {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent("language-change", { detail: lang }));
  };

  return { language, setLanguage };
}

export function getLanguage(): Language {
  if (typeof window === "undefined") return "sv";
  const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
  return stored === "en" ? "en" : "sv";
}
