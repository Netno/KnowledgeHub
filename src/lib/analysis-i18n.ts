import type { AiAnalysis } from "./types";

/**
 * Get the AI analysis fields in the desired language.
 * Falls back to the original if no translation exists.
 */
export function getLocalizedAnalysis(
  analysis: AiAnalysis | null,
  lang: string,
): AiAnalysis | null {
  if (!analysis) return null;

  const storedLang = analysis._lang || "en";

  // Already in the right language
  if (storedLang === lang) return analysis;

  // Check for cached translation
  const translation = analysis._translations?.[lang];
  if (translation) {
    return {
      ...analysis,
      summary: translation.summary || analysis.summary,
      category: translation.category || analysis.category,
      topics: translation.topics || analysis.topics,
      entities: translation.entities || analysis.entities,
      sentiment: translation.sentiment || analysis.sentiment,
      action_items: translation.action_items || analysis.action_items,
      key_points: translation.key_points || analysis.key_points,
    };
  }

  // No translation available — return original
  return analysis;
}

/**
 * Check if an entry needs translation for the given language.
 */
export function needsTranslation(
  analysis: AiAnalysis | null,
  lang: string,
): boolean {
  if (!analysis) return false;
  const storedLang = analysis._lang || "en";
  if (storedLang === lang) return false;
  if (analysis._translations?.[lang]) return false;
  return true;
}
