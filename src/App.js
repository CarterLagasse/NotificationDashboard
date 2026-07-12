import { useState, useEffect, useRef } from "react";

//If the restart fails:
//pm2 start C:\notif-server\server.js --name notification-dashboard
//Pm2 save

//For updating code:
//npm run build
//pm2 restart notification-dashboard


// ─── Constants ────────────────────────────────────────────────────────────────

const JUNK_PREFIXES = [
  "Make sure your device is connected to the Internet.",
];

const JUNK_PACKAGES = [
  "com.android.deskclock",
  "com.sec.android.app.clockpackage",
  // "com.android.systemui",
  // "com.android.system",
];

// Apps that are muted by default — notifications from these packages are
// dropped UNLESS the title or text starts with one of the listed prefixes.
const APP_ALLOWLIST_FILTERS = {
  // "com.android.dialer":            ["Missed call"],
  // "com.google.android.dialer":     ["Missed call"],
  // "com.samsung.android.dialer":    ["Missed call"],
  // "com.samsung.android.incallui":  ["Missed call"],
};

const APP_BANNED_PREFIXES = {
  "com.samsung.android.incallui":      ["Call"],
  "com.android.systemui":              ["Flashlight turned on", "Charging started (", "Charging (", "Edge lighting"],
  "com.google.android.apps.paidtasks": ["Turning on Location History", "Want more surveys? Finish", "New survey available"],
  "com.sec.android.gallery3d":         ["Screenshot saved", "Refining picture..."],
  "com.sec.android.app.camera":        ["Screenshot saved", "Refining picture..."],
  "com.microsoft.appmanager":          ["Connecting to your PC", "Your devices are connected"],
  "android":                           ["Private DNS", "An open"],
  "com.google.android.apps.maps":      ["From "],
  "com.sec.android.app.samsungapps":   ["1 update available"],

};

const APP_COLORS = {
  "com.instagram.android":             "#E1306C",
  "com.google.android.gm":             "#EA4335",
  "com.whatsapp":                      "#25D366",
  "com.twitter.android":               "#1DA1F2",
  "com.facebook.katana":               "#1877F2",
  "com.snapchat.android":              "#FFFC00",
  "com.discord":                       "#5865F2",
  "com.google.android.apps.messaging": "#1A73E8",
  "com.samsung.android.messaging":     "#1A73E8",
};

const T = {
  bg:        "#0A0A0F",
  surface:   "#111118",
  elevated:  "#1C1C28",
  border:    "#2A2A3C",
  primary:   "#5B6AF0",
  star:      "#FFD166",
  danger:    "#EF4565",
  textPrimary:   "#FFFFFF",
  textSecondary: "#ABABC8",
  textMuted:     "#54546C",
};

const MAX_BACKOFF_ATTEMPTS = 6;
const BASE_DELAY_MS = 2000;
const SLOW_RETRY_MS = 60000;

// ─── Utilities ────────────────────────────────────────────────────────────────

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

function generateId(n) {
  return `${n.packageName}-${n.timestamp}-${(n.title || "").slice(0, 10)}`;
}

function getAppColor(packageName) {
  return APP_COLORS[packageName] || T.textMuted;
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
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

function resolveIcon(n, iconRules) {
  for (const rule of iconRules) {
    if (rule.matchType === "app" && rule.matchValue === n.packageName) return rule;
  }
  const text = `${n.appName} ${n.title || ""} ${n.text || ""}`.toLowerCase();
  for (const rule of iconRules) {
    if (rule.matchType === "keyword") {
      const keywords = parseKeywords(rule.matchValue);
      if (keywords.some(k => text.includes(k))) return rule;
    }
  }
  return null;
}

function passesAppAllowlist(n) {
  const allowedPrefixes = APP_ALLOWLIST_FILTERS[n.packageName];
  if (!allowedPrefixes || allowedPrefixes.length === 0) return true; // no restriction for this app
  const title = n.title || "";
  const text = n.text || "";
  return allowedPrefixes.some(p => title.startsWith(p) || text.startsWith(p));
}

function passesAppBannedPrefixes(n) {
  const bannedPrefixes = APP_BANNED_PREFIXES[n.packageName];
  if (!bannedPrefixes || bannedPrefixes.length === 0) return true; // no bans for this app
  const title = n.title || "";
  const text = n.text || "";
  return !bannedPrefixes.some(p => title.startsWith(p) || text.startsWith(p));
}

// ─── Primitive Components ─────────────────────────────────────────────────────

function Dot({ color, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

function Tag({ children, color = T.textSecondary, bg = T.elevated }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: bg, color, fontSize: 11, fontWeight: 700,
      borderRadius: 4, padding: "2px 7px", letterSpacing: "0.04em",
      textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function IconBtn({ onClick, title, children, color = T.textSecondary, size = 18 }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? T.elevated : "none", border: "none", cursor: "pointer",
        color, fontSize: size, padding: "2px 5px", lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 4, transition: "background 0.12s",
      }}>
      {children}
    </button>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? T.primary : T.elevated,
      color: active ? "#fff" : T.textSecondary,
      border: `1px solid ${active ? T.primary : T.border}`,
      borderRadius: 6, padding: "5px 12px", cursor: "pointer",
      fontSize: 13, fontWeight: active ? 700 : 500,
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
      <div onClick={() => onChange(!value)} style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? T.primary : T.border,
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 19 : 3,
          width: 14, height: 14, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
        }} />
      </div>
      <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

function BatteryBar({ pct }) {
  const color = pct > 50 ? "#34D399" : pct > 20 ? "#FBBF24" : T.danger;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 36, height: 12, borderRadius: 3,
        border: `1px solid ${T.border}`, background: T.elevated,
        position: "relative", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color, transition: "width 0.3s, background 0.3s",
        }} />
      </div>
      <span style={{ color: T.textSecondary, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
        {pct}%
      </span>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      color: T.textSecondary, fontSize: 11, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.08em",
      fontFamily: "'JetBrains Mono', monospace",
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "14px 16px", ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Notification Icon ────────────────────────────────────────────────────────

function NotifIcon({ rule, color, size = 32 }) {
  if (!rule) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: color + "22", border: `1.5px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Dot color={color} size={7} />
      </div>
    );
  }

  const shape = rule.iconShape ?? "circle";
  const isCircle = shape === "circle";

  if (rule.iconType === "image" && rule.iconData) {
    return (
      <img src={rule.iconData} alt="" style={{
        width: size, height: size, flexShrink: 0,
        objectFit: "cover",
        borderRadius: isCircle ? "50%" : 0,
        border: isCircle ? `1.5px solid ${T.border}` : "none",
      }} />
    );
  }

  if (isCircle) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: T.elevated, border: `1.5px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.5, flexShrink: 0,
      }}>
        {rule.iconData || "📌"}
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.65, flexShrink: 0,
    }}>
      {rule.iconData || "📌"}
    </div>
  );
}

// ─── Notification Card ────────────────────────────────────────────────────────

function NotificationCard({ notification: n, onDelete, onStar, onGroupAssign, groups, selected, onSelect, selectMode, isNew, timeMode, iconRules }) {
  const color = getAppColor(n.packageName);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const menuRef = useRef(null);
  const iconRule = resolveIcon(n, iconRules);

  useEffect(() => {
    if (!showGroupMenu) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowGroupMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showGroupMenu]);

  const handleCardClick = () => {
    if (selectMode) onSelect(n.id);
  };

  return (
    <div onClick={handleCardClick} style={{
      background: selected ? "#1A1A2E" : T.surface,
      border: `1px solid ${selected ? T.primary : T.border}`,
      borderLeft: `3px solid ${n.starred ? T.star : color}`,
      borderRadius: 8, padding: "11px 13px", marginBottom: 6,
      animation: isNew ? "slideIn 0.25s ease" : "none",
      transition: "border-color 0.15s, background 0.15s",
      display: "flex", gap: 11, alignItems: "flex-start",
      cursor: selectMode ? "pointer" : "default",
    }}>
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <NotifIcon rule={iconRule} color={color} size={30} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{
            color: T.textSecondary, fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em",
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          }}>
            {n.appName}
          </span>
          {n.group && (
            <Tag>{n.group}</Tag>
          )}
          <span style={{ color: T.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
            {timeMode === "relative" ? timeAgo(n.timestamp) : formatAbsolute(n.timestamp)}
          </span>

          <IconBtn onClick={(e) => { e.stopPropagation(); onStar(n.id); }} title={n.starred ? "Unstar" : "Star"}
            color={n.starred ? T.star : T.textMuted} size={17}>
            {n.starred ? "★" : "☆"}
          </IconBtn>

          <div ref={menuRef} onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
            <IconBtn onClick={() => setShowGroupMenu(v => !v)} title="Assign group"
              color={n.group ? T.primary : T.textMuted} size={15}>
              ⊞
            </IconBtn>
            {showGroupMenu && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)",
                background: T.elevated, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: 4, zIndex: 200, minWidth: 150,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
                {[null, ...groups].map(g => (
                  <div key={g ?? "__none__"}
                    onClick={() => { onGroupAssign(n.id, g); setShowGroupMenu(false); }}
                    style={{
                      padding: "7px 10px", cursor: "pointer", fontSize: 13, borderRadius: 5,
                      color: n.group === g ? T.textPrimary : T.textSecondary,
                      background: n.group === g ? T.primary : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (n.group !== g) e.currentTarget.style.background = T.border; }}
                    onMouseLeave={e => { if (n.group !== g) e.currentTarget.style.background = "none"; }}
                  >
                    {g ?? "No group"}
                  </div>
                ))}
                {groups.length === 0 && (
                  <div style={{ padding: "7px 10px", color: T.textMuted, fontSize: 12 }}>No groups yet</div>
                )}
              </div>
            )}
          </div>

          <IconBtn onClick={(e) => { e.stopPropagation(); onDelete(n.id); }} title="Delete" color={T.textMuted} size={20}>×</IconBtn>
        </div>

        {n.title && (
          <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 14.5, marginBottom: 3, lineHeight: 1.4 }}>
            {n.title}
          </div>
        )}
        {n.text && (
          <div style={{ color: T.textSecondary, fontSize: 13, lineHeight: 1.5, fontWeight: 500 }}>
            {n.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Date Divider ─────────────────────────────────────────────────────────────

function DateDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 8px" }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ color: T.textSecondary, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ connections, activeConnectionId, onConnectionsChange, onActiveChange, timeMode, onTimeModeChange, iconRules, onIconRulesChange }) {
  const [editingConn, setEditingConn]   = useState(null);
  const [editingRule, setEditingRule]   = useState(null);
  const [ruleForm, setRuleForm] = useState({ name: "", matchType: "app", matchValue: "", iconType: "emoji", iconData: "", iconShape: "circle" });
  const [connForm, setConnForm]         = useState({ name: "", url: "" });
  const fileInputRef = useRef(null);

  const startEditConn = (conn) => {
    setConnForm({ name: conn.name, url: conn.url });
    setEditingConn(conn.id);
  };

  const startNewConn = () => {
    setConnForm({ name: "", url: "ws://" });
    setEditingConn("new");
  };

  const saveConn = () => {
    if (!connForm.name.trim() || !connForm.url.trim()) return;
    if (editingConn === "new") {
      const id = `conn-${Date.now()}`;
      const updated = [...connections, { id, name: connForm.name.trim(), url: connForm.url.trim() }];
      onConnectionsChange(updated);
      if (connections.length === 0) onActiveChange(id);
    } else {
      onConnectionsChange(connections.map(c => c.id === editingConn ? { ...c, name: connForm.name.trim(), url: connForm.url.trim() } : c));
    }
    setEditingConn(null);
  };

  const deleteConn = (id) => {
    const updated = connections.filter(c => c.id !== id);
    onConnectionsChange(updated);
    if (activeConnectionId === id) onActiveChange(updated[0]?.id ?? null);
  };

  const startNewRule = () => {
    setRuleForm({ name: "", matchType: "app", matchValue: "", iconType: "emoji", iconData: "", iconShape: "circle" });
    setEditingRule("new");
  };

  const startEditRule = (rule) => {
    setRuleForm({ name: rule.name, matchType: rule.matchType, matchValue: rule.matchValue, iconType: rule.iconType, iconData: rule.iconData, iconShape: rule.iconShape ?? "circle" });
    setEditingRule(rule.id);
  };

  const saveRule = () => {
    if (!ruleForm.matchValue.trim()) return;
    if (editingRule === "new") {
      const id = `rule-${Date.now()}`;
      onIconRulesChange([...iconRules, { id, ...ruleForm, matchValue: ruleForm.matchValue.trim() }]);
    } else {
      onIconRulesChange(iconRules.map(r => r.id === editingRule ? { ...r, ...ruleForm, matchValue: ruleForm.matchValue.trim() } : r));
    }
    setEditingRule(null);
  };

  const deleteRule = (id) => onIconRulesChange(iconRules.filter(r => r.id !== id));

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      setRuleForm(f => ({ ...f, iconType: "image", iconData: data }));
    } catch { alert("Could not load image."); }
    e.target.value = "";
  };

  const formStyle = {
    background: T.elevated, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "14px 16px", marginTop: 10,
  };

  const inputStyle = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 6, padding: "7px 10px", color: T.textPrimary,
    fontSize: 13, width: "100%",
  };

  const btnPrimary = {
    background: T.primary, color: "#fff", border: "none",
    borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
  };

  const btnSecondary = {
    background: T.elevated, color: T.textSecondary,
    border: `1px solid ${T.border}`, borderRadius: 6,
    padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      <Card>
        <SectionLabel>WebSocket Connections</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {connections.map(c => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: T.elevated, borderRadius: 6, padding: "8px 12px",
              border: `1px solid ${activeConnectionId === c.id ? T.primary : T.border}`,
            }}>
              <input type="radio" checked={activeConnectionId === c.id}
                onChange={() => onActiveChange(c.id)}
                style={{ accentColor: T.primary, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: T.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.url}</div>
              </div>
              <IconBtn onClick={() => startEditConn(c)} color={T.textMuted} size={14} title="Edit">✎</IconBtn>
              <IconBtn onClick={() => deleteConn(c.id)} color={T.textMuted} size={16} title="Delete">×</IconBtn>
            </div>
          ))}

          {connections.length === 0 && (
            <div style={{ color: T.textSecondary, fontSize: 13, padding: "8px 0" }}>No connections yet. Add one below.</div>
          )}

          {editingConn !== null && (
            <div style={formStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Name</div>
                  <input style={inputStyle} value={connForm.name} onChange={e => setConnForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Home" />
                </div>
                <div>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>WebSocket URL</div>
                  <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                    value={connForm.url} onChange={e => setConnForm(f => ({ ...f, url: e.target.value }))} placeholder="ws://192.168.x.x:8080" />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button style={btnPrimary} onClick={saveConn}>Save</button>
                  <button style={btnSecondary} onClick={() => setEditingConn(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {editingConn === null && (
            <button onClick={startNewConn} style={{
              background: "none", color: T.textSecondary, border: `1px dashed ${T.border}`,
              borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, marginTop: 4, fontWeight: 500,
            }}>
              + Add connection
            </button>
          )}
        </div>
      </Card>

      <Card>
        <SectionLabel>Display</SectionLabel>
        <Toggle
          value={timeMode === "relative"}
          onChange={v => onTimeModeChange(v ? "relative" : "absolute")}
          label={timeMode === "relative" ? "Showing time since received (e.g. 5m ago)" : "Showing exact date and time"}
        />
      </Card>

      <Card>
        <SectionLabel>Notification Icons</SectionLabel>
        <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
          Assign a custom icon — an emoji or uploaded image — to notifications from a specific app or containing one or more keywords.
          Separate multiple keywords with commas; a notification matches if it contains any of them.
          Images are compressed to 64×64px and stored locally.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {iconRules.map(rule => (
            <div key={rule.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: T.elevated, borderRadius: 6, padding: "8px 12px",
              border: `1px solid ${T.border}`,
            }}>
              <NotifIcon rule={rule} color={T.textMuted} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{rule.name || rule.matchValue}</div>
                <div style={{ color: T.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  {rule.matchType === "app" ? "app: " : "keywords: "}{rule.matchValue}
                </div>
              </div>
              <IconBtn onClick={() => startEditRule(rule)} color={T.textMuted} size={14} title="Edit">✎</IconBtn>
              <IconBtn onClick={() => deleteRule(rule.id)} color={T.textMuted} size={16} title="Delete">×</IconBtn>
            </div>
          ))}

          {iconRules.length === 0 && (
            <div style={{ color: T.textSecondary, fontSize: 13, padding: "4px 0" }}>No icon rules yet.</div>
          )}
        </div>

        {editingRule !== null && (
          <div style={formStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Rule name (optional label)</div>
                <input style={inputStyle} value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Instagram, Work email…" />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Match by</div>
                  <select value={ruleForm.matchType} onChange={e => setRuleForm(f => ({ ...f, matchType: e.target.value }))}
                    style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="app">App package name</option>
                    <option value="keyword">Keyword(s) in text</option>
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>
                    {ruleForm.matchType === "app" ? "Package name (e.g. com.instagram.android)" : "Keywords (comma-separated)"}
                  </div>
                  <input style={{ ...inputStyle, fontFamily: ruleForm.matchType === "app" ? "'JetBrains Mono', monospace" : "inherit" }}
                    value={ruleForm.matchValue} onChange={e => setRuleForm(f => ({ ...f, matchValue: e.target.value }))}
                    placeholder={ruleForm.matchType === "app" ? "com.example.app" : "meeting, urgent, alert…"} />
                </div>
              </div>

              <div>
                <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 8, fontWeight: 500 }}>Icon type</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {["emoji", "image"].map(type => (
                    <button key={type} onClick={() => setRuleForm(f => ({ ...f, iconType: type, iconData: "" }))} style={{
                      background: ruleForm.iconType === type ? T.primary : T.surface,
                      color: ruleForm.iconType === type ? "#fff" : T.textSecondary,
                      border: `1px solid ${ruleForm.iconType === type ? T.primary : T.border}`,
                      borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, textTransform: "capitalize", fontWeight: 500,
                    }}>
                      {type === "emoji" ? "Emoji" : "Upload image"}
                    </button>
                  ))}
                </div>

                <div>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 8, fontWeight: 500 }}>Icon shape</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { value: "circle", label: "Circle" },
                      { value: "none",   label: "No background" },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setRuleForm(f => ({ ...f, iconShape: opt.value }))} style={{
                        background: ruleForm.iconShape === opt.value ? T.primary : T.surface,
                        color: ruleForm.iconShape === opt.value ? "#fff" : T.textSecondary,
                        border: `1px solid ${ruleForm.iconShape === opt.value ? T.primary : T.border}`,
                        borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                      }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {ruleForm.iconType === "emoji" ? (
                  <div>
                    <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Emoji</div>
                    <input style={{ ...inputStyle, fontSize: 20, width: 60, textAlign: "center" }}
                      value={ruleForm.iconData} onChange={e => setRuleForm(f => ({ ...f, iconData: e.target.value }))}
                      placeholder="📌" maxLength={2} />
                  </div>
                ) : (
                  <div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => fileInputRef.current?.click()} style={btnSecondary}>
                        {ruleForm.iconData ? "Change image" : "Choose image"}
                      </button>
                      {ruleForm.iconData && (
                        <img src={ruleForm.iconData} alt="preview" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `1px solid ${T.border}` }} />
                      )}
                      {!ruleForm.iconData && (
                        <span style={{ color: T.textSecondary, fontSize: 12 }}>No image chosen</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {(ruleForm.iconData || ruleForm.iconType === "emoji") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, borderRadius: 6, padding: "8px 12px" }}>
                  <NotifIcon rule={{ ...ruleForm, id: "preview" }} color={T.textMuted} size={28} />
                  <span style={{ color: T.textSecondary, fontSize: 12 }}>Preview</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnPrimary} onClick={saveRule}>Save rule</button>
                <button style={btnSecondary} onClick={() => setEditingRule(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {editingRule === null && (
          <button onClick={startNewRule} style={{
            background: "none", color: T.textSecondary, border: `1px dashed ${T.border}`,
            borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>
            + Add icon rule
          </button>
        )}
      </Card>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [notifications, setNotifications] = useState(() => load("nd_notifications", []));
  const [deletedIds, setDeletedIds]       = useState(() => load("nd_deleted", []));
  const deletedSetRef = useRef(new Set(load("nd_deleted", [])));
  const [newIds, setNewIds]               = useState(new Set());

  const [connections, setConnections]           = useState(() => load("nd_connections", []));
  const [activeConnectionId, setActiveConnectionId] = useState(() => load("nd_active_conn", null));
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const manualDisconnectRef = useRef(false);

  const [stats, setStats] = useState({ batteryPct: null, notifCount: null, screenTimeMs: null });

  const [timeMode, setTimeMode]     = useState(() => load("nd_timemode", "absolute"));
  const [iconRules, setIconRules]   = useState(() => load("nd_iconrules", []));

  const [activeTab, setActiveTab]     = useState("all");
  const [filter, setFilter]           = useState("All");
  const [groupFilter, setGroupFilter] = useState(null);
  const [search, setSearch]           = useState("");
  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState(new Set());
  const [groups, setGroups]           = useState(() => load("nd_groups", []));
  const [newGroupName, setNewGroupName]     = useState("");
  const [showGroupInput, setShowGroupInput] = useState(false);

  useEffect(() => { save("nd_notifications", notifications); }, [notifications]);
  useEffect(() => { save("nd_deleted", deletedIds); }, [deletedIds]);
  useEffect(() => { save("nd_groups", groups); }, [groups]);
  useEffect(() => { save("nd_connections", connections); }, [connections]);
  useEffect(() => { save("nd_active_conn", activeConnectionId); }, [activeConnectionId]);
  useEffect(() => { save("nd_timemode", timeMode); }, [timeMode]);
  useEffect(() => { save("nd_iconrules", iconRules); }, [iconRules]);

  const activeConnection = connections.find(c => c.id === activeConnectionId) ?? null;
  const DUPLICATE_WINDOW_MS = 2000;

  const mergeNotifications = (incoming) => {
    setNotifications(prev => {
      const existingIds = new Map(prev.map(n => [n.id, n]));
      const merged = [...prev];
      const brandNew = [];

      for (const n of incoming) {
        if (deletedSetRef.current.has(n.id)) continue;

        // Check for a near-duplicate: same app + title + text within a short time window
        const isDuplicate = merged.some(existing =>
          existing.packageName === n.packageName &&
          existing.title === n.title &&
          existing.text === n.text &&
          Math.abs(existing.timestamp - n.timestamp) <= DUPLICATE_WINDOW_MS
        );
        if (isDuplicate) continue;

        if (!existingIds.has(n.id)) { merged.push(n); brandNew.push(n.id); }
        else {
          const ex = existingIds.get(n.id);
          merged[merged.indexOf(ex)] = { ...n, starred: ex.starred, group: ex.group };
        }
      }
      if (brandNew.length > 0) {
        setNewIds(prev => { const s = new Set(prev); brandNew.forEach(id => s.add(id)); return s; });
        setTimeout(() => setNewIds(prev => { const s = new Set(prev); brandNew.forEach(id => s.delete(id)); return s; }), 600);
      }
      return merged.sort((a, b) => b.timestamp - a.timestamp);
    });
  };

  const scheduleReconnect = () => {
    if (manualDisconnectRef.current) return;
    const attempt = reconnectAttemptRef.current;
    let delay;
    if (attempt < MAX_BACKOFF_ATTEMPTS) {
      delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), SLOW_RETRY_MS);
      reconnectAttemptRef.current += 1;
    } else {
      delay = SLOW_RETRY_MS;
    }
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => connect(true), delay);
  };

  const connect = (isAutoRetry = false) => {
    const url = activeConnection?.url;
    if (!url) return;

    if (!isAutoRetry) {
      manualDisconnectRef.current = false;
      reconnectAttemptRef.current = 0;
      clearTimeout(reconnectTimerRef.current);
    }

    if (wsRef.current) wsRef.current.close();
    setConnecting(true);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      reconnectAttemptRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      setConnected(false);
      setConnecting(false);
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);

        if (raw.type === "stats") {
          setStats({ batteryPct: raw.batteryPct, notifCount: raw.notifCount, screenTimeMs: raw.screenTimeMs });
          return;
        }

        const combined = `${raw.title || ""} ${raw.text || ""}`.trim();
        if (!combined) return;
        if (JUNK_PREFIXES.some(p => combined.startsWith(p))) return;
        if (JUNK_PACKAGES.includes(raw.packageName)) return;
        if (!passesAppAllowlist(raw)) return;
        if (!passesAppBannedPrefixes(raw)) return;
        mergeNotifications([{ ...raw, id: generateId(raw), starred: false, group: null }]);
      } catch (e) { console.warn("Bad payload", e); }
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  if (activeConnection?.url) {
    connect(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const deleteOne = (id) => {
    const n = notifications.find(x => x.id === id);
    if (n?.starred && !window.confirm(`Delete starred notification from ${n.appName}?`)) return;
    deletedSetRef.current.add(id);
    setDeletedIds(prev => [...prev, id]);
    setNotifications(prev => prev.filter(x => x.id !== id));
  };

  const deleteSelected = () => {
    const hasStarred = notifications.some(n => selected.has(n.id) && n.starred);
    if (hasStarred && !window.confirm(`Some selected notifications are starred. Delete all ${selected.size}?`)) return;
    selected.forEach(id => deletedSetRef.current.add(id));
    setDeletedIds(prev => [...prev, ...selected]);
    setNotifications(prev => prev.filter(n => !selected.has(n.id)));
    setSelected(new Set()); setSelectMode(false);
  };

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleStar   = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, starred: !n.starred } : n));
  const assignGroup  = (id, group) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, group } : n));

  const addGroup = () => {
    const name = newGroupName.trim();
    if (name && !groups.includes(name)) setGroups(prev => [...prev, name]);
    setNewGroupName(""); setShowGroupInput(false);
  };

  const deleteGroup = (name) => {
    setGroups(prev => prev.filter(g => g !== name));
    setNotifications(prev => prev.map(n => n.group === name ? { ...n, group: null } : n));
    if (groupFilter === name) setGroupFilter(null);
  };

  const appNames = ["All", ...new Set(notifications.map(n => n.appName))];

  const filtered = notifications.filter(n => {
    if (activeTab === "all" && (n.starred || n.group)) return false;
    if (activeTab === "starred" && !n.starred) return false;
    if (activeTab === "groups") {
      if (groupFilter ? n.group !== groupFilter : !n.group) return false;
    }
    if (activeTab === "settings") return false;
    if (filter !== "All" && n.appName !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![n.title, n.text, n.appName].some(f => f?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const grouped = [];
  let lastDate = null;
  for (const n of filtered) {
    const label = formatDate(n.timestamp);
    if (label !== lastDate) { grouped.push({ type: "divider", label }); lastDate = label; }
    grouped.push({ type: "notification", n });
  }

  const statusColor = connected ? "#34D399" : connecting ? "#FBBF24" : T.danger;

  const TABS = [
    { id: "all",      label: "All",      count: notifications.filter(n => !n.starred && !n.group).length },
    { id: "starred",  label: "Starred",  count: notifications.filter(n => n.starred).length },
    { id: "groups",   label: "Groups",   count: null },
    { id: "settings", label: "Settings", count: null },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.textMuted, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, button, select { font-family: inherit; }
        input:focus, select:focus { outline: none; }
        select { appearance: none; }
        ::-webkit-scrollbar { width: 9px; height: 10px; }
        ::-webkit-scrollbar-track { background: ${T.elevated}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: ${T.textSecondary}; border-radius: 10px; border: 2px solid ${T.elevated}; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.textPrimary}; }
        * { scrollbar-width: auto; scrollbar-color: ${T.textSecondary} ${T.elevated}; }
      `}</style>

      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: `${T.bg}EE`, backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${T.border}`,
        padding: "0 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, height: 52, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", flexShrink: 0, color: T.textPrimary }}>Notify</span>

          <Tag color={statusColor} bg={statusColor + "1A"}>
            <Dot color={statusColor} size={5} />
            {activeConnection ? activeConnection.name : "No connection"}
          </Tag>

          {connected && stats.batteryPct !== null && (
            <BatteryBar pct={stats.batteryPct} />
          )}
          {connected && stats.screenTimeMs !== null && stats.screenTimeMs >= 0 && (
            <Tag>📱 {formatDuration(stats.screenTimeMs)}</Tag>
          )}
          {connected && stats.notifCount !== null && (
            <Tag>🔔 {stats.notifCount} today</Tag>
          )}

          <div style={{ flex: 1 }} />

          <button onClick={() => connect(false)} disabled={!activeConnection} style={{
            background: connected ? T.elevated : T.primary,
            color: connected ? T.textSecondary : "#fff",
            border: `1px solid ${connected ? T.border : T.primary}`,
            borderRadius: 6, padding: "6px 16px", cursor: activeConnection ? "pointer" : "default",
            fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", opacity: activeConnection ? 1 : 0.4,
          }}>
            {connecting ? "Connecting…" : connected ? "Reconnect" : "Connect"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${T.border}` }}>
          {TABS.map(tab => (
            <button key={tab.id}
              onClick={() => { setActiveTab(tab.id); setGroupFilter(null); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: activeTab === tab.id ? T.textPrimary : T.textSecondary,
                fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
                padding: "9px 16px",
                borderBottom: `2px solid ${activeTab === tab.id ? T.primary : "transparent"}`,
                transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
              }}>
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span style={{
                  background: activeTab === tab.id ? T.primary : T.elevated,
                  color: activeTab === tab.id ? "#fff" : T.textSecondary,
                  fontSize: 10, fontWeight: 700, borderRadius: 10,
                  padding: "1px 6px", fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 24px", maxWidth: 900, margin: "0 auto" }}>

        {activeTab === "settings" ? (
          <SettingsPanel
            connections={connections}
            activeConnectionId={activeConnectionId}
            onConnectionsChange={setConnections}
            onActiveChange={setActiveConnectionId}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
            iconRules={iconRules}
            onIconRulesChange={setIconRules}
          />
        ) : (
          <>
            {activeTab === "groups" && (
              <Card style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: T.textSecondary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'JetBrains Mono', monospace", marginRight: 4 }}>
                    Groups
                  </span>
                  <Pill active={!groupFilter} onClick={() => setGroupFilter(null)}>All</Pill>
                  {groups.map(g => (
                    <div key={g} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Pill active={groupFilter === g} onClick={() => setGroupFilter(g)}>{g}</Pill>
                      <IconBtn onClick={() => deleteGroup(g)} color={T.textMuted} size={14}>×</IconBtn>
                    </div>
                  ))}
                  {showGroupInput ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input autoFocus value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addGroup(); if (e.key === "Escape") setShowGroupInput(false); }}
                        placeholder="Group name"
                        style={{ background: T.elevated, border: `1px solid ${T.primary}`, borderRadius: 6, padding: "5px 10px", color: T.textPrimary, fontSize: 13, width: 130 }}
                      />
                      <button onClick={addGroup} style={{ background: T.primary, color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Add</button>
                      <button onClick={() => setShowGroupInput(false)} style={{ background: T.elevated, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowGroupInput(true)} style={{ background: "none", color: T.textSecondary, border: `1px dashed ${T.border}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                      + New group
                    </button>
                  )}
                </div>
              </Card>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textSecondary, fontSize: 14, pointerEvents: "none" }}>⌕</span>
                <input placeholder="Search notifications…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px 8px 30px", color: T.textPrimary, fontSize: 13 }}
                />
              </div>
              <button onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }} style={{
                background: selectMode ? T.primary : T.surface,
                color: selectMode ? "#fff" : T.textSecondary,
                border: `1px solid ${selectMode ? T.primary : T.border}`,
                borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}>
                {selectMode ? "Cancel" : "Select"}
              </button>
            </div>

            {appNames.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {appNames.map(name => (
                  <Pill key={name} active={filter === name} onClick={() => setFilter(name)}>{name}</Pill>
                ))}
              </div>
            )}

            {selectMode && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: T.textSecondary, fontSize: 13, flex: 1, fontWeight: 500 }}>{selected.size} selected</span>
                <button onClick={() => setSelected(new Set(filtered.map(n => n.id)))} style={{ background: T.elevated, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                  Select all
                </button>
                <button onClick={deleteSelected} disabled={selected.size === 0} style={{ background: selected.size > 0 ? T.danger : T.elevated, color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: selected.size > 0 ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>
                  Delete {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
              </div>
            )}

            {grouped.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSecondary, marginTop: 80 }}>
                <div style={{ fontSize: 32, marginBottom: 14, opacity: 0.35 }}>
                  {activeTab === "starred" ? "★" : activeTab === "groups" ? "⊞" : "○"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>
                  {activeTab === "starred" ? "No starred notifications"
                    : activeTab === "groups" ? (groups.length === 0 ? "No groups created" : "No notifications in this group")
                    : connected ? "Waiting for notifications" : "Not connected"}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
                  {activeTab === "starred" ? "Star a notification to pin it here permanently."
                    : activeTab === "groups" ? "Create a group above, then assign notifications to it using ⊞."
                    : connected ? "Notifications will appear here in real time."
                    : "Add a connection in Settings and click Connect."}
                </div>
              </div>
            ) : (
              grouped.map(item =>
                item.type === "divider"
                  ? <DateDivider key={`d-${item.label}`} label={item.label} />
                  : <NotificationCard
                      key={item.n.id}
                      notification={item.n}
                      onDelete={deleteOne}
                      onStar={toggleStar}
                      onGroupAssign={assignGroup}
                      groups={groups}
                      selected={selected.has(item.n.id)}
                      onSelect={toggleSelect}
                      selectMode={selectMode}
                      isNew={newIds.has(item.n.id)}
                      timeMode={timeMode}
                      iconRules={iconRules}
                    />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}