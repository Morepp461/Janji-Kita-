const STAGING_PROJECT_REF = "kcdydzdwfgdccbqbqcof";

export function isStagingSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === `${STAGING_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}
