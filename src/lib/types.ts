export interface AiAnalysis {
  title?: string;
  summary?: string;
  category?: string;
  topics?: string[];
  entities?: string[];
  sentiment?: string;
  action_items?: string[];
  key_points?: string[];
  error?: string;
  _lang?: string;
  _translations?: Record<string, Partial<AiAnalysis>>;
}

export interface Entry {
  id: string;
  content: string;
  ai_analysis: AiAnalysis | null;
  file_type: string | null;
  file_name: string | null;
  created_at: string;
  updated_at?: string | null;
  archived?: boolean;
  embedding?: number[] | null;
  similarity?: number;
  image_url?: string | null;
}
