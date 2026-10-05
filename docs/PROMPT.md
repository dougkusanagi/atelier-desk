# Build an Original Milanote-Inspired Visual Workspace

You are the lead engineer, interaction designer, and QA engineer responsible for delivering this application end to end. Build the working product, including frontend, backend, persistence, collaboration, tests, local infrastructure, and deployment documentation.

Do not ask clarifying questions. Use the defaults in this specification. When an implementation detail remains unspecified, choose the simplest production-ready solution consistent with the requirements and document the assumption beside the relevant implementation and in `docs/assumptions.md`.

Use **Atelier Desk** as the working product name. Create an original implementation inspired by Milanote’s visual organization and interaction patterns. Do not copy Milanote’s name, logo, proprietary assets, source code, marketing copy, or exact visual identity. All sample content and templates must be original.

Every feature below is required. Do not substitute static mockups, fake persistence, simulated collaboration, dead controls, or placeholder exports for working functionality.

---

# 1. PRODUCT OVERVIEW

## 1.1 Product definition

Milanote is a freeform visual workspace for organizing ideas, notes, images, links, files, and tasks on boards. Build an original application with this same core experience: users arrange content spatially, group related material into columns, connect ideas, create nested boards, and collaborate.

The central interaction metaphor is moving physical cards around a desk. Cards should feel immediately responsive, remain legible, and retain their position unless a user deliberately moves them.

## 1.2 User experience goals

- **Fluid:** direct manipulation follows the pointer without animation lag; navigation and state transitions preserve spatial context.
- **Tactile:** pickup, placement, selection, resizing, and insertion provide restrained visual feedback.
- **Calm:** neutral surfaces, limited accent colors, contextual controls, and no decorative animation loops.
- **Fast:** creation, selection, editing, and movement require minimal steps; changes appear locally before network acknowledgment.
- **Trustworthy:** saved, pending, offline, failed, and permission-denied states are distinguishable. Never silently discard work.
- **Spatially predictable:** zoom anchors, drag offsets, column membership, stacking, and board navigation behave consistently.

## 1.3 Platforms and scope

- Desktop web first: full editing experience at viewport widths of 1024px and above.
- Tablet: full canvas editing with touch, at widths of 768–1023px.
- Mobile: canvas viewing/editing plus an accessible linear board view, at widths below 768px.
- Support current and previous major versions of Chrome, Edge, Firefox, and Safari, including iOS Safari and Android Chrome.
- Provide an installable PWA.
- Ship English UI initially. Centralize user-facing strings so localization can be added.
- Include personal and team workspaces. Billing, native applications, and a browser extension are outside scope; browser drag-and-drop and clipboard capture are required.

**Product acceptance:** a new user can create a workspace, assemble a mixed-media board, organize cards, open a nested board, invite another user, collaborate, reconnect after offline editing, and export the result without developer assistance.

---

# 2. TECH STACK & ARCHITECTURE

## 2.1 Required stack

Use mutually compatible, stable releases and pin exact resolved versions in the lockfile. Do not use prerelease packages.

### Frontend

- React and TypeScript with strict type checking.
- Vite for development and production builds.
- React Router for application routes.
- Zustand for local interaction state: camera, selection, tools, open panels, and transient gestures.
- TanStack Query for REST-backed resources and request lifecycle management.
- Yjs for collaborative board content.
- Tiptap with its Yjs collaboration integration for rich text.
- Motion for React, imported from `motion/react`, for interface and card transition animation.
- CSS custom properties and CSS Modules for tokens and component styling.
- Radix primitives for accessible menus, dialogs, popovers, and tooltips.
- Lucide icons, consistently sized.
- RBush or an equivalent spatial index for hit testing and visibility queries.
- IndexedDB, including `y-indexeddb`, for local documents and offline queues.
- A service worker for the application shell and explicitly cached assets.

Do not duplicate authoritative board content into Zustand or TanStack Query. Components subscribe to narrowly scoped document changes.

### Backend

- Node.js on an active LTS release, TypeScript, and Fastify.
- PostgreSQL for durable application metadata, collaboration updates, and search.
- Drizzle ORM and versioned SQL migrations.
- Redis for queueing, distributed coordination, and realtime fan-out.
- BullMQ workers for previews, media processing, search indexing, exports, and notifications.
- S3-compatible private object storage; use MinIO locally.
- A dedicated authenticated WebSocket collaboration service using Yjs protocols.
- Sharp for image normalization and thumbnail generation.
- FFmpeg for uploaded audio/video metadata and posters.
- PDF.js for PDF previews.
- Isolated LibreOffice conversion for supported Office-document previews.
- Playwright/Chromium and a dedicated export renderer for visual exports.

Keep the frontend, API, collaboration service, and workers independently runnable.

## 2.2 Canvas rendering

Use **DOM-based cards transformed in a shared world-coordinate layer**, with SVG connector and drawing layers.

Justification:
- Notes, inputs, links, media controls, and accessible focus behavior work naturally in the DOM.
- Rich text and IME input should not be reimplemented inside WebGL.
- SVG supports editable paths, connector labels, and vector export.
- Spatial culling and selective subscriptions keep large boards practical.

Canvas may be used internally for raster export or cached drawing thumbnails, but must not replace the interactive card DOM.

Use separate transform layers:
1. Camera translation and scale.
2. Card world position.
3. Card pickup/settle visual animation.
4. Unscaled screen-space overlays.

Do not let Motion and the gesture engine write the same transform property.

## 2.3 Authoritative data ownership

- PostgreSQL owns users, workspace membership, board hierarchy, permissions, comments, notifications, assets, share links, and job metadata.
- A persisted Yjs document owns each board’s cards, card content, geometry, column membership, task order, drawings, and connectors.
- PostgreSQL card/search records are projections of acknowledged Yjs state, not a competing editable source.
- Camera position, active tool, selection, and open menus are local user state.
- Presence, cursor movement, and in-progress drag previews are transient awareness data.
- Asset references use durable asset IDs, never expiring signed URLs as stored content.

All canvas mutations pass through a typed command layer. Each command declares validation, affected entities, permission requirements, transaction boundaries, and undo behavior.

## 2.4 Database schema

Use UUIDs generated client-side where offline creation requires them. Use UTC timestamps, foreign keys, explicit uniqueness constraints, and indexed lookup paths.

Required tables:

- `users`: id, normalized unique email, password hash, display name, avatar asset, verification time, preferences, created/updated timestamps.
- `sessions`: user, hashed session token, expiration, revocation, device metadata.
- `auth_tokens`: hashed verification/reset token, purpose, expiration, consumed time.
- `workspaces`: id, name, owner, timestamps.
- `workspace_members`: workspace, user, role, unique workspace/user pair.
- `workspace_invitations`: workspace, optional board, email, role, hashed token, expiration, acceptance.
- `boards`: workspace, owner, parent board, title, icon, cover asset, version, deletion batch, deleted timestamp, timestamps.
- `board_members`: board, user, role, unique board/user pair.
- `board_visits`: user, board, last visited, saved camera.
- `board_documents`: board, document epoch, schema version, snapshot bytes, snapshot sequence, state vector.
- `board_updates`: board, epoch, monotonic server sequence, update bytes, actor, command ID, unique update ID, timestamp.
- `board_commands`: command ID, board, actor, client, command type, serialized semantic forward/inverse information, causal references, status, timestamp.
- `board_versions`: board, checkpoint sequence, snapshot reference, actor, description, timestamp.
- `card_projection`: board, card ID, type, plain text, searchable metadata, geometry, container, deleted timestamp.
- `assets`: workspace, uploader, storage key, original filename, verified MIME type, byte size, hash, dimensions/duration, processing state, timestamps.
- `asset_references`: asset, board, card or cover reference.
- `share_links`: board, token hash, role, optional password hash, expiration, descendant scope, export permission, revoked timestamp.
- `publications`: board, public token hash, sanitized snapshot version, descendant scope, enabled state.
- `comment_threads`: board, optional card, optional board-coordinate anchor, resolved state, timestamps.
- `comments`: thread, author, structured body, edited/deleted timestamps.
- `mentions`: comment, mentioned user, unique comment/user pair.
- `notifications`: recipient, actor, event type, entity references, deduplication key, read timestamp.
- `templates`: workspace or built-in scope, name, category, versioned template document, thumbnail.
- `jobs`: requester, workspace, board, type, status, progress, output asset, error code, timestamps.
- `audit_events`: workspace, actor, action, entity, structured non-secret metadata, timestamp.

Index board hierarchy, user notifications, active membership, update sequences, trash timestamps, and asset references. Use PostgreSQL full-text search and trigram indexes for permitted board/card searches.

### Board document structure

Define a versioned, discriminated TypeScript schema.

Common card fields:
- id and type.
- Position and dimensions in world pixels.
- z-order.
- Background color token or validated custom color.
- Layout object: either free canvas placement or one column ID plus ordering key.
- Creation and modification metadata.
- Deletion tombstone.
- Type-specific content.

Use shared Yjs text/XML structures for collaborative text. Use stable item IDs for tasks and strokes.

Store layout membership as one atomic value so a card cannot simultaneously belong to multiple columns. Resolve equal ordering keys deterministically by card ID.

Connector fields:
- id.
- Source and target endpoint, each either a card anchor or free world point.
- Straight or cubic Bézier routing.
- Control-point offsets.
- Arrowhead configuration.
- Stroke color, width, pattern.
- Collaborative label.
- z-order and deletion tombstone.

## 2.5 API contract

Use versioned REST endpoints under `/api/v1`, plus authenticated WebSockets. Publish an OpenAPI specification.

Required endpoint families:

- `/auth/register`, `/login`, `/logout`, `/me`, `/verify-email`, `/forgot-password`, `/reset-password`.
- `/workspaces`, `/workspaces/:id/members`, `/invitations`.
- `/boards`, `/boards/:id`, `/boards/:id/move`, `/boards/:id/duplicate`, `/boards/:id/restore`.
- `/boards/:id/bootstrap`, `/boards/:id/checkpoints`, `/boards/:id/history`.
- `/boards/:id/commands` for validated non-WebSocket command submission.
- `/boards/:id/unsorted`.
- `/assets/uploads`, `/assets/uploads/:id/complete`, `/assets/:id/download`.
- `/link-previews`.
- `/boards/:id/comments`, `/comments/:id`.
- `/notifications`.
- `/boards/:id/shares`, `/shares/:token`.
- `/boards/:id/publication`, `/published/:token`.
- `/boards/:id/exports`, `/jobs/:id`.
- `/search`, `/templates`, `/trash`.

Requirements:
- Runtime-validate every request and response boundary.
- Use cursor pagination; default 50, maximum 100.
- Return structured errors with `code`, `message`, optional `fieldErrors`, and `requestId`.
- Use 401 for unauthenticated requests, 403 for forbidden actions where resource existence is already known, 404 for inaccessible resource lookups, 409 for structural conflicts, 413 for oversized input, and 429 for rate limits.
- Support idempotency keys on retriable creates, moves, uploads, invites, and jobs.
- Require expected metadata versions for hierarchy changes.
- Never perform content mutations through GET requests.

## 2.6 Collaboration transport and consistency

- One room and Yjs document per board.
- Authenticate room access on connection and before accepting writes.
- Recheck authorization when roles, share links, sessions, or board deletion change.
- Use one logical writer/validator per active board, coordinated across instances.
- Validate incoming updates against a candidate document before accepting them: schema, size limits, references, asset access, immutable IDs, and prohibited fields.
- Persist accepted updates before sending durable acknowledgment or broadcasting them.
- Reject malformed or unauthorized updates and return a recoverable client state.
- Exchange state vectors on reconnect and send missing updates.
- Compact snapshots every 500 acknowledged updates or five minutes of active editing, whichever occurs first.
- Store document epochs so stale offline clients cannot resurrect deliberately purged content.
- Use CRDT resolution for concurrent content edits. Do not implement synchronization by overwriting whole JSON documents.
- Treat hierarchy and permissions as server-authoritative metadata, outside client-editable Yjs content.
- Deliver comment and notification events through a separate authorized event channel.

Use last-resolved CRDT values for simultaneous scalar edits. Use collaborative text structures for text. Group moves are single local transactions; simultaneous drags of the same card resolve deterministically and converge.

## 2.7 Authentication and authorization

Implement email/password registration, verification, login, logout, and password reset.

- Argon2id password hashing.
- Secure, HttpOnly, SameSite cookies.
- CSRF protection and WebSocket origin checks.
- Short-lived, single-use reset and verification tokens.
- Rate-limited authentication and invitation endpoints.
- Mailpit for development; configurable SMTP for production.
- Never store session credentials in localStorage.

Workspace roles:
- Owner: full workspace administration.
- Admin: membership and permitted board administration, excluding ownership transfer.
- Member: create boards and access explicitly granted boards.

Board roles:
- Owner: edit, share, publish, export, trash, and administer access.
- Editor: edit content and add comments.
- Commenter: view and comment.
- Viewer: view only.

Workspace owners/admins have explicit administrative access. Ordinary workspace membership does not expose private boards.

Nested boards inherit access from their hierarchy unless inheritance is explicitly disabled by an owner. Show inherited access in the share dialog. Board-reference cards do not grant access to their destination.

Anonymous share links are view-only. Edit links require authentication and verified email. Creating an edit link must clearly disclose that any authenticated holder can edit. Only owners/admins can change permissions.

Public viewers receive sanitized current-state snapshots and sanitized updates, never raw Yjs history, internal memberships, private comments, or user email addresses.

## 2.8 Repository organization and conventions

Use a pnpm monorepo:

- `apps/web/src/app`
- `apps/web/src/features/{canvas,cards,boards,collaboration,sharing,search}`
- `apps/web/src/components`
- `apps/web/src/styles`
- `apps/api/src/modules`
- `apps/collab/src`
- `apps/worker/src`
- `packages/domain`
- `packages/contracts`
- `packages/ui`
- `packages/config`
- `infra`
- `tests/e2e`
- `docs`

Conventions:
- Strict TypeScript; no unexplained `any`.
- Discriminated unions and exhaustive handling for card types and commands.
- ESLint, Prettier, consistent import order, and typed environment configuration.
- Separate pure geometry/domain logic from React and infrastructure.
- Centralize permissions and reuse the same policy functions across REST, WebSocket, jobs, and asset access.
- Keep animations in named shared tokens.
- Include schema migrations for stored documents.
- Provide `.env.example` without credentials.

Testing:
- Vitest for unit tests.
- React Testing Library for component behavior.
- Integration tests against real PostgreSQL, Redis, and object storage.
- Playwright for browser workflows and multi-context collaboration.
- axe-core for automated accessibility checks.
- Deterministic visual fixtures and performance fixtures.

**Architecture acceptance:** fresh checkout installation, migration, seed, development startup, tests, and production builds work using documented commands. Restarting services preserves boards and acknowledged edits.

---

# 3. COMPLETE FEATURE SPECIFICATION

## 3.1 Shared interaction rules

- Use world pixels independent of camera zoom.
- Editing text and operating media controls must never initiate card dragging.
- Pointer dragging starts after 4 screen pixels of movement.
- Capture the pointer during gestures.
- Escape or pointer cancellation returns an uncommitted gesture to its starting state.
- One completed drag, resize, reorder, drawing stroke, or multi-card action equals one undo transaction.
- Never persist animated intermediate geometry.
- If an item disappears remotely during editing, preserve an accessible local recovery copy and explain the state.
- Provide loading, empty, error, retry, read-only, and offline states for every network-backed surface.
- Every drag-only operation must also have a menu or keyboard alternative.

## 3.2 Boards and navigation

### A. Infinite canvas

Behavior:
- Unbounded logical workspace using finite numeric coordinates; impose a documented safety boundary of ±1,000,000 world pixels.
- Camera formula: `screen = viewportOrigin + translation + world * zoom`.
- Inverse conversion: `world = (screen - viewportOrigin - translation) / zoom`.
- Zoom range 10%–400%, default 100%.
- Preserve the world point under the cursor or pinch midpoint during zoom.
- Wheel/trackpad deltas pan. Ctrl/Cmd + wheel zooms within the canvas.
- Normalize wheel delta units. Do not guess hardware using user-agent detection.
- Middle-button drag or Space + primary-button drag pans.
- Primary-button drag on empty canvas creates a marquee.
- On touch, one-finger background drag pans; two-finger pinch zooms.
- Long-press a card for 350ms, with movement below 8px, to begin card dragging.
- Provide touch selection mode for additive selection and marquee selection.
- Arrow keys move selected cards; when nothing is selected and canvas is focused, they pan.
- Zoom controls show the percentage, zoom in/out, reset to 100%, and fit all.
- Fit-all includes visible nondeleted cards and connectors with 48px screen padding.
- At zoom below 35%, simplify offscreen-heavy content and disable inline editing; activating a card brings it to a readable zoom.
- Edge autopan during dragging starts within 32px of the viewport edge, accelerates up to 600 screen px/second, and stops immediately when the gesture ends.

Edge cases:
- Ignore canvas shortcuts while typing or composing IME input.
- Do not intercept browser gestures outside the canvas.
- Account for viewport resizing, device pixel ratio, scrollbars, and mobile visual viewport changes.

Acceptance:
- At 10%, 100%, and 400%, pointer-anchored zoom drifts by no more than 1 screen pixel.
- A dragged card maintains its initial pointer offset.
- Text selection, touch media controls, and browser page navigation remain usable.
- Empty-board fit-all returns to the origin at 100%.

### B. Nested boards

Behavior:
- Creating a board card creates a real child board.
- Open with double-click, Enter, or an explicit Open action; single-click selects.
- Show breadcrumb navigation and browser-back support.
- Persist each user’s camera separately for each board.
- Distinguish owned child boards from reference cards linking existing boards.
- Reference cards display inaccessible or deleted destinations without leaking titles.
- Prevent hierarchy cycles and moving a board beneath its descendants.
- Maximum hierarchy depth: 50.
- Duplicating a child-board subtree creates new boards, cards, and internal connector IDs.
- Copying an existing board-reference card preserves its reference and permissions.
- Cross-board card moves use an idempotent transfer operation; the source disappears only after destination acknowledgment.

Acceptance:
- Parent → child → parent restores both camera positions.
- A concurrent hierarchy move cannot create a cycle.
- A denied child board remains inaccessible through breadcrumbs, search, API, and share links.

### C. Home dashboard

Behavior:
- Show workspace switcher, recent boards, owned boards, shared boards, favorites, templates, Unsorted, and Trash.
- Support grid and list views, sorting by title or modification time, and board creation.
- Board covers use uploaded images with adjustable crop; icons use emoji or bundled original symbols.
- Show 20 most recent accessible boards.
- Remember the last selected workspace.
- Empty dashboard includes functional Create board and Use template actions.

Acceptance:
- Dashboard updates after create, rename, favorite, delete, and restore.
- Broken cover assets use an intentional fallback.
- Long titles truncate visually while remaining available to assistive technology and tooltips.

### D. Search

Behavior:
- Search board titles, note text, tasks, link titles/URLs, captions, filenames, and comment text.
- Debounce input by 250ms.
- Support workspace, board, card-type, and author filters.
- Return highlighted excerpts with safe escaped markup.
- Selecting a card result opens its board, centers the card, and highlights it for 1200ms.
- Search only resources the requester can currently access.
- Offline search covers locally cached boards and is labeled “Cached results.”

Acceptance:
- Newly acknowledged content becomes searchable within two seconds under normal load.
- Permission revocation removes results immediately at query authorization time, even if indexing is delayed.
- Empty, no-result, and failed searches have distinct states.

### E. Trash and restore

Behavior:
- Soft-delete cards, connectors, and boards.
- Board deletion trashes its owned descendants as one deletion batch.
- Referenced external boards are not deleted.
- Retain trash for 30 days, then purge through a scheduled worker.
- Restore original placement when the parent exists.
- Restore boards to workspace root if their previous parent is missing; restore cards to Unsorted if their board no longer exists.
- Display recoverable and permanently deleted states.
- Permanent deletion requires explicit confirmation.
- Preserve asset references while recoverable content or retained history needs them.

Acceptance:
- Restoring a card restores associated connector state where both endpoints exist.
- Restoring a board subtree does not resurrect descendants independently deleted before that subtree was trashed.
- Purged content cannot return through an old offline document epoch.

### F. Unsorted capture

Behavior:
- Provide a private, per-user, per-workspace Unsorted tray.
- Accept text, URLs, files, images, and clipboard captures.
- Open as a sidebar on desktop and a full sheet on mobile.
- Allow drag to board or a Move to board action.
- Preserve type, upload state, caption, and creation time.
- A capture leaves Unsorted only when its destination has been durably accepted.

Acceptance:
- Rapidly capturing ten mixed items loses none.
- Failed transfers remain recoverable without duplicate cards.

## 3.3 Card types

### A. Rich-text notes

Behavior:
- Support paragraphs; H1–H3; bold, italic, underline, strikethrough; ordered/bulleted lists; blockquotes; inline code; code blocks; links; and checklists.
- Use a contextual formatting toolbar and keyboard shortcuts.
- Default width 280px; minimum width 180px; maximum width 1200px.
- Height follows content. Above 1200px height, show a constrained editor with internal scrolling and Expand action.
- Sanitize pasted HTML. Preserve allowed formatting and strip scripts, event handlers, unsupported embeds, and unsafe protocols.
- Use collaborative rich-text structures, not a shared HTML string.
- Support IME, emoji, Unicode, and multiline paste.

Acceptance:
- Two users editing different and overlapping text ranges converge.
- Formatting survives reload, duplication, copy/paste, and Markdown export.
- No formatting action moves the card or steals the text selection unexpectedly.

### B. To-do lists

Behavior:
- Stable-ID tasks contain collaborative text, completion state, optional assignee, and optional due date.
- Enter adds a task; Enter on an empty final row exits task entry.
- Reorder using a dedicated handle and keyboard Move up/down actions.
- Preserve manually chosen ordering when tasks are completed.
- Completed tasks use muted text and strikethrough while remaining readable.
- Optional Hide completed toggle is local user preference.
- Show completed/total count.

Acceptance:
- Concurrent insertion/reordering does not lose or duplicate tasks.
- Completion toggles are undoable.
- Assignees must have access to the board; inaccessible users cannot be assigned or mentioned.

### C. Images

Behavior:
- Accept file picker, clipboard image, desktop drop, and supported browser image drops.
- Support JPEG, PNG, WebP, AVIF, GIF, and supported HEIC conversion.
- File-size limit: 100MB per image; decoded-image safety limit: 100 megapixels.
- Apply EXIF orientation and strip location metadata.
- Generate appropriate thumbnails and retain an original download.
- Default card width 320px; minimum 120px; maximum 2400px.
- Aspect-ratio-preserving resizing is default.
- Provide explicit crop editing and optional unlocked dimensions.
- Support caption, alt text, replace, and lightbox.
- Show real upload progress and processing state.
- Animated images remain still until explicitly activated or opened; reduced motion keeps them still by default.

Acceptance:
- Resizing preserves the chosen crop and caption.
- A failed upload has Retry and Remove actions.
- Replacing an image does not orphan assets still referenced by other cards or history.

### D. Link previews

Behavior:
- Pasting a single HTTP(S) URL on blank canvas creates a link card.
- Fetch title, description, thumbnail, favicon, and canonical URL asynchronously.
- Show the normalized destination domain.
- Allow manual title/description edits; preview completion must not overwrite them.
- Use server-side fetching with redirect limits, timeouts, response-size caps, and SSRF protections.
- Reject localhost, private/reserved IP ranges, unsafe ports, and non-HTTP(S) schemes; revalidate every redirect and resolved address.
- Do not bypass access controls or scrape authenticated pages.
- Timeout after eight seconds and retain a usable plain-link card.

Acceptance:
- Invalid URLs produce an actionable message.
- Preview failure never prevents opening or editing the link.
- Opening uses an explicit action and safe external-link attributes.

### E. Files and documents

Behavior:
- Accept arbitrary safe downloads up to 250MB.
- Verify MIME type using bytes, not filename alone.
- Preview PDFs, plain text, and supported converted Office documents.
- Other types show filename, type, size, download, and replace actions.
- Scan uploaded files before making them downloadable.
- Run document conversion in resource-limited isolated workers.
- PDF previews provide page count and paginated viewer.
- Unsupported or encrypted documents retain download functionality with an explanatory preview state.

Acceptance:
- Download requires current authorization.
- Unsafe HTML/SVG is never rendered inline without sanitization or isolation.
- A failed preview does not corrupt the source file.

### F. Embedded video and audio

Behavior:
- Support uploaded browser-playable media and allowlisted YouTube/Vimeo URL embeds.
- Uploaded media limit: 500MB.
- Generate posters, duration, and playback metadata.
- Include native or accessible playback controls.
- Require user activation for third-party embeds.
- Never autoplay audio; do not autoplay video.
- Pause media when its board closes or card is culled.
- Preserve aspect ratio and captions where available.
- Unsupported URLs fall back to link cards.

Acceptance:
- Media controls work without initiating drag.
- Blocked embedding shows an Open original action.
- One user’s playback position is not synchronized to other users.

### G. Color swatches

Behavior:
- Enter or paste `#RGB` or `#RRGGBB`; normalize storage to uppercase `#RRGGBB`.
- Provide color picker, optional name, and copy-HEX action.
- Reject invalid values without overwriting the previous color.
- Choose readable text color based on contrast.
- Default size 160 × 160px.

Acceptance:
- Displayed color and copied HEX agree.
- Keyboard-only users can edit and copy the value.

### H. Columns

Behavior:
- Columns are titled vertical containers, default width 320px, minimum 220px.
- Child cards derive world position from the column and ordering keys.
- Use 12px gaps and 16px internal padding.
- Each card belongs to at most one column.
- Columns cannot contain other columns in this release.
- Dragging a column moves its children as one unit.
- Dropping a card inside a column inserts at a calculated slot.
- Dragging a child out creates free canvas placement at its visible world position.
- Column height grows from children; width changes recompute child layout.
- Collapsing hides children and routes external connectors to the collapsed header.
- Deleting a column offers “Delete column and cards” or “Ungroup cards”; keyboard deletion defaults to Ungroup.

Acceptance:
- No operation creates duplicate column membership.
- Concurrent reorder converges deterministically.
- Moving a selected column and its selected children does not move those children twice.

### I. Board cards

Behavior:
- Show title, cover/icon, accessible content count, and owned-child/reference indicator.
- Provide Open, Rename where permitted, Change cover, Duplicate, and Move actions.
- Surface deleted/inaccessible destinations without revealing private metadata.

Acceptance:
- Open navigation preserves camera and breadcrumb state.
- Duplication follows the owned-child versus reference rules.

### J. Sketch/drawing cards

Behavior:
- Provide pen, highlighter, eraser, color, widths of 1–24 world pixels, and clear.
- Store vector strokes as stable-ID paths.
- Support mouse, touch, and pressure-sensitive pens.
- Interpolate stroke points without changing intended shape; cap stroke sampling at one sample per animation frame.
- Eraser removes an entire hit stroke.
- Drawing mode confines gestures to the card.
- Leaving drawing mode restores normal card selection/dragging.
- One stroke or eraser gesture is one undo transaction.
- Generate a cached thumbnail for low zoom and culling.

Acceptance:
- Multiple users can add strokes without losing each other’s work.
- Drawings survive reload and export at adequate resolution.
- Clear is undoable and requires confirmation when content exists.

### K. Connectors

Behavior:
- Create through a connector tool or visible card anchor handles.
- Support card-to-card, card-to-free-point, and free-point-to-free-point connections.
- Anchor handles appear at edge centers; endpoints remain attached during moves and resizes.
- Support straight and cubic Bézier paths.
- Expose curve handles only while selected.
- Support arrows at either/both ends, solid/dashed strokes, color, and widths of 1–6px.
- Add labels by double-click or a menu action.
- Connector hit area is at least 12 screen pixels regardless of zoom.
- Default connectors render behind cards; labels remain legible.
- Deleting an endpoint tombstones attached connectors; undo restores them.
- Duplicating selected cards remaps connectors whose endpoints are both duplicated; external connectors are excluded.

Acceptance:
- Connector geometry updates in the same visual frame as local card movement.
- Curve handles remain correct across zoom.
- Keyboard users can choose source, target, style, and label without dragging.

## 3.4 Editing and organization

### A. Creation toolbar

- Desktop: fixed left rail with note, task, image, link, file, media, color, column, board, drawing, and connector tools.
- Click a tool to create at the last canvas pointer position; use viewport center if none exists.
- Drag a tool onto the board to place it precisely.
- Upload tools open a picker when clicked.
- New text cards enter editing immediately.
- New cards use deterministic collision avoidance: try 24px diagonal offsets up to 20 attempts, then place at the requested point.
- Offer equivalent mobile Add sheet and keyboard commands.

**Acceptance:** all creation paths produce the same schema and undo behavior; canceled creation leaves no empty assets or unintended cards.

### B. Selection and movement

- Click selects one item; Shift-click toggles membership.
- Marquee selects items intersecting its rectangle; Shift preserves existing selection.
- Blank click clears selection.
- Cmd/Ctrl+A selects all visible-board nondeleted items when the canvas is focused.
- Group movement preserves relative offsets.
- Right-click selects an unselected target before opening its menu.
- Selected cards have 2px screen-space outlines.
- Keep selection outlines constant in apparent width across zoom.
- Provide a selection-count status and explicit Select all/Clear selection actions.

**Acceptance:** a 50-card group moves, duplicates, and deletes as one command; text selection is independent of canvas selection.

### C. Duplicate, delete, and clipboard

- Duplicate offsets copies by 24 world pixels and allocates fresh IDs.
- Copy/paste preserves relative geometry, formatting, task states, asset references, and internal connectors.
- Cut removes originals only after destination paste acknowledgment.
- Use an internal versioned clipboard format with a plain-text/HTML fallback.
- Cross-workspace pastes create authorized asset copies.
- If custom MIME clipboard access is unavailable, preserve same-app copying through an in-memory clipboard and provide explicit menu actions.
- Drop multiple files in a grid with 24px gaps.
- Browser-dropped text and URLs create appropriate cards.
- Remote-image capture uses the secure preview-fetching policy; denied fetches become links.
- Avoid duplicate handling when a browser supplies the same item in several clipboard formats.

**Acceptance:** copy between two boards preserves content and internal connections; failed cut/paste retains the originals.

### D. Color, resize, stacking, alignment, and snapping

- Card colors include eight accessible presets plus validated custom colors.
- Resize handles appear on selection; interactive target is at least 24 × 24px on desktop and 44 × 44px on touch.
- Support explicit width/height inputs where the card type permits them.
- Maintain media aspect ratio unless explicitly unlocked.
- Provide Bring forward, Send backward, Bring to front, and Send to back.
- Renormalize z-order without altering visual stacking.
- Provide left/right/top/bottom/center alignment and horizontal/vertical distribution.
- Distribution requires three or more selected items.
- Snap to other cards’ edges/centers and an optional 8-world-pixel grid.
- Snap engages within 6 screen pixels and releases beyond 10.
- Alt temporarily disables snapping.
- Choose nearest guides deterministically; avoid oscillation between equally close targets.
- Snapping never changes rich-text caret placement.

**Acceptance:** snapping thresholds remain consistent at all zoom levels; alignment and distribution are single undoable commands.

### E. Undo, redo, and full history

- Every user-authored content mutation must be undoable, including create, edit, drag, resize, reorder, complete, recolor, duplicate, delete, connector edits, drawing, and card transfers.
- Group typing within 500ms into one history entry; separate entries on blur, formatting changes, and structural commands.
- Navigation, camera movement, presence, search, and permission administration are not content undo entries.
- Undo only the requesting user’s changes.
- Use origin-scoped Yjs UndoManager for active-session text/document changes.
- Persist a semantic command journal so history survives reload; do not assume JSON serialization of Yjs UndoManager creates durable history.
- Durable inverse operations must use stable IDs, causal references, and relative text anchors where necessary.
- Apply compensating edits rather than restoring a stale whole-board snapshot.
- Preserve remote edits. If an inverse conflicts with a later collaborator change, undo only the still-applicable portion and explain skipped portions.
- Redo reapplies the undone operation against current state.
- New local content edits clear the current redo branch; remote edits do not.
- Retain complete history within the documented 30-day retention window, without an arbitrary entry-count cap.
- Provide a history panel with actor, operation, time, and checkpoint previews.
- Restoring a checkpoint creates a new revision rather than rewriting history.
- Undo deletion remains possible after its toast disappears.

**Acceptance:** local undo after concurrent remote typing preserves the remote text; history works after reload and reconnect; a group operation remains one entry.

### F. Templates

- Include original Moodboard, Storyboard, Project Plan, Creative Brief, Research Board, and Weekly Planner templates.
- Each includes meaningful sample content and useful layout.
- Templates instantiate fresh IDs, assets, tasks, connectors, and nested boards.
- Allow saving a board as a workspace template.
- Remove comments, collaborators, permissions, and personal data from saved templates.
- Provide previews and category filtering.

**Acceptance:** two instances of one template are independently editable and do not share mutable state.

### G. Keyboard shortcuts

`Mod` means Cmd on macOS and Ctrl elsewhere.

| Action | Shortcut |
|---|---|
| Undo | Mod+Z |
| Redo | Mod+Shift+Z; Ctrl+Y on Windows/Linux |
| Copy / cut / paste | Mod+C / Mod+X / Mod+V |
| Duplicate | Mod+D when canvas focused |
| Select all | Mod+A when canvas focused |
| Delete selection | Delete or Backspace outside text input |
| Cancel gesture / close transient UI | Escape |
| Edit selected card / open selected board | Enter |
| Pan | Space+drag or middle-button drag |
| Nudge selection | Arrow keys: 1 world px |
| Large nudge | Shift+Arrow: 10 world px |
| Pan without selection | Arrow keys: 40 screen px |
| Zoom in / out | + / - when canvas focused |
| Reset zoom | 0 |
| Fit all | Shift+1 |
| Search | Mod+K |
| New note / task / column | N / T / C when canvas focused |
| Connector tool | L |
| Shortcut help | ? |
| Bold / italic / link | Mod+B / Mod+I / Mod+K in rich text |

Provide a searchable shortcut dialog. Resolve shortcuts by focus context. Do not intercept browser/system shortcuts globally or during IME composition.

**Acceptance:** every shortcut has a visible menu/button equivalent and works in the intended focus context.

## 3.5 Collaboration and sharing

### A. Presence and live editing

- Show presence avatars, user names, distinct cursor colors, remote selections, and text caret indicators.
- Presence payloads contain board ID, world cursor coordinates, selection IDs, and active gesture state.
- Send awareness at most 20 times/second.
- Commit geometry at gesture completion; use awareness previews during movement.
- Mark simultaneous manipulation of the same card with collaborator identity.
- Do not create hard locks that strand cards after disconnect.
- Mark idle after 60 seconds without activity; remove disconnected presence within 30 seconds.
- Presence is not persisted or included in undo/export.

**Acceptance:** three users can concurrently edit notes, reorder tasks, and move cards; all clients converge after reconnect and server restart.

### B. Comments, mentions, and notifications

- Support board-level and card-anchored threaded comments.
- Support replies, edit/delete own comments, resolve/reopen, and unread markers.
- @mention suggestions include only accessible workspace/board members.
- Mention insertion uses a user ID, not just rendered text.
- Mention recipients receive one notification per event, with deduplication.
- Provide notification center, unread count, Mark read, and deep links.
- If a card is deleted, keep its thread in board comments with a deleted-card label.
- Do not send email notifications to public viewers or expose member emails.
- Include configurable email mention notifications through SMTP.

**Acceptance:** mentioning an authorized user creates one notification and a working deep link; users cannot mention or discover inaccessible members.

### C. Share links and publishing

- Share dialog exposes named collaborators, role, inherited access, invite state, links, and publishing.
- View links may optionally require a password and expiration.
- Edit links require authenticated verified users.
- Default link scope is the selected board only.
- Explicit “Include descendant boards” control expands scope; show affected boards before enabling.
- References to independently private boards remain inaccessible.
- Public publishing exposes a clean read-only board without editing controls or private comments.
- Published snapshots update within two seconds of durable board acknowledgment.
- Support revoke, rotate token, disable publishing, and explicit export permission.
- Use at least 256 bits of randomness for bearer tokens; store only hashes.
- Default published pages to `noindex`.
- Revocation invalidates caches and closes affected live sessions within five seconds.

**Acceptance:** forged REST/WebSocket mutation attempts from viewers fail; revoked links fail on subsequent reads; public content does not expose raw collaboration history or private metadata.

### D. Export

Provide real PDF, PNG, and Markdown exports.

Common behavior:
- Export a stable acknowledged snapshot.
- Offer whole board or selected items.
- Exclude presence, selection handles, editing UI, and deleted content.
- Show progress, cancellation, failure, retry, and downloadable output.
- Default export includes the current board only; recursive nested-board export is explicit.
- Recheck authorization at job start and download time.

PNG:
- Tight content bounds with 32 world px padding.
- 1× and 2× resolution.
- Light, dark, and transparent background options.
- Tile internal rendering to avoid browser canvas limits.
- Maximum single output dimension 16,384px and 100 megapixels; offer a tiled ZIP when exceeded.

PDF:
- Fit-to-page and paginated A4/Letter landscape options.
- Keep text selectable where feasible.
- Include images, drawings, connectors, labels, and clickable link annotations.
- Paginated mode shows scale and page overlap settings.

Markdown:
- Deterministic order: top-level items by y, then x, then ID; column children by explicit order.
- Preserve headings, lists, links, code, checklists, captions, and color HEX values.
- Represent media as links/posters and connectors as a Relationships section.
- Offer a ZIP containing Markdown and authorized referenced assets.
- Recursive export uses relative links between board documents.

Edge cases:
- Empty export produces an explanatory result rather than a broken file.
- Unavailable external media uses a labeled placeholder and original URL.
- Missing fonts/assets produce warnings attached to the job.
- Export renderer never fetches arbitrary remote URLs.

**Acceptance:** a mixed-media fixture exports with no clipped cards, omitted connectors, UI chrome, or expired asset URLs; exports include offscreen content regardless of interactive culling.

---

# 4. MICRO-ANIMATIONS & INTERACTIONS

## 4.1 Shared motion rules

Define reusable motion tokens:

- `easeOut = cubic-bezier(0.16, 1, 0.3, 1)`
- `easeStandard = cubic-bezier(0.2, 0, 0, 1)`
- `easeIn = cubic-bezier(0.4, 0, 1, 1)`
- `easeInOut = cubic-bezier(0.4, 0, 0.2, 1)`

Durations below are explicit targets. Use duration-based springs where a fixed duration is specified. Do not claim a physics spring has an exact duration.

Animate transforms and opacity preferentially. Do not animate hundreds of layout properties during drag. Cancel or retarget interrupted animations from their current visual state.

Direct pointer movement, resizing, and drawing are never eased behind the pointer.

## 4.2 Interaction specification

| Interaction and trigger | Required motion |
|---|---|
| Card pickup after drag threshold | Over 100ms, scale 1→1.025 with `easeOut`; elevate shadow; tilt according to horizontal velocity, capped at ±1°. Keep logical hit geometry unchanged. |
| Active drag | Position follows pointer on each animation frame. Dragged items render above normal content. Scale/tilt affect only the visual wrapper. |
| Card drop | Return scale to 1 and rotation to 0 using a 260ms duration-based spring with bounce 0.12. Maximum visible scale overshoot 0.5%; no logical position overshoot. Shadow returns over 180ms with `easeStandard`. |
| Canceled drag | Return preview to origin over 160ms with `easeOut`; do not create a history entry. |
| Column insertion | Require 120ms stable hover over a candidate slot. Move neighboring previews over 160ms with `easeOut`; placeholder opacity enters over 100ms. Placeholder size matches the dragged item. Commit ordering only on drop. |
| Snapping guides | Fade 0→0.85 over 80ms; fade out over 120ms. Draw 1px screen-space lines with concise distance labels. Remove immediately if target is deleted. |
| Button zoom | Animate camera to target over 180ms with `easeOut`, preserving zoom anchor. |
| Wheel/pinch zoom | Follow input immediately; coalesce updates to one per frame. On gesture end, optional final correction lasts at most 80ms and may not shift the anchor. |
| Inertial touch/pointer pan | Estimate release velocity from the last 80ms. Decay as `v(t)=v0*exp(-t/180ms)`; stop below 10px/s or at 700ms. Do not add inertia to wheel/trackpad scrolling that already supplies momentum. |
| Hover toolbar/handles | Enter after 80ms hover intent; fade and translate 2px over 120ms with `easeOut`. Exit over 100ms. Keyboard focus reveals them immediately. |
| Marquee | Rectangle follows pointer immediately; fill opacity 0.08 and border 0.65. Newly selected outlines fade in over 90ms. No marching ants or continuous pulsing. |
| Card creation | At cursor: opacity 0→1, scale 0.96→1, translateY 6px→0 over 180ms with `easeOut`. From toolbar: a lightweight preview travels to placement over 220ms, then the card appears. Editor focus must not wait for animation completion. |
| Deletion | Opacity 1→0 and scale 1→0.94 over 140ms with `easeIn`. Remove logical content immediately; the animation uses a noninteractive visual snapshot. |
| Undo toast | Enter over 160ms with opacity and 8px upward motion; remain for eight seconds. Pause timeout on hover/focus. Undo remains available through history after dismissal. |
| Nested-board opening | Animate a noninteractive board-card snapshot toward the viewport over 280ms with `easeInOut`; destination crossfades during the final 100ms. Route and accessibility state update immediately. Back navigation reverses the spatial cue. |
| Checkbox completion | Checkmark draws over 120ms with `easeOut`; background changes over 120ms; text color/strikethrough changes over 160ms. Text remains selectable. |
| Link-preview loading | Skeleton uses a restrained 1200ms linear shimmer only while loading. Replace with content through a 120ms opacity transition without changing card position. |
| Upload progress | Progress width interpolates between real samples over 100ms linear. Display exact percentage for transfer, then separate Processing state. Never fabricate progress. Completion badge fades over 160ms. |
| Remote cursors | Buffer samples by 80ms and interpolate positions with requestAnimationFrame. Extrapolate for at most 100ms, then hold. Fade disconnected cursors over 150ms. |
| Menus/popovers | Opacity and 4px translation over 120ms with `easeOut`; exit over 80ms. |
| Dialogs | Overlay fades over 120ms; dialog opacity and scale 0.98→1 over 160ms with `easeOut`. |
| Toasts and notifications | Enter/exit over 160/120ms; no bouncing or screen-wide motion. |

## 4.3 Reduced motion

Respect `prefers-reduced-motion` and provide a user preference that can additionally reduce motion.

When reduced motion is active:
- Remove tilt, scale pickup, spring overshoot, travel animations, spatial board transitions, and inertial panning.
- Apply camera changes immediately.
- Use instant changes or opacity transitions of at most 80ms.
- Replace shimmer with static skeleton blocks.
- Update remote cursors without delayed animated interpolation.
- Keep progress indicators, selection, focus, and drag position accurate.
- Do not animate user-uploaded media automatically.

**Motion acceptance:** verify triggers and timings against shared tokens; no animation delays typing or direct manipulation; interrupted gestures leave no ghost card, stale placeholder, or orphaned overlay.

---

# 5. UI / VISUAL DESIGN

## 5.1 Visual direction

Use a quiet, original workspace aesthetic:
- Light-first neutral canvas.
- White cards with fine borders and restrained shadows.
- Compact chrome around a generous working area.
- Accent color reserved for selection, focus, and primary actions.
- No decorative gradients, glass effects, oversized dashboard headings, or continuously animated backgrounds.

Optional dark mode must cover every component, card type, editor, dialog, skeleton, and export theme.

## 5.2 Design tokens

### Colors

| Token | Light | Dark |
|---|---|---|
| Canvas | `#F5F4F0` | `#191B1F` |
| Surface | `#FFFFFF` | `#23262B` |
| Raised surface | `#FFFFFF` | `#2B2F35` |
| Primary text | `#24272D` | `#F1F3F5` |
| Secondary text | `#626872` | `#B4BBC5` |
| Decorative border | `#D9DDE3` | `#454B54` |
| Primary accent | `#315BCB` | `#A3B9FF` |
| Selection fill | `rgba(49,91,203,0.08)` | `rgba(163,185,255,0.12)` |
| Success | `#23734D` | `#8DD8B1` |
| Warning | `#835800` | `#F0CD77` |
| Danger | `#B42332` | `#FF9CA7` |

Card presets: neutral, pale yellow, peach, rose, lavender, blue, mint, and gray. Define separate tested dark equivalents.

Validate actual combinations. Decorative borders need not serve as the sole control boundary; interactive boundaries must meet applicable non-text contrast requirements.

### Typography

- Self-host an openly licensed sans-serif such as Inter; include a system fallback.
- Monospace: openly licensed font or system monospace stack.
- Scale: 12, 13, 14, 16, 20, 24, 32px.
- Main UI: 14px/20px.
- Card body: 16px/24px.
- Metadata: 12px/16px.
- Weights: 400 body, 500 controls, 600 titles.
- Avoid fixed-height text containers that clip enlarged text.
- Rich-text headings use 24/32, 20/28, and 18/26px.

### Spacing and geometry

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Header: 56px.
- Desktop creation rail: 64px.
- Desktop side panels: 320px, resizable between 280 and 480px.
- Desktop controls: minimum 32px visible height with at least 24px targets.
- Touch controls: minimum 44px targets.
- Radii: 4px inputs, 6px cards, 8px menus, 12px dialogs, full circles for avatars.
- Default card padding: 16px.
- Default column child gap: 12px.

### Shadows

- Card: `0 1px 2px rgba(24,28,36,0.08), 0 3px 10px rgba(24,28,36,0.04)`.
- Hover: `0 2px 6px rgba(24,28,36,0.10), 0 6px 18px rgba(24,28,36,0.06)`.
- Pickup: `0 10px 28px rgba(24,28,36,0.18), 0 2px 6px rgba(24,28,36,0.10)`.
- Menu/dialog: `0 12px 36px rgba(24,28,36,0.16)`.
- Supply dark-mode equivalents without bright halos.

Keep visual pickup-shadow transitions off the hot path; use layered shadow opacity where practical.

## 5.3 Component inventory

Implement reusable:
- Application shell, workspace switcher, header, breadcrumbs.
- Creation rail and mobile Add sheet.
- Canvas viewport, zoom controls, minimap toggle, selection overlay, snapping guides.
- Every specified card renderer and editor.
- Card context menu, contextual formatting toolbar, resize handles.
- Column header, insertion placeholder, connector controls.
- Dashboard board tile/list row.
- Unsorted tray, search panel, trash, history panel.
- Comments sidebar, mention picker, notification center.
- Share dialog, role selector, invitation form, publication settings.
- Upload queue, export dialog, job status.
- Template browser.
- Toast, tooltip, popover, modal, confirmation dialog.
- Avatar group, presence cursor, remote selection marker.
- Skeleton, empty state, error state, retry control, read-only banner.
- Shortcut help and accessible linear board view.

Each interactive component must have enabled, hovered, focused, pressed, disabled, loading, and error states where relevant.

## 5.4 Layout and responsive behavior

Desktop:
- Header contains breadcrumbs, title, save status, presence, Share, and Export.
- Left rail contains creation tools.
- Right side panels overlay or resize the available canvas without moving stored world positions.

Tablet:
- Compact header and collapsible tool rail.
- Panels become dismissible sheets.
- Touch gestures preserve full canvas capability.

Mobile:
- Compact header, bottom action bar, full-screen editing sheets.
- Default to the last selected view; first use opens linear view.
- Linear view orders cards deterministically and renders columns as sections.
- Provide Move to column, Move to board, Reorder, and position controls.
- Respect safe-area insets and the virtual keyboard.
- Opening an editor must not hide its caret behind the keyboard.

**Visual acceptance:** no unintended horizontal page scrolling at 320px; no overlapping controls at 200% browser zoom; consistent optical icon alignment and spacing across all card types.

## 5.5 Accessibility

Meet WCAG 2.2 AA for the supported workflows.

- Semantic buttons, inputs, headings, dialogs, and menus.
- Do not label the whole canvas as an ARIA application unless the keyboard model justifies it.
- Provide a keyboard-accessible board navigator listing cards and columns.
- Tab order follows meaningful UI structure, not spatial DOM accidents.
- Enter edits/opens; Escape exits editing or transient UI; focus returns to the invoking control.
- Focus ring: 2px accent with 2px offset.
- Text contrast at least 4.5:1, or 3:1 for qualifying large text.
- Necessary non-text control contrast at least 3:1.
- Accessible names for icon-only controls.
- Announce completed move, insertion, deletion, upload, and save errors through a polite live region; do not announce every pointer movement.
- Provide alternatives to drag and pinch.
- Do not communicate role, task status, presence, or errors solely through color.
- Trap focus in modal dialogs and restore it on close.
- Use user-entered image alt text; decorative preview imagery has appropriate empty alternatives.
- Virtualization must not remove focused or actively edited content.
- Linear view must provide access to cards culled from the visual canvas.

**Accessibility acceptance:** all primary tasks work by keyboard; automated checks have no serious/critical violations; manually test one desktop screen reader and mobile touch accessibility.

---

# 6. PERFORMANCE & QUALITY REQUIREMENTS

## 6.1 Large-board performance

Required deterministic benchmark:
- 1,000 cards: 500 notes, 200 image cards, 100 task cards, 100 links, 100 miscellaneous cards.
- Include 50 columns, 200 connectors, and three simulated collaborators.
- Use real rendered content and thumbnails, not empty boxes.
- Benchmark production builds at 1440 × 900 on a documented machine with at least four CPU cores and 8GB RAM.

Targets:
- At least 95% of frames during a 10-second pan/group-drag/zoom run complete within 16.7ms on the reference machine.
- No main-thread task above 100ms during steady manipulation.
- Local pointer feedback appears by the next animation frame.
- Cached-board opening becomes interactive within one second.
- On a 20Mbps connection with 100ms RTT, cold board content becomes usable within three seconds; media may continue loading.
- Visible card editing remains responsive when collaborators update other cards.

Implementation:
- Cull cards outside the viewport plus a 400-screen-pixel overscan margin.
- Pin focused, edited, selected, dragged, and comment-targeted cards.
- Index cards and connector bounds spatially.
- Avoid scanning all 1,000 items on each pointer event.
- Use requestAnimationFrame for gesture rendering.
- Batch subscriptions and geometry measurements.
- Lazy-load editors, previews, and media viewers.
- Use image thumbnails sized for display and zoom.
- Revoke object URLs and release subscriptions on unmount.
- No unbounded awareness logs, hidden media playback, or accumulating event listeners.
- Use simplified rendering at low zoom.

**Acceptance:** provide benchmark fixture, repeatable script, frame-time report, environment details, and known bottlenecks. Do not assert 60fps without measurement.

## 6.2 Optimistic updates and conflict handling

- Apply valid local commands immediately.
- A command remains pending until durably acknowledged.
- Handle duplicate retries idempotently.
- Reject invalid changes visibly and reconcile with authorized server state.
- Preserve recoverable local content after rejection.
- Concurrent deletes must not silently recreate items.
- Background preview/asset completion must not overwrite subsequent user edits.
- Structural conflicts produce explicit resolution messages.

**Acceptance:** inject latency, duplicate delivery, out-of-order delivery, authorization failure, and server interruption; no acknowledged content is lost.

## 6.3 Offline support

- Cache the app shell and opened board documents.
- Support offline text editing, task changes, geometry edits, drawings, and local captures on cached editable boards.
- Queue hierarchy, comments, and upload operations with explicit pending state.
- Do not imply uncached remote media or first-time login works offline.
- Store new upload blobs locally within available quota; show storage failure and an immediate download/recovery option.
- Use a bounded media cache, default 200MB, with LRU eviction; never evict unsynchronized document changes or queued upload originals silently.
- Namespace local storage by authenticated user.
- Clear local account data on logout after offering recovery for unsynced work.
- On reconnect, reauthenticate, verify board access and epoch, then merge.
- If editing permission was revoked, quarantine unsynced edits and offer local export; do not submit unauthorized writes.
- Handle IndexedDB unavailability and quota exhaustion explicitly.

**Acceptance:** edit a cached board offline, reload offline, reconnect, and converge with concurrent remote changes without duplicates. Permission revocation and stale epochs cannot resurrect content.

## 6.4 Autosave

Show:
- “Saving…” while commands are pending.
- “Saved” only after server durability acknowledgment.
- “Offline — saved on this device” only after successful IndexedDB persistence.
- “Save failed” with retry/recovery actions when persistence fails.

Debounce routine status changes by 300ms to avoid flicker. Display a persistent warning if pending changes exceed five seconds. Browser unload warnings apply only to genuinely unsaved or unpersisted local data.

**Acceptance:** killing the server immediately after “Saved” and restarting it preserves the acknowledged command.

## 6.5 Security and operational readiness

- Private storage, authorized downloads, short-lived signed URLs.
- CSP, output encoding, rich-text sanitization, safe embed origins, and upload validation.
- Scan files before serving them.
- Enforce resource limits for documents, strokes, text, previews, and exports.
- Default board limit: 10,000 cards and 20,000 connectors; reject additional creation with a recovery path.
- Limit decoded collaboration update size to 2MB; chunk legitimate large operations.
- Rate-limit API writes and WebSocket traffic.
- Reject nonfinite coordinates and invalid dimensions.
- Avoid logging tokens, passwords, complete document bodies, or private asset URLs.
- Structured logs, request IDs, error tracking hooks, and metrics for sync latency, save failures, job failures, connection count, and update throughput.
- Health and readiness endpoints.
- Graceful shutdown drains accepted writes.
- Containerized services run without root where practical.
- Document backups and perform one database/object-storage restore exercise.
- Never deploy with seeded production credentials or publicly writable storage.

**Acceptance:** authorization tests cover REST, WebSocket, search, asset downloads, exports, comments, nested boards, and public publishing.

## 6.6 Required automated and manual tests

Unit:
- Coordinate transforms, zoom anchoring, hit testing.
- Snapping, layout, ordering, connector geometry.
- Clipboard ID remapping.
- Permissions and inheritance.
- Undo compensation and causal conflict handling.
- Schema migrations and input validation.

Integration:
- Auth lifecycle.
- Board hierarchy/trash/restore.
- Update persistence and replay.
- File upload, processing, and asset authorization.
- Mention deduplication.
- Share revocation.
- Export jobs and search authorization.
- Offline outbox idempotency.

End to end:
- Create and edit every card type.
- Select/group-drag/resize at multiple zoom levels.
- Reorder and extract column children.
- Create/edit/delete connectors.
- Navigate nested boards and restore camera.
- Copy/paste across boards.
- Undo/redo before and after reload.
- Concurrent rich text and geometry edits.
- Offline reload and reconnect.
- Public viewer mutation rejection.
- Export mixed content.
- Keyboard-only and touch workflows.
- Reduced motion and dark mode.

Manual:
- Desktop and mobile visual review in one batched pass.
- Fix discovered issues in one batch and perform a confirmation pass.
- Verify screen-reader behavior, IME composition, clipboard permissions, trackpad gestures, touch cancellation, and large-board performance.
- Reopen testing only for new changes or unresolved failures.

Use controlled clocks or reduced-motion fixtures for deterministic tests. Do not rely on arbitrary sleeps for asynchronous correctness.

---

# 7. IMPLEMENTATION PLAN

Implement milestones in order. Each must leave a working, testable application. Maintain `docs/feature-matrix.md` mapping every requirement to implementation, tests, and completion status.

Temporary local adapters are permitted in early milestones, but must conform to final interfaces and be replaced before completion.

## Milestone 1: Canvas engine

Deliver:
- App shell and design tokens.
- Coordinate system and camera.
- Pointer/keyboard/touch pan and zoom.
- Basic card rendering.
- Selection, marquee, drag, multi-drag, resize.
- Spatial index, culling, and screen-space overlays.
- Gesture cancellation and local command history.
- Benchmark fixture.

Exit criteria:
- Coordinate and gesture tests pass.
- Zoom anchoring and pointer offsets meet tolerances.
- 1,000-card basic fixture meets frame targets.
- Keyboard and touch alternatives work.

## Milestone 2: Core cards and editing

Deliver:
- Rich text, tasks, images, links, files, media, colors, drawings.
- Creation toolbar and mobile Add sheet.
- Inline editing and contextual controls.
- Upload/preview states using real local backend worker capabilities.
- Clipboard and desktop/browser drop ingestion.
- Type-specific validation and commands.

Exit criteria:
- Every card can be created, edited, duplicated, deleted, and exported into a normalized internal representation.
- Text editing does not conflict with drag.
- Failure/retry states work.
- No static fake previews or fake upload progress remain.

## Milestone 3: Columns, connectors, and nested boards

Deliver:
- Column membership/reordering/extraction.
- Connector anchors, labels, curve handles, and styling.
- Board cards, hierarchy, breadcrumbs, and camera restoration.
- Alignment, stacking, snapping, and board transfers.
- Original built-in template documents.

Exit criteria:
- Membership and hierarchy invariants hold.
- Internal connectors remap during duplication.
- Nested navigation preserves spatial context.
- Concurrent structural operations have deterministic outcomes in domain tests.

## Milestone 4: Persistence and backend API

Deliver:
- Authentication and workspace membership.
- PostgreSQL migrations and metadata API.
- Durable Yjs updates and snapshots.
- Private object storage and processing workers.
- Autosave feedback.
- Unsorted, Trash, restore, and retention.
- Persisted semantic history and checkpoints.
- IndexedDB and offline outbox.
- OpenAPI documentation and seed data.

Exit criteria:
- Full product data survives client/server restart.
- No “Saved” status occurs before durability.
- Offline changes survive reload.
- Authorization and asset-access tests pass.
- All early in-memory persistence adapters are replaced.

## Milestone 5: Micro-animations and interaction polish

Deliver:
- All Section 4 interactions.
- Consistent context menus, dialogs, tooltips, toasts, and progress states.
- Dark mode.
- Responsive desktop/tablet/mobile layouts.
- Linear board view.
- Accessibility and reduced motion.
- Shared motion tokens and interruption handling.

Exit criteria:
- Timings, thresholds, and triggers match the specification.
- Pointer manipulation has no animation lag.
- Keyboard-only and reduced-motion workflows pass.
- Visual review finds no clipped text, overlapping controls, or orphaned gesture previews.

## Milestone 6: Collaboration and sharing

Deliver:
- Authorized WebSocket provider.
- Multi-instance room coordination.
- Live cursors, avatars, selections, and rich-text presence.
- Comment threads, mentions, notifications.
- Named invitations, view/edit links, passwords, expiration, and revocation.
- Sanitized public publishing.
- Reconnect conflict handling and permission-revocation recovery.

Exit criteria:
- Three browser sessions converge under concurrent and offline edits.
- Presence is transient and does not pollute undo.
- Viewers cannot mutate through forged requests.
- Revoked access is enforced across active sockets and download jobs.
- Public snapshots contain no private comments, emails, memberships, or raw history.

## Milestone 7: Export, templates, search, and final QA

Deliver:
- PDF, PNG, Markdown, and asset ZIP exports.
- Template browser and save-as-template.
- Permission-filtered search and cached offline search.
- Dashboard recents, favorites, and covers.
- Production Dockerfiles and deployment configuration.
- CI for lint, type checks, tests, builds, and required security checks.
- Performance report, backup/restore guide, and operational documentation.

Exit criteria:
- All required end-to-end tests pass.
- Mixed-media exports are complete and valid.
- Search cannot reveal inaccessible content.
- Large-board targets are measured and met.
- Fresh installation and production build work from documented commands.
- No TODO-driven placeholder remains in a required workflow.

## Final delivery requirements

Provide:
1. Complete source code and lockfile.
2. Versioned database and document migrations.
3. `.env.example`.
4. Docker Compose for PostgreSQL, Redis, MinIO, Mailpit, API, collaboration service, worker, and web application.
5. Original demo data and templates covering every card type.
6. README with exact setup, development, test, build, and deployment commands.
7. Architecture, permission model, collaboration protocol, offline behavior, history semantics, and recovery documentation.
8. Feature matrix with implementation and test references.
9. Automated test results and performance evidence.
10. A concise completion report listing working features, validation performed, and any actual limitations.

Do not report completion while a required feature is mocked, a required test fails, or an authorization path is unenforced. If an external credential is unavailable, provide a working local service and a documented production configuration path. Continue implementing and validating all independently achievable work without asking follow-up questions.
