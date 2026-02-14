# KnowledgeHub 💡

A personal web app for capturing and querying product feedback using AI.

## Features

- 📝 **Log Feedback**: Capture feedback with auto-categorization
- 🔍 **Query Data**: Semantic search powered by AI
- 📊 **Explore**: Browse and filter feedback entries
- 🖼️ **Image Analysis**: Upload screenshots for AI analysis
- 🔐 **Google OAuth**: Secure authentication via Supabase

## Tech Stack

- **Frontend**: Streamlit
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI**: Google Gemini API
- **Auth**: Google OAuth via Supabase Auth
- **Hosting**: Streamlit Community Cloud

## Setup Instructions

### 1. Google OAuth Setup

#### Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth 2.0 Client ID**
5. Configure OAuth consent screen (if not done):
   - User Type: External
   - App name: KnowledgeHub
   - Add your email as test user
6. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: KnowledgeHub
   - Authorized redirect URIs: `https://your-project.supabase.co/auth/v1/callback`
7. Save the **Client ID** and **Client Secret**

#### Configure Supabase Auth

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Navigate to **Authentication** > **Providers**
3. Enable **Google** provider
4. Enter your Google OAuth **Client ID** and **Client Secret**
5. Copy the **Callback URL** if you need to update Google Console

### 2. Supabase Database Setup

1. Go to **SQL Editor** in Supabase Dashboard
2. Run the following SQL to create the table and function:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create feedback table
CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  product TEXT NOT NULL,
  feedback TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  image_description TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX ON feedback USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create search function
CREATE OR REPLACE FUNCTION match_feedback(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  product TEXT,
  feedback TEXT,
  category TEXT,
  source TEXT,
  image_description TEXT,
  created_at TIMESTAMPTZ,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    feedback.id,
    feedback.user_id,
    feedback.product,
    feedback.feedback,
    feedback.category,
    feedback.source,
    feedback.image_description,
    feedback.created_at,
    1 - (feedback.embedding <=> query_embedding) as similarity
  FROM feedback
  WHERE 1 - (feedback.embedding <=> query_embedding) > match_threshold
  ORDER BY feedback.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Enable Row Level Security
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Users can view their own feedback"
  ON feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback"
  ON feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### 3. Configure Secrets

1. Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml`
2. Fill in your credentials:

```toml
[supabase]
url = "https://your-project.supabase.co"
key = "your-anon-key"

[gemini]
api_key = "your-gemini-api-key"
```

**Get your credentials:**

- **Supabase URL & Key**: Project Settings > API
- **Gemini API Key**: [Google AI Studio](https://makersuite.google.com/app/apikey)

### 4. Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run the app
streamlit run app.py
```

### 5. Deploy to Streamlit Community Cloud

1. Push code to GitHub
2. Go to [share.streamlit.io](https://share.streamlit.io/)
3. Connect your GitHub repository
4. Add secrets in **Advanced settings** (same format as secrets.toml)
5. Deploy!

## Usage

### Log Feedback

1. Enter product/feature name
2. Describe the feedback
3. Select source
4. Optionally upload a screenshot
5. Click "Save Feedback"

### Query Data

1. Enter your question or search term
2. Optionally filter by product
3. View semantic search results

### Explore

1. Browse all feedback entries
2. Filter by product, category, or source
3. View summary statistics

## Security Notes

- Never commit `.streamlit/secrets.toml` to version control
- Use environment variables in production
- Enable RLS policies in Supabase
- Keep API keys secure

## License

Personal project - Not for commercial use

## Support

For issues, please contact the repository owner.
