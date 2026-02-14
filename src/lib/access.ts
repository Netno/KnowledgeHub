export function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = (
    process.env.ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
    ""
  )
    .split(",")
    .map((e) => e.trim().toLowerCase());
  return adminEmails.includes(email.toLowerCase());
}

export function isAllowedUser(email: string | undefined): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  const domain = emailLower.split("@")[1] || "";

  const allowedEmails = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const allowedDomains = (process.env.ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase());

  return allowedEmails.includes(emailLower) || allowedDomains.includes(domain);
}
