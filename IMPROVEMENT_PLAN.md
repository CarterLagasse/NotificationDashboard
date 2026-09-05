# Improvement Plan — Notification Dashboard

> Scope: runtime speed, dead-code removal, quality-of-life. Docker deferred. All paths relative to `notification-dashboard/`. Updated Sep 4 2026 — Priority 0 + most of Priority 1 already shipped (see Completed).

## Completed (Sep 4 2026) — do not re-do

- **Dead code deleted:** `src/App.css`, `src/App.test.js`, `src/reportWebVitals.js`, `src/setupTests.js`, `src/logo.svg`, `web-vitals` from `package.json:14`, removed `react-app/jest` eslint extension. `public/logo192.png`/`logo512.png` kept for PWA manifest.
- **Filters bug fixed:** `src/filters.js:39` duplicate `com.android.systemui` in `APP_BANNED_PREFIXES` merged; left comment that `JUNK_PACKAGES:21` still fully blocks that package (intentional — remove from `JUNK_PACKAGES` if prefix filtering desired).
- **Fonts moved:** `public/index.html:14` now has `<link preconnect>` + Google Fonts stylesheet; `src/App.js:271` `@import` removed; global reset moved to `src/index.css:1` and imported in `src/index.js:3`.
- **Hardcoded path fixed:** Deleted `Userscartenotif-server.js`, added `server.js:5` with `path.join(__dirname,'build')` + `process.env.PORT`/`BUILD_PATH`, `directoryListing:false`, `cleanUrls:true`, SPA rewrites. Added `ecosystem.config.js:1` and `package.json:18` `serve` script. PM2 now runs `server.js` from repo (migrated Sep 4: `pm2 delete` → `pm2 start ecosystem.config.js` → `pm2 save`); `C:\notif-server` is deprecated and can be deleted.
- **Runtime fixes shipped:** `src/App.js:20` single `load("nd_deleted")` seeded into `deletedSetRef`, `src/utils.js:45` added `saveDebounced` + quota warning, `src/App.js:52` debounced `nd_*` saves (300ms), memoized `appNames`/`filtered`/`grouped`/`TABS`/`statusColor`/`activeConnection` with `useMemo` (`src/App.js:228`/`230`/`245`), `mergeNotifications:71` now indexes by `packageName` (no more `merged.some` O(n²)) + caps at `MAX_NOTIFICATIONS=500` evicting oldest non-starred/non-grouped, `wsRef` guards `readyState !== CLOSED` and `onerror → scheduleReconnect` (`src/App.js:148`/`167`), `switchConnection:198` clears timer, `src/components/Widgets.js:466` uses `AbortController`.
- **Build verified:** `npm run build` now compiles clean (only intentional `eslint-disable` left), PM2 `online` serving `build` on `:3000`.

---

## Next layer — still to do (prioritized)

### 1. Virtualize the notification list (biggest remaining perf win)
- **Current:** `src/App.js:530` renders every `grouped` item (divider + `NotificationCard`) in DOM. At 500 capped it is okay, but scroll and filter still create ~500 React nodes.
- **Action:** Add `react-virtuoso` (preferred over `react-window` — handles variable height + sticky `DateDivider`). Keep `DateDivider:242` as grouped header. Gate behind `notifications.length > 100` so small lists keep simple path.
- **Files:** `src/App.js:245` `grouped` → virtuoso `GroupedVirtuoso`, `src/components/Notifications.js:105` already memo'd.
- **Verify:** Profiler — filter/search should not re-render off-screen cards.

### 2. Extract inline styles / hoist constant objects
- **Current:** `src/App.js:268-543` and `src/components/*.js` recreate `style={{}}` literals each render (80% of files). React diffs them but it is noisy and blocks theming.
- **Action:** Move global rules (scrollbar, `input:focus`, keyframes) to `src/index.css:1` (already started). Hoist repeated objects (e.g., `TABS` pill, `Card` padding) to `const` outside component or to `src/theme.js:1` helpers. Do not introduce CSS framework yet — just hoist.
- **Defer:** Full CSS modules / Tailwind until Vite migration.

### 3. Widgets — deduplicate ESPN fetches (beyond AbortController)
- **Current:** Each `TeamCard:456` fetches `scoreboard` + `schedule` + `standings` every `TEAM_REFRESH_MS=60s`. With 2 team widgets = 6 req/min to `site.api.espn.com`, no shared cache.
- **Action:** Create `src/hooks/useEspn.js` with `SWR` or simple `Map` cache keyed by `sport/league` for scoreboard/standings (shared across widgets). Keep per-team `schedule` fetch. Consider `TEAM_REFRESH_MS` 60s → 90-120s. Add small in-memory dedupe so concurrent mounts do not fire parallel identical fetches.
- **Verify:** Network tab — one `scoreboard` request per interval regardless of widget count.

### 4. `localStorage` hardening & retention UX
- **Current:** `src/utils.js:45` now warns on `QuotaExceededError` but still drops write. No user feedback, no retention control.
- **Action:** Add `SettingsPanel` control: retention `250 / 500 / 1000 / unlimited` (default 500). On quota error, evict oldest non-starred/non-grouped until `save` succeeds, then toast `Trimmed N old notifications`. Add `nd_version` key and migration in `src/utils.js:40` `load` (currently silent `catch → fallback`); start at `v1` so future `generateId` or schema changes can migrate.
- **Also:** `src/utils.js:37` `generateId` (`slice(0,10)`) is collision-prone; switch to `packageName-timestamp-hash` (e.g., `hashStringToInt` already in `Widgets.js:622`) when you version storage.

### 5. Build toolchain — Vite migration (optional, biggest dev-experience win)
- **Current:** `package.json:12` `react-scripts@5.0.1` deprecated, 120s install, slow HMR.
- **Action:** `npm create vite@latest -- --template react`, copy `src/` + `public/`, add `@vitejs/plugin-react`, move `homepage`/`browserslist` to `vite.config.js`, keep `server.js` unchanged. Keep this last — touches many files but `src/` unchanged.
- **Benefit:** `npm run build` ~3s, instant HMR, smaller `node_modules`.

### 6. Cleanup & docs
- **Delete deprecated:** `C:\notif-server\` folder (after confirming PM2 stable for a week). Remove `README.md:97-145` `C:\notif-server` steps; replace with 3-command flow: `npm run build` → `pm2 start ecosystem.config.js` → `pm2 save` (+ `pm2-startup` note still valid). Update title in `public/index.html:27` from `React App` → `Notify`.
- **Manifest/icons:** Replace `public/logo192.png`/`logo512.png`/`favicon.ico` with real app icon or remove if not using PWA.
- **`.gitignore`:** Already correct (`/build` ignored); ensure `C:\notif-server` never re-added.
- **Tests:** Re-add minimal test after Vite (e.g., vitest + `src/App.test.js` that actually renders `Notify` header), or delete `test` script if you do not want tests.

---

## Suggested order (next 2-3 weeks)

1. **Week 1:** #1 virtualization + #2 style hoisting — both isolated, measurable in Profiler.
2. **Week 2:** #3 ESPN dedupe + #4 retention UX — network + localStorage wins.
3. **Week 3+:** #5 Vite if you want faster dev loop; #6 docs/icons anytime.

## How to verify remaining items
- `npm run build` — no warnings (only intentional `eslint-disable`).
- `npm start` — `localhost:3000` loads, preconnect fonts in `<head>`, WebSocket reconnect works (kill phone hotspot → reappears within backoff).
- React DevTools Profiler: typing in `search` should not re-render off-screen virtuoso items.
- Network tab: one `scoreboard` fetch per interval.
- Application → Local Storage: `nd_notifications` ≤ cap, `nd_version` present.
- `pm2 list` + reboot → resurrect still works via `ecosystem.config.js` path.

## Explicitly out of scope
- Docker.
- Auth/encryption for WebSocket (LAN only).
- Backend beyond `localStorage` (until you outgrow quota).
