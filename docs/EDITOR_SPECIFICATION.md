# EDITOR SPECIFICATION — JANJI KITA
**Versi:** 1.0 | **Status:** Final baseline

## 1. Product Definition
The editor is a structured, no-code visual editor for responsive invitation pages. It supports template-based creation, blank canvas, and supported imports. It is not a general-purpose website builder and does not execute arbitrary JavaScript.

## 2. Document Model
Root document:
- `schemaVersion`
- `documentId`
- `locale`, `timezone`
- `themeTokens`
- `pages[]`
- `assets[]`
- `metadata`
Each page contains ordered sections. Each section contains typed component nodes. Every node has stable `id`, `type`, `props`, `style`, `responsive`, `children`, and optional `locked/hidden` flags. Store asset references by internal asset ID, not raw public URLs.

## 3. Component Registry
Core components:
- Layout: Section, Container, Columns, Spacer, Divider.
- Text: Heading, Paragraph, RichText (sanitized subset).
- Media: Image, Gallery, Video, Audio.
- Event: Countdown, EventSchedule, Venue, MapLink, RSVP, Guestbook, GiftInfo.
- Guest-specific: PersonalizedGreeting, QRTicket, SeatingInfo.
- Social: ShareButtons, LivestreamLink.
- Decoration: Shape, Icon, Pattern, Background.
Every component declares schema, default props, allowed style properties, responsive behavior, accessibility rules, and renderer implementation. Registry version is stored with document schema.

## 4. Canvas and Editing
Invitation owners/managers can set the invitation content locale and event timezone independently from their dashboard language. Options come from the active locale/timezone catalog, are validated on the server, and control date/time formatting in the public renderer.
- Add component from library.
- Select by canvas or layer panel.
- Drag/drop to reorder or position where component supports free positioning.
- Resize using handles and numeric width/height controls.
- Set x/y only within allowed canvas/container bounds for free-positioned elements.
- Set margins, padding, gap, alignment, distribution, width constraints.
- Arrange front/back, bring forward/send backward.
- Group/ungroup compatible nodes.
- Lock/unlock and hide/show.
- Duplicate/delete with confirmation for destructive bulk actions.
- Copy/paste style and duplicate section.
- Undo/redo command history.
- Snap guides/grid and safe-area overlays.
- Multi-select where supported.

## 5. Property Inspector
Contextual tabs:
1. Content: text, image source, labels, links, date/time, event data.
2. Style: typography, colors, border, radius, shadow, background, spacing.
3. Layout: width, height, alignment, constraints, position.
4. Responsive: desktop/tablet/mobile overrides, visibility, stacking.
5. Motion: approved animation presets, duration, delay, trigger, reduced-motion fallback.
6. Accessibility: alt text, label, contrast warnings.
Inputs must support keyboard entry and touch-friendly controls. Validate numeric values and clamp unsafe values.

## 6. Sections and Reusable Components
Users can add, delete, duplicate, rename, reorder, hide/show, and configure sections. Reusable components can be saved to personal library and inserted into another invitation. Reusable components are copied by value at insertion unless linked-component behavior is explicitly implemented. Do not silently propagate edits to already-published invitations.

## 7. Asset Library
Upload photos, video, and audio. Select fonts, illustrations, decorations, backgrounds, patterns, and animations from approved libraries. Asset pipeline:
1. Create upload intent server-side.
2. Upload to private temporary location.
3. Validate extension, MIME signature, size, dimensions/duration.
4. Scan if available.
5. Process/optimize variants.
6. Mark ready and attach to document.
7. Cleanup abandoned temporary files.
Asset rights/license metadata must be recorded. Unsupported file types rejected with human-readable explanation.

## 8. Import Pipeline
Supported targets depend on actual parser/API availability:
- Canva/Figma: official API/export/import flow only when authorized and available.
- PSD/AI/Affinity: layered import only when parser supports the file features; otherwise flatten/preview or extract supported assets.
- PPTX: parse supported slide elements, text, shapes, and images; unsupported effects may flatten.
- SVG: sanitize scripts, external references, filters, and unsafe elements.
- PDF: page preview or extraction; editable conversion is best-effort.
- PNG/JPG: import as image asset, not editable layer structure.
Import result must report: imported editable objects, flattened elements, skipped elements, warnings, and source format. Never promise lossless conversion without compatibility validation.

Implementasi Fase 8:
- PNG/JPG dioptimalkan menjadi WebP dan ditambahkan sebagai aset gambar.
- SVG dibatasi pada elemen/atribut allowlist; script, event handler, external reference, XML entity, dan elemen berisiko dibuang. Hasilnya dirasterisasi, bukan dipresentasikan sebagai layer vektor editable.
- PDF hanya dibuka sebagai pratinjau lokal. PSD, AI, Affinity, dan PPTX belum memiliki parser aktif dan tidak diunggah; laporan menyertakan langkah ekspor alternatif.
- Canva/Figma API resmi tetap nonaktif sampai persetujuan tersedia.
- Perencana tempat duduk mengatur meja, kapasitas, dan penempatan tamu. Livestream berupa tautan HTTPS eksternal, bukan embed/provider integration.
- Preset gerak yang diizinkan: fade-in, rise-in, soft-zoom, float; kontrol mencakup durasi, pemicu, jeda, dan reduced-motion fallback.

## 9. Custom HTML/CSS
- No arbitrary JavaScript, event handlers, remote script, iframe injection, or server-side execution.
- Custom HTML limited to sanitized allowlisted tags and attributes.
- CSS limited to allowlisted properties, values, selectors, and scope.
- Disallow external URL imports, `url()` except approved asset IDs, and dangerous layout/overlay patterns.
- Render in isolated scope; sanitize on server and client.
- Admin can disable custom code feature globally.
This capability is optional and may be deferred if safe implementation is not ready.

## 10. Responsive and Safe Layout
- Mobile/tablet/desktop preview.
- Breakpoint overrides.
- Text overflow and image aspect ratio warnings.
- Safe area for critical text and buttons.
- No element may create unbounded horizontal overflow.
- Motion has reduced-motion fallback.
- Public renderer uses same schema interpretation as editor preview.

## 11. Autosave and Versioning
- Autosave after short debounce and on blur/navigation.
- Show Saving/Saved/Offline/Conflict/Error.
- Each save includes base version number; reject stale writes.
- Keep recoverable draft snapshots.
- Published versions immutable.
- Publish operation validates document and creates immutable version, then atomically updates published pointer.
- Failure leaves previous published version intact.
- Restore creates a new draft from selected prior version; never mutate history.

## 12. Validation
Before checkout/publish:
- Required event fields completed.
- Component schema valid.
- Assets exist and are ready.
- Links valid/safe.
- Media size/duration within configured limits.
- No unsupported component/schema.
- Responsive overflow checks.
- Consent state handled separately.
Validation errors identify section/component and offer direct navigation.

## 13. Performance
- Lazy-load panels and asset thumbnails.
- Virtualize long layer lists.
- Debounce expensive layout calculations.
- Use responsive image variants.
- Limit simultaneous media previews.
- Avoid full document re-render for every keystroke.
- Provide low-memory mode for mobile.
- Public renderer must not load editor bundle.

## 14. Editor Acceptance Criteria
All basic component operations work; undo/redo reliable; autosave survives refresh/network interruption; conflicts are visible; import limitations are explicit; no arbitrary script executes; mobile editing is usable; preview matches published renderer; failed publish preserves current live version; invitation locale/timezone settings persist and match public date/time formatting.
