# Changelog

## Unreleased

### Added
- React, TypeScript, Vite, and Tailwind application foundation.
- Local Supabase configuration and default-deny database baseline.
- Structured client error logger that omits raw error messages.
- Formatting, lint, typecheck, unit-test, build, and database CI workflows.
- Optional Vercel preview/production deployment workflow, activated only after project secrets are configured.
- Hosted Supabase foundation setup for separate staging and production projects.

### Security
- Restricted direct API execution of the Supabase RLS auto-enable event-trigger function while preserving its internal event-trigger behavior.
