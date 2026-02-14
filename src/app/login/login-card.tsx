"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginCard({ error }: { error?: string }) {
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="40" r="24" fill="#FBBF24" opacity="0.25" />
            <path
              d="M50 18C38.95 18 30 26.95 30 38c0 7.5 4.1 14 10.2 17.5 1.3.75 2.3 2 2.6 3.5l.7 3h12.9l.7-3c.3-1.5 1.3-2.75 2.6-3.5C65.9 52 70 45.5 70 38c0-11.05-8.95-20-20-20z"
              fill="#FBBF24"
            />
            <rect x="40" y="65" width="20" height="4" rx="2" fill="#9CA3AF" />
            <rect x="42" y="71" width="16" height="4" rx="2" fill="#9CA3AF" />
            <rect x="44" y="77" width="12" height="4" rx="2" fill="#9CA3AF" />
            <line
              x1="50"
              y1="8"
              x2="50"
              y2="14"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="76"
              y1="38"
              x2="82"
              y2="38"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="18"
              y1="38"
              x2="24"
              y2="38"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="68"
              y1="20"
              x2="72"
              y2="16"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="28"
              y1="16"
              x2="32"
              y2="20"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            KnowledgeHub
          </h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Sign in to continue
        </p>

        {error === "access_denied" && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 text-sm">
            You do not have permission to sign in.
          </div>
        )}

        {error === "auth_failed" && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 text-sm">
            Authentication failed. Please try again.
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
