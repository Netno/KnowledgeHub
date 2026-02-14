export interface AiAnalysis {
  summary?: string;
  category?: string;
  topics?: string[];
  entities?: string[];
  sentiment?: string;
  action_items?: string[];
  key_points?: string[];
  error?: string;
}

export interface Entry {
  id: string;
  content: string;
  ai_analysis: AiAnalysis | null;
  file_type: string | null;
  file_name: string | null;
  created_at: string;
  archived?: boolean;
  embedding?: number[] | null;
  similarity?: number;
}
