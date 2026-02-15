"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  Search,
  FolderOpen,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
} from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/lib/use-language";

interface NavProps {
  email: string;
  isAdmin: boolean;
}

const labels = {
  sv: {
    add: "Lägg till",
    search: "Sök",
    browse: "Bläddra",
    admin: "Admin",
    signOut: "Logga ut",
  },
  en: {
    add: "Add",
    search: "Search",
    browse: "Browse",
    admin: "Admin",
    signOut: "Sign Out",
  },
};

function getNavItems(lang: "sv" | "en", isAdmin: boolean) {
  const t = labels[lang];
  const items = [
    { href: "/", label: t.add, icon: PlusCircle },
    { href: "/search", label: t.search, icon: Search },
    { href: "/browse", label: t.browse, icon: FolderOpen },
  ];
  if (isAdmin) items.push({ href: "/admin", label: t.admin, icon: Settings });
  return items;
}

export default function Nav({ email, isAdmin }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { language, setLanguage } = useLanguage();

  const navItems = getNavItems(language as "sv" | "en", isAdmin);
  const t = labels[(language as "sv" | "en") || "sv"];

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="40" r="24" fill="#FBBF24" opacity="0.25" />
              <path
                d="M50 18C38.95 18 30 26.95 30 38c0 7.5 4.1 14 10.2 17.5 1.3.75 2.3 2 2.6 3.5l.7 3h12.9l.7-3c.3-1.5 1.3-2.75 2.6-3.5C65.9 52 70 45.5 70 38c0-11.05-8.95-20-20-20z"
                fill="#FBBF24"
              />
              <rect x="40" y="65" width="20" height="4" rx="2" fill="#9CA3AF" />
              <rect x="42" y="71" width="16" height="4" rx="2" fill="#9CA3AF" />
              <rect x="44" y="77" width="12" height="4" rx="2" fill="#9CA3AF" />
            </svg>
            <span className="text-lg font-bold hidden sm:inline">
              KnowledgeHub
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-400 text-gray-900"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User + language + sign out (desktop) */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === "sv" ? "en" : "sv")}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded border border-gray-200 dark:border-gray-700"
              title={
                language === "sv" ? "Switch to English" : "Byt till svenska"
              }
            >
              <Globe size={12} />
              {language === "sv" ? "SV" : "EN"}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isAdmin ? "👑" : "👤"} {email}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors rounded"
            >
              <LogOut size={14} />
              {t.signOut}
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 dark:text-gray-400"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-3 border-t border-gray-100 dark:border-gray-800">
            <nav className="flex flex-col gap-1 pt-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-400 text-gray-900"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between px-3">
              <span className="text-xs text-gray-500">{email}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLanguage(language === "sv" ? "en" : "sv")}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded border border-gray-200 dark:border-gray-700"
                >
                  <Globe size={12} />
                  {language === "sv" ? "SV" : "EN"}
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1 text-xs text-red-500"
                >
                  <LogOut size={14} />
                  {t.signOut}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
