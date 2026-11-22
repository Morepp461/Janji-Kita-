# UI/UX SPECIFICATION — JANJI KITA
**Versi:** 1.0 | **Status:** Final baseline

## 1. Experience Principles
Mobile-first; clear hierarchy; minimal steps; autosave visibility; explicit price before payment; safe publishing; no hidden controls; consistent empty/loading/error/success states. Dashboard combines clean premium productivity UI with a creative editor. Dashboard supports light and dark mode. Invitation templates remain visually diverse rather than forcing one brand style.

## 2. Navigation
### Public navigation
- Home
- Jelajahi Template
- Kategori
- Cara Kerja
- Harga
- Login / Daftar

### Authenticated customer navigation
- Dashboard
- Undangan Saya
- Buat Undangan
- Template
- Tamu & RSVP
- Pesanan & Pembayaran
- Kolaborasi
- Pengaturan Akun

### Reseller navigation
- Ringkasan
- Klien/Undangan
- Buat Undangan
- Harga Reseller
- Pesanan
- Laporan

### Admin navigation
- Overview
- Users & Roles
- Templates
- Categories & Styles
- Editor Assets
- Add-ons & Pricing
- Orders & Payments
- Coupons
- Subscriptions
- Resellers
- Moderation
- Analytics
- Localization
- System Settings
- Audit Log

## 3. Page Specifications
### Landing page `/`
Sections: hero + primary CTA, value proposition, category shortcuts, featured templates, workflow explanation, feature highlights, pricing explanation, FAQ, footer. Mobile: stacked sections, sticky CTA optional but must not cover content.

### Marketplace `/templates`
Search, category/style filters, sort, responsive grid, pagination/infinite load, skeletons, no-results state. Template card: preview, title, category, style, price, use-template action. Avoid displaying unverified feature claims.

### Template detail `/templates/:slug`
Large preview, mobile/desktop toggle, included components, add-ons, base price, compatibility/limitations, use-template CTA. Gallery assets lazy-loaded.

### Authentication
Register, login, reset password, verification feedback. Forms label fields, show password visibility toggle, validate inline, preserve safe form state.

### Customer dashboard `/dashboard`
Overview cards: total invitations, active, drafts, expiring soon, recent orders. Primary create action. Invitation list with status, expiry date, quick actions. Empty state guides user to create first draft.

### Invitation workspace `/invitations/:id`
Tabs: Overview, Editor, Guests, RSVP, Analytics, Collaborators, Orders/Access, Settings. Show invitation state and expiry prominently. Tabs hidden/disabled when not entitled, with explanation.

### Editor `/invitations/:id/editor`
Desktop layout:
- Top bar: back, invitation name, save state, undo/redo, preview, update/publish.
- Left panel: pages/sections/layers/assets/components.
- Center: canvas with viewport controls.
- Right panel: contextual properties.
- Bottom/status area: zoom, device preview, validation.
Mobile layout:
- Top compact bar with save state and preview.
- Canvas takes primary area.
- Bottom toolbar for Add, Layers, Style, Content, Assets.
- Properties open as full-height drawer/sheet.
- Drag operations must not conflict with page scrolling; provide tap-to-select and numeric position/size controls as alternative.
- No tiny desktop-only handles. Use accessible touch targets.
Editor controls: add, delete, duplicate, reorder, hide/show, lock, group, align, layer order, content/style edit, copy/paste style, reusable components, undo/redo, autosave, preview, draft save, publish update.

### Checkout `/checkout/:order`
Order summary, itemized base price/add-ons, discount, tax/fees if applicable, total, payer/owner/reseller context, optional marketplace design consent (unchecked), terms acceptance, payment method handoff. No preselected optional consent. Display expiry duration and exact start rule.

### Payment result
Pending, success, failed, cancelled, expired states. Do not infer success from redirect alone. Success page links to published invitation and dashboard. Pending page polls/rechecks safely.

### Public invitation `/i/:slug`
Render active published version only. Sections may include opening, hero, names/title, countdown, schedule, location/maps, gallery, video, audio, RSVP, guestbook, gift info, livestream, tickets, seating, footer. Respect mobile safe area, reduced motion, loading and media fallback. If expired, show expired state without event/guest private details.

### Guest manager
Table/list with search, filters, RSVP status, attendance, import/export, manual add, personalized invitation link, QR/ticket, bulk actions with confirmation. On mobile use cards or responsive table.

### RSVP
Guest-facing form with minimal fields and clear success state. Guest token validates invitation/guest access. Rate limit and duplicate response rules.

### Check-in
Camera permission explanation, scanner view, manual lookup fallback, success/already-used/invalid states, attendance count. Do not show unnecessary guest personal data.

### Collaborators
List owner and collaborators, invite by email, role, pending/accepted/revoked status, remove access confirmation, current entitlement limit.

### Reseller dashboard
Orders and invitations, client/owner/payer context, wholesale price, reseller margin/report, status filters. Clearly distinguish recorded resale price from platform-collected payment.

### Admin console
Data tables with search/filter/pagination, create/edit forms, confirmation for destructive actions, audit preview, role-based controls, safe defaults. Critical configuration requires confirmation and audit event.

## 4. Design System
- Typography: readable sans-serif for UI; template typography may vary.
- Spacing scale: 4/8/12/16/24/32/48.
- Radius: consistent small/medium/large tokens.
- Colors: semantic tokens for background, surface, text, muted, border, primary, success, warning, danger.
- Light/dark dashboard themes.
- Focus states visible; contrast meets WCAG AA target.
- Buttons have primary/secondary/tertiary/destructive variants.
- Inputs show label, helper, error, disabled, loading.
- Motion respects `prefers-reduced-motion`.

## 5. Responsive Breakpoints
Suggested CSS breakpoints: mobile <640px; tablet 640–1023px; desktop >=1024px. These are layout breakpoints, not device restrictions. Editor must remain usable at 360px viewport width and common Android browsers. No fixed-width page causing horizontal overflow.

## 6. Global UI States
Every async page supports loading/skeleton, empty, error with retry, success confirmation, offline/network failure, permission denied, and access denied. Autosave state must distinguish Saving, Saved, Offline, Conflict, and Error. Never show raw JSON/ref/version internals to end users.

## 7. Accessibility and Content
Keyboard navigation, semantic headings, form labels, focus management, alt text, caption/transcript where applicable, contrast, reduced motion, and clear language. Public invitation media must not autoplay with sound. Provide controls for audio/video.

## 8. UX Acceptance Checklist
- Main flows usable on Android at 360px width.
- No modal traps or hidden primary action.
- Price and expiry are clear before payment.
- Optional consent is unchecked by default.
- Editor autosave status visible.
- Draft edits never silently replace published version.
- Expired page does not expose private information.
- All visible controls work and have loading/error states.
