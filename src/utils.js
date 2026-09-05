// Small stateless helpers: time formatting, id generation, localStorage,
// image compression, and keyword parsing.

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatAbsolute(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STORAGE_VERSION = 2;

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function generateId(n) {
  const base = `${n.packageName}-${n.timestamp}`;
  const content = `${n.title || ""}|${n.text || ""}`;
  return content ? `${base}-${hashStr(content).slice(0, 8)}` : base;
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    return JSON.parse(v);
  } catch { return fallback; }
}

function ensureVersion() {
  try {
    const v = localStorage.getItem("nd_version");
    if (!v) localStorage.setItem("nd_version", JSON.stringify(STORAGE_VERSION));
    else if (JSON.parse(v) !== STORAGE_VERSION) {
      localStorage.setItem("nd_version", JSON.stringify(STORAGE_VERSION));
    }
  } catch {}
}
ensureVersion();

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      console.warn(`localStorage quota exceeded for ${key} — trimming`);
      // Try to free space by trimming nd_notifications if that's the culprit
      if (key === "nd_notifications" && Array.isArray(value)) {
        try {
          const trimmed = value.filter(n => n.starred || n.group).concat(value.filter(n => !n.starred && !n.group).slice(0, 250));
          localStorage.setItem(key, JSON.stringify(trimmed.slice(0, 500)));
        } catch {}
      }
    }
  }
}

function saveDebounced(key, value, timers) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => save(key, value), 300);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 64;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png", 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Splits a comma-separated keyword string into a clean list of lowercase keywords.
function parseKeywords(raw) {
  return (raw || "")
    .split(",")
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
}

export { STORAGE_VERSION, timeAgo, formatAbsolute, formatDate, formatDuration, generateId, load, save, saveDebounced, compressImage, parseKeywords };