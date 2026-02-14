import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/access";
import { redirect } from "next/navigation";
import Nav from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.email || "";
  const admin = isAdmin(email);

  return (
    <div className="min-h-screen">
      <Nav email={email} isAdmin={admin} />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <p className="text-xs text-gray-400 text-center">
            KnowledgeHub &bull; AI-powered knowledge capture
          </p>
        </div>
      </footer>
    </div>
  );
}
