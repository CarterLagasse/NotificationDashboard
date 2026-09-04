import { useState, useEffect, useRef } from "react";
import { T } from "./theme";
import { load, save, generateId, formatDate, formatDuration } from "./utils";
import {
  JUNK_PREFIXES, JUNK_PACKAGES,
  passesAppAllowlist, passesAppBannedExact, passesAppBannedPrefixes, passesJunkHeaderKeywords,
} from "./filters";
import { Dot, Tag, IconBtn, Pill, BatteryBar, StatSkeleton, Card } from "./components/Primitives";
import { NotificationCard, DateDivider } from "./components/Notifications";
import { DEFAULT_WIDGETS, normalizeWidgets, WidgetGrid } from "./components/Widgets";
import SettingsPanel from "./components/Settingspanel";

const MAX_BACKOFF_ATTEMPTS = 6;
const BASE_DELAY_MS = 2000;
const SLOW_RETRY_MS = 60000;

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
  const [showConnMenu, setShowConnMenu] = useState(false);
  const connMenuRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const manualDisconnectRef = useRef(false);

  const [stats, setStats] = useState({ batteryPct: null, notifCount: null, screenTimeMs: null });

  const [timeMode, setTimeMode]     = useState(() => load("nd_timemode", "absolute"));
  const [iconRules, setIconRules]   = useState(() => load("nd_iconrules", []));
  const [teamWidgets, setTeamWidgets] = useState(() => normalizeWidgets(load("nd_teamwidgets", DEFAULT_WIDGETS)));

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
  useEffect(() => { save("nd_teamwidgets", teamWidgets); }, [teamWidgets]);

  useEffect(() => {
    if (!showConnMenu) return;
    const h = (e) => { if (connMenuRef.current && !connMenuRef.current.contains(e.target)) setShowConnMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showConnMenu]);

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
    setStats({ batteryPct: null, notifCount: null, screenTimeMs: null });
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
        if (!passesAppBannedExact(raw)) return;
        if (!passesJunkHeaderKeywords(raw)) return;
        mergeNotifications([{ ...raw, id: generateId(raw), starred: false, group: null }]);
      } catch (e) { console.warn("Bad payload", e); }
    };

    wsRef.current = ws;
  };

  // Switch the active connection and immediately reconnect to it.
  const switchConnection = (id) => {
    setShowConnMenu(false);
    if (id === activeConnectionId) return;
    setActiveConnectionId(id);
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
  }, [activeConnectionId]);

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

  const statusColor = connected ? T.success : connecting ? T.star : T.danger;

  const TABS = [
    { id: "all",      label: "All",      count: notifications.filter(n => !n.starred && !n.group).length },
    { id: "starred",  label: "Starred",  count: notifications.filter(n => n.starred).length },
    { id: "groups",   label: "Groups",   count: null },
    { id: "settings", label: "Settings", count: null },
  ];

  const handleWidgetLayoutChange = (id, layout) => {
    setTeamWidgets(prev => prev.map(w => w.id === id ? { ...w, layout } : w));
  };

  const activeTeamWidgets = teamWidgets.filter(w => w.enabled !== false);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.textMuted, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseRing {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes shimmer {
          0%   { opacity: 0.35; }
          50%  { opacity: 0.75; }
          100% { opacity: 0.35; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, button, select { font-family: inherit; }
        input:focus, select:focus { outline: none; border-color: ${T.primary} !important; }
        select { appearance: none; }
        ::-webkit-scrollbar { width: 9px; height: 10px; }
        ::-webkit-scrollbar-track { background: ${T.elevated}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: ${T.textSecondary}; border-radius: 10px; border: 2px solid ${T.elevated}; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.textPrimary}; }
        * { scrollbar-width: auto; scrollbar-color: ${T.textSecondary} ${T.elevated}; }
      `}</style>

      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: `${T.bg}F2`, backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${T.border}`,
        padding: "0 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, height: 56, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", flexShrink: 0, color: T.textPrimary }}>Notify</span>

          <div ref={connMenuRef} style={{ position: "relative" }}>
            <div onClick={() => setShowConnMenu(v => !v)} style={{ cursor: "pointer" }}>
              <Tag color={statusColor} bg={statusColor + "1A"}>
                <Dot color={statusColor} size={6} pulse={connected} />
                {activeConnection ? activeConnection.name : "No connection"}
                <span style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
              </Tag>
            </div>
            {showConnMenu && (
              <div style={{
                position: "absolute", left: 0, top: "calc(100% + 6px)",
                background: T.elevated, border: `1px solid ${T.borderStrong}`,
                borderRadius: 10, padding: 4, zIndex: 200, minWidth: 180,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
                {connections.map(c => (
                  <div key={c.id}
                    onClick={() => switchConnection(c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", cursor: "pointer", fontSize: 13, borderRadius: 7,
                      color: c.id === activeConnectionId ? T.textPrimary : T.textSecondary,
                      background: c.id === activeConnectionId ? T.primary : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (c.id !== activeConnectionId) e.currentTarget.style.background = T.border; }}
                    onMouseLeave={e => { if (c.id !== activeConnectionId) e.currentTarget.style.background = "none"; }}
                  >
                    {c.name}
                  </div>
                ))}
                {connections.length === 0 && (
                  <div style={{ padding: "8px 10px", color: T.textMuted, fontSize: 12 }}>No connections set up</div>
                )}
              </div>
            )}
          </div>

          {connected && (
            stats.batteryPct !== null
              ? <BatteryBar pct={stats.batteryPct} />
              : <StatSkeleton width={66} />
          )}
          {connected && (
            stats.screenTimeMs !== null && stats.screenTimeMs >= 0
              ? <Tag>📱 {formatDuration(stats.screenTimeMs)}</Tag>
              : <StatSkeleton width={70} />
          )}
          {connected && (
            stats.notifCount !== null
              ? <Tag>🔔 {stats.notifCount} today</Tag>
              : <StatSkeleton width={84} />
          )}

          <div style={{ flex: 1 }} />

          <button onClick={() => connect(false)} disabled={!activeConnection} style={{
            background: connected ? T.elevated : T.primary,
            color: connected ? T.textSecondary : "#fff",
            border: `1px solid ${connected ? T.border : T.primary}`,
            borderRadius: 7, padding: "7px 17px", cursor: activeConnection ? "pointer" : "default",
            fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", opacity: activeConnection ? 1 : 0.4,
            boxShadow: connected ? "none" : `0 2px 8px ${T.primary}44`,
            transition: "background 0.15s, box-shadow 0.15s",
          }}>
            {connecting ? "Connecting…" : connected ? "Reconnect" : "Connect"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 2, borderTop: `1px solid ${T.border}` }}>
          {TABS.map(tab => (
            <button key={tab.id}
              onClick={() => { setActiveTab(tab.id); setGroupFilter(null); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: activeTab === tab.id ? T.textPrimary : T.textSecondary,
                fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
                padding: "10px 16px",
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

      <div style={{ padding: "18px 24px", maxWidth: 1760, margin: "0 auto", display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0, maxWidth: 1200 }}>

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
            teamWidgets={teamWidgets}
            onTeamWidgetsChange={setTeamWidgets}
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
                        style={{ background: T.elevated, border: `1px solid ${T.primary}`, borderRadius: 7, padding: "6px 10px", color: T.textPrimary, fontSize: 13, width: 130 }}
                      />
                      <button onClick={addGroup} style={{ background: T.primary, color: "#fff", border: "none", borderRadius: 7, padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Add</button>
                      <button onClick={() => setShowGroupInput(false)} style={{ background: T.elevated, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowGroupInput(true)} style={{ background: "none", color: T.textSecondary, border: `1px dashed ${T.borderStrong}`, borderRadius: 7, padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                      + New group
                    </button>
                  )}
                </div>
              </Card>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: T.textSecondary, fontSize: 14, pointerEvents: "none" }}>⌕</span>
                <input placeholder="Search notifications…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px 9px 32px", color: T.textPrimary, fontSize: 13, transition: "border-color 0.15s" }}
                />
              </div>
              <button onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }} style={{
                background: selectMode ? T.primary : T.surface,
                color: selectMode ? "#fff" : T.textSecondary,
                border: `1px solid ${selectMode ? T.primary : T.border}`,
                borderRadius: 8, padding: "9px 15px", cursor: "pointer", fontSize: 13, fontWeight: 600,
                transition: "all 0.15s",
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
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: T.textSecondary, fontSize: 13, flex: 1, fontWeight: 500 }}>{selected.size} selected</span>
                <button onClick={() => setSelected(new Set(filtered.map(n => n.id)))} style={{ background: T.elevated, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                  Select all
                </button>
                <button onClick={deleteSelected} disabled={selected.size === 0} style={{ background: selected.size > 0 ? T.danger : T.elevated, color: "#fff", border: "none", borderRadius: 7, padding: "6px 13px", cursor: selected.size > 0 ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>
                  Delete {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
              </div>
            )}

            {grouped.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSecondary, marginTop: 80 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", background: T.elevated,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, margin: "0 auto 16px", color: T.textMuted,
                }}>
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

      {activeTab !== "settings" && teamWidgets.length > 0 && (
        <div style={{
          flexShrink: 0,
          position: "sticky", top: 82, maxHeight: "calc(100vh - 100px)", overflowY: "auto", overflowX: "hidden",
          paddingRight: 2,
        }}>
          <WidgetGrid widgets={teamWidgets} onLayoutChange={handleWidgetLayoutChange} />
        </div>
      )}
      </div>
    </div>
  );
}