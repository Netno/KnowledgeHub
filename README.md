# KnowledgeHub

AI-powered knowledge capture and semantic search. Built with Next.js, Supabase, and Google Gemini.

## Features

- **Google OAuth** — Sign in with Google via Supabase Auth
- **AI Analysis** — Automatic content analysis using Gemini (category, topics, sentiment, entities, action items)
- **Semantic Search** — Vector similarity search with AI-generated summaries
- **File Support** — Upload and analyze text, CSV, PDF, images
- **Access Control** — Email/domain allowlist + admin roles
- **Responsive** — Works on desktop and mobile
- **Dark Mode** — Automatic based on system preference

## Tech Stack

- **Next.js** — React framework (App Router)
- **Supabase** — Auth, PostgreSQL database, pgvector
- **Google Gemini** — AI analysis and embeddings
- **Tailwind CSS** — Styling
- **Vercel** — Deployment

## Setup

### 1. Environment Variables

Set these in `.env.local` (local) or Vercel dashboard (production):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-api-key
ALLOWED_EMAILS=user@example.com
ALLOWED_DOMAINS=example.com
ADMIN_EMAILS=admin@example.com
```

### 2. Supabase

- Enable Google OAuth in Authentication > Providers
- Run the SQL setup to create tables and functions (see `supabase_setup.sql` in git history)
- Add your Vercel URL to Authentication > URL Configuration > Redirect URLs: `https://your-app.vercel.app/auth/callback`

### 3. Google OAuth

In Google Cloud Console:
- Add `https://your-app.vercel.app` to Authorized JavaScript Origins
- Add `https://<supabase-project>.supabase.co/auth/v1/callback` to Authorized Redirect URIs

### 4. Deploy

```bash
npm install
npm run dev     # local development
npm run build   # production build
```

Connected to GitHub? Push to `main` and Vercel deploys automatically.
