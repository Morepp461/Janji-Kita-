# Janji Kita

Platform SaaS untuk membuat, mengedit, menerbitkan, mengelola, dan membagikan undangan digital.

## Documentation

Project source of truth and implementation specifications are maintained in [docs/](./docs/):
- [PRD](./docs/PRD.md)
- [System Architecture](./docs/SYSTEM_ARCHITECTURE.md)
- [Database Schema](./docs/DATABASE_SCHEMA.md)
- [UI/UX Specification](./docs/UI_UX_SPECIFICATION.md)
- [Editor Specification](./docs/EDITOR_SPECIFICATION.md)
- [Monetization Specification](./docs/MONETIZATION_SPECIFICATION.md)
- [Development Roadmap](./docs/DEVELOPMENT_ROADMAP.md)
- [Developer README](./docs/README.md)

## Quick start

Requirements: Node.js 22, npm 10+, Docker, and Supabase CLI.

```bash
nvm use
npm install
cp .env.example .env.local
npm run dev
```

For local database development:

```bash
supabase start
supabase db reset
supabase test db
```

Run all web quality checks:

```bash
npm run check
```

Do not commit local environment files. Only public Supabase URL and anon/publishable key may be exposed to browser code. Service-role and payment server keys must remain server-side.

See [docs/README.md](./docs/README.md) for setup, testing, security, and deployment details.
