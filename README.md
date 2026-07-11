# Notification Dashboard — Web Dashboard

A React dashboard that connects to the Android app over a local WebSocket and displays incoming phone notifications in real time. This README covers setup for the **web dashboard** specifically. See the `android-app` folder for the phone-side app.

---

## Requirements

- A Windows PC (these steps are Windows-specific; adjust paths for Mac/Linux)
- [Node.js](https://nodejs.org) (LTS version)
- [VSCode](https://code.visualstudio.com) or any code editor
- The Android app already set up and running (see its README)

---

## One-Time Setup

### 1. Install Node.js

Download the **LTS version** from [nodejs.org](https://nodejs.org), install with default options. Verify it worked by opening a terminal and running:

```bash
node --version
npm --version
```

Both should print version numbers.

### 2. Clone the Repository

```bash
git clone https://github.com/yourusername/notification-dashboard.git
cd notification-dashboard/web-dashboard
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Open in VSCode

```bash
code .
```

### 5. Run in Development Mode (For Testing/Editing)

```bash
npm start
```

This opens the dashboard at `http://localhost:3000` in your browser. This mode is for active development — it auto-reloads when you save changes, but it stops running the moment you close the terminal or VSCode.

For a version that stays running permanently in the background, continue to the Production Setup section below.

### 6. Connect to Your Phone

Open the Android app on your phone — it displays a WebSocket address, e.g.:

```
ws://192.168.1.42:8080
```

In the dashboard, go to the **Settings** tab → **WebSocket Connections** → **Add connection**. Give it a name (e.g. "Home") and paste that address into the URL field, then click **Save**. Select it as the active connection and click **Connect** in the top bar.

This address is your phone's local IP, which can occasionally change if your router reassigns it. If the dashboard ever shows "Not connected" unexpectedly, check the address shown on the phone app again and update it in Settings if it's changed. Setting a static IP / DHCP reservation for your phone in your router's admin settings prevents this from happening.

---

## Production Setup — Keep It Running Permanently

By default, closing VSCode or its terminal kills the dashboard. To have it run continuously in the background — surviving closed terminals and even PC restarts — we use a small static file server managed by **PM2**, a process manager.

### Step 1 — Build the React App

```bash
cd "C:\path\to\notification-dashboard\web-dashboard"
npm run build
```

This compiles the app into a `build` folder containing static files that don't need a live dev server.

### Step 2 — Install PM2

```bash
npm install -g pm2
```

### Step 3 — Open Command Prompt

Press the Windows key, type `cmd`, press Enter. A plain black window opens — that's it. Use **Command Prompt** specifically for the following steps, not Git Bash or VSCode's integrated terminal — Git Bash can mangle Windows-style file paths and cause errors.

### Step 4 — Create a Clean Server Folder

```
mkdir C:\notif-server
cd C:\notif-server
```

### Step 5 — Initialize and Install

```
npm init -y
npm install serve-handler
```

### Step 6 — Create the Server Script

```
notepad server.js
```

Click **Yes** to create the file. Paste this in:

```javascript
const http = require('http');
const handler = require('serve-handler');

const BUILD_PATH = "C:\\path\\to\\notification-dashboard\\web-dashboard\\build";
const PORT = 3000;

const server = http.createServer((req, res) => {
  return handler(req, res, { public: BUILD_PATH });
});

server.listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT}`);
});
```

Update `BUILD_PATH` to match your actual project location on disk.

In the Save dialog: change **Save as type** to **All Files**, confirm the filename is exactly `server.js`, click Save, then close Notepad.

### Step 7 — Test It Manually

Still in Command Prompt:

```
node C:\notif-server\server.js
```

Open `http://localhost:3000` in your browser — confirm the dashboard loads. Then press `Ctrl+C` in Command Prompt to stop it.

### Step 8 — Run It Through PM2

```
pm2 delete notification-dashboard
pm2 start C:\notif-server\server.js --name notification-dashboard
```

### Step 9 — Verify

```
pm2 list
```

Confirm you see a real `pid` number and status `online`.

```
pm2 logs notification-dashboard --lines 15
```

Confirm clean output: `Serving on http://localhost:3000` with no errors.

### Step 10 — Save the Process List

```
pm2 save
```

This takes a snapshot of whatever is currently running under PM2 (in this case, `notification-dashboard`) and writes it to disk. This snapshot — not whatever happens to be running at the moment of a restart — is what gets restored on boot. Any time you add, remove, or reconfigure a PM2 process and want that reflected after a restart, run `pm2 save` again to update the snapshot.

---

## Auto-Start on Windows Boot (Optional but Recommended)

By default, if your PC restarts, PM2's process list needs to be manually restored with `pm2 resurrect`. To make this automatic on every boot, install `pm2-windows-startup` — a small utility that adds a registry entry so `pm2 resurrect` runs automatically when you log into Windows.

### Step 1 — Install the Utility

Still in Command Prompt:

```
npm install pm2-windows-startup -g
```

### Step 2 — Register It

```
pm2-startup install
```

That's it — no dialogs, no manually filling in paths. PM2 will now automatically resurrect your saved process list every time you log into Windows.

**Note:** this triggers on login, not on boot itself. If this PC ever restarts and sits at the lock screen without anyone logging in, the dashboard won't come back until someone signs in. For a normal desktop you log into shortly after it boots, this isn't an issue.

### Step 3 — Verify It's Registered

```
pm2-startup
```

This confirms the startup entry is installed. You can also check **Task Manager → Startup apps** — you should see an entry associated with `pm2-windows-startup`.

To remove it later, if ever needed:

```
pm2-startup uninstall
```

---

## Everyday Use

Once set up, the dashboard runs continuously at `http://localhost:3000`. You don't need to keep any terminal or VSCode window open — PM2 manages the process independently in the background.

If your PC restarts and, for whatever reason, the auto-start doesn't fire, you can always manually restore it:

```
pm2 resurrect
```

---

## Updating the Code

Whenever you pull new changes or edit the React code yourself, two steps bring the live dashboard up to date:

### Step 1 — Rebuild

```bash
cd "C:\path\to\notification-dashboard\web-dashboard"
npm run build
```

### Step 2 — Restart the PM2 Process

```bash
pm2 restart notification-dashboard
```

This reloads the server with the freshly built files — no need to delete or reconfigure anything.

**Note:** if your browser still shows old content after restarting, do a hard refresh (`Ctrl+Shift+R`) to clear cached assets.