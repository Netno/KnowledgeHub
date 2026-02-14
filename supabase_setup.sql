-- KnowledgeHub Database Setup
-- Run this in Supabase SQL Editor

-- DROP existing objects (if they exist)
DROP POLICY IF EXISTS "Users can view their own feedback" ON feedback;
DROP POLICY IF EXISTS "Users can insert their own feedback" ON feedback;
DROP POLICY IF EXISTS "feedback_allow_all" ON feedback;
DROP FUNCTION IF EXISTS match_feedback(vector, float, int);
DROP TABLE IF EXISTS feedback CASCADE;
DROP TABLE IF EXISTS entries CASCADE;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create entries table (flexible schema)
CREATE TABLE entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  content TEXT NOT NULL,
  ai_analysis JSONB,
  file_type TEXT,
  file_name TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX ON entries USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create search function
CREATE OR REPLACE FUNCTION match_entries(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  ai_analysis JSONB,
  file_type TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    entries.id,
    entries.user_id,
    entries.content,
    entries.ai_analysis,
    entries.file_type,
    entries.file_name,
    entries.created_at,
    1 - (entries.embedding <=> query_embedding) as similarity
  FROM entries
  WHERE 1 - (entries.embedding <=> query_embedding) > match_threshold
  ORDER BY entries.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Enable Row Level Security
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Users can view their own entries"
  ON entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own entries"
  ON entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
