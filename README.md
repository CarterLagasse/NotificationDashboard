# Notify — Phone Notification Dashboard

A React dashboard that connects to the Android app over a local WebSocket and displays incoming phone notifications in real time.

## Requirements

- [Node.js](https://nodejs.org) LTS
- [VSCode](https://code.visualstudio.com) or any editor
- Android app running and showing `ws://<phone-ip>:8080`

## Quick Start

```bash
git clone https://github.com/yourusername/notification-dashboard.git
cd notification-dashboard
npm install
npm run dev      # Vite dev server at http://localhost:3000 (HMR)
# or
npm start        # same as above
```

Open the dashboard, go to **Settings → WebSocket Connections → Add connection**, paste the `ws://...` address from your phone, Save, select it, click **Connect** in the top bar.

> Phone IP can change after router reboot. Set a DHCP reservation / static IP for your phone to keep it stable.

## Production — Keep It Running (PM2)

No extra `C:\notif-server` folder needed. The repo now includes `server.js` (serves `build/` with `serve-handler`, `PORT`/`BUILD_PATH` env-aware) and `ecosystem.config.js`.

```bash
npm run build
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
```

Verify:

```bash
pm2 list                 # should show notification-dashboard online
pm2 logs notification-dashboard --lines 15
curl http://localhost:3000/  # should return <!doctype html>
```

### Auto-start on Windows login

```bash
npm install -g pm2-windows-startup
pm2-startup install
pm2-startup              # verify
# Task Manager → Startup apps should show pm2-windows-startup
```

Note: triggers on login, not boot. If PC sits at lock screen after reboot, log in once to resurrect.

Manual resurrect if needed:

```bash
pm2 resurrect
```

## Updating

```bash
npm run build
pm2 restart notification-dashboard
# hard-refresh browser: Ctrl+Shift+R
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | Vite dev server with HMR |
| `npm run build` | Vite production build to `build/` (was `react-scripts`, now ~0.4s) |
| `npm run preview` | Preview production build locally |
| `npm run serve` | `node server.js` — serves `build/` on `PORT` |

## Storage &Retention

Notifications, groups, connections, widget layouts, and icon rules are stored in `localStorage` (`nd_*` keys, `nd_version=2`). A retention cap (Settings → Storage) trims oldest non-starred/non-grouped when you exceed 250 / 500 / 1000 / Unlimited (default 500). `generateId` now hashes content to avoid collisions.

## Troubleshooting

- **Build fails:** ensure `node --version` ≥ 18, `npm install` clean, then `npm run build`.
- **Port in use:** `npx pm2 delete notification-dashboard` then `pm2 start ecosystem.config.js`.
- **Old content after update:** hard refresh, or check `build/index.html` timestamp matches last build.
- **Not connected:** re-check `ws://` IP in phone app, ensure phone and PC on same Wi-Fi / no firewall block on 8080.
