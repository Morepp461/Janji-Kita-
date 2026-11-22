# Security Policy

## Supported Versions

Security fixes are applied to the current default branch.

## Reporting a Vulnerability

Please use GitHub's private vulnerability reporting for this repository when it is enabled. Do not publish exploit details, credentials, personal data, or production tokens in public issues.

## Secrets and Environment Policy

- Never commit real credentials, access tokens, service-role keys, payment server keys, or private signing material.
- Browser-exposed variables must use only public/publishable credentials.
- Supabase service-role and payment server keys belong only in trusted server/deployment secret stores.
- Do not prefix secrets with `VITE_`.
- Rotate any credential suspected of exposure and review repository history.
- Keep local `.env*` files out of Git; only `.env.example` may be committed.
