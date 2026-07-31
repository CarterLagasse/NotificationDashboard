import { useState, useRef } from "react";
import { T } from "../theme";
import { compressImage } from "../utils";
import { Card, SectionLabel, Toggle, IconBtn } from "./Primitives";
import { NotifIcon } from "./Notifications";
import { findFreePosition } from "./Widgets";

// ─── Settings Panel ──────────────────────────────────────────────────────
// WebSocket connections, display prefs, score widget management, and
// per-app/keyword notification icon rules.

function SettingsPanel({ connections, activeConnectionId, onConnectionsChange, onActiveChange, timeMode, onTimeModeChange, iconRules, onIconRulesChange, teamWidgets, onTeamWidgetsChange }) {
  const [editingConn, setEditingConn]   = useState(null);
  const [editingRule, setEditingRule]   = useState(null);
  const [ruleForm, setRuleForm] = useState({ name: "", matchType: "app", matchValue: "", iconType: "emoji", iconData: "", iconShape: "circle" });
  const [connForm, setConnForm]         = useState({ name: "", url: "" });
  const [editingWidget, setEditingWidget] = useState(null);
  const [widgetForm, setWidgetForm] = useState({ name: "", sport: "baseball", league: "mlb", abbreviation: "", showWildCard: true });
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

  const startEditWidget = (w) => {
    setWidgetForm({ name: w.name, sport: w.sport, league: w.league, abbreviation: w.abbreviation, showWildCard: w.showWildCard !== false });
    setEditingWidget(w.id);
  };

  const startNewWidget = () => {
    setWidgetForm({ name: "", sport: "baseball", league: "mlb", abbreviation: "", showWildCard: true });
    setEditingWidget("new");
  };

  const saveWidget = () => {
    const name = widgetForm.name.trim();
    const sport = widgetForm.sport.trim().toLowerCase();
    const league = widgetForm.league.trim().toLowerCase();
    const abbreviation = widgetForm.abbreviation.trim().toUpperCase();
    if (!name || !sport || !league || !abbreviation) return;

    if (editingWidget === "new") {
      const id = `widget-${Date.now()}`;
      const others = teamWidgets.filter(w => w.enabled !== false).map(w => ({ id: w.id, layout: w.layout }));
      const layout = findFreePosition(others, 4, 10);
      onTeamWidgetsChange([...teamWidgets, { id, name, sport, league, abbreviation, showWildCard: widgetForm.showWildCard, enabled: true, layout }]);
    } else {
      onTeamWidgetsChange(teamWidgets.map(w => w.id === editingWidget ? { ...w, name, sport, league, abbreviation, showWildCard: widgetForm.showWildCard } : w));
    }
    setEditingWidget(null);
  };

  const deleteWidget = (id) => onTeamWidgetsChange(teamWidgets.filter(w => w.id !== id));

  const toggleWidgetEnabled = (id, value) =>
    onTeamWidgetsChange(teamWidgets.map(w => w.id === id ? { ...w, enabled: value } : w));

  const formStyle = {
    background: T.elevated, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: "14px 16px", marginTop: 10,
  };

  const inputStyle = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 7, padding: "8px 10px", color: T.textPrimary,
    fontSize: 13, width: "100%", transition: "border-color 0.15s",
  };

  const btnPrimary = {
    background: T.primary, color: "#fff", border: "none",
    borderRadius: 7, padding: "8px 15px", cursor: "pointer", fontSize: 13, fontWeight: 600,
    boxShadow: "0 1px 2px rgba(0,0,0,0.3)", transition: "background 0.15s",
  };

  const btnSecondary = {
    background: T.elevated, color: T.textSecondary,
    border: `1px solid ${T.border}`, borderRadius: 7,
    padding: "8px 15px", cursor: "pointer", fontSize: 13, fontWeight: 500,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      <Card>
        <SectionLabel>WebSocket Connections</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {connections.map(c => (
            <div key={c.id} onClick={() => startEditConn(c)} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: T.elevated, borderRadius: 8, padding: "9px 12px",
              border: `1px solid ${activeConnectionId === c.id ? T.primary : T.border}`,
              cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { if (activeConnectionId !== c.id) e.currentTarget.style.background = T.elevatedHover; }}
            onMouseLeave={e => { if (activeConnectionId !== c.id) e.currentTarget.style.background = T.elevated; }}
            >
              <input type="radio" checked={activeConnectionId === c.id}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onActiveChange(c.id)}
                style={{ accentColor: T.primary, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: T.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.url}</div>
              </div>
              <IconBtn onClick={(e) => { e.stopPropagation(); startEditConn(c); }} color={T.textMuted} size={14} title="Edit">✎</IconBtn>
              <IconBtn onClick={(e) => { e.stopPropagation(); deleteConn(c.id); }} color={T.textMuted} size={16} title="Delete">×</IconBtn>
            </div>
          ))}

          {connections.length === 0 && (
            <div style={{ color: T.textSecondary, fontSize: 13, padding: "8px 0" }}>No connections yet. Add one below.</div>
          )}

          {editingConn !== null && (
            <div style={formStyle} onClick={(e) => e.stopPropagation()}>
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
              background: "none", color: T.textSecondary, border: `1px dashed ${T.borderStrong}`,
              borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, marginTop: 4, fontWeight: 500,
              transition: "color 0.15s, border-color 0.15s",
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
        <SectionLabel>Score Widgets</SectionLabel>
        <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
          Choose which teams show up as score cards in the sidebar. Position and size are set directly on the
          dashboard — drag the ⠿ handle to move a widget, or drag its bottom-right corner to resize it; it'll
          snap into the grid and won't drop onto another widget.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 8 }}>
          {teamWidgets.map((w) => (
            <div key={w.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: T.elevated, borderRadius: 8, padding: "9px 12px",
                border: `1px solid ${T.border}`,
                opacity: w.enabled === false ? 0.55 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <Toggle value={w.enabled !== false} onChange={v => toggleWidgetEnabled(w.id, v)} />
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => startEditWidget(w)}>
                <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                <div style={{ color: T.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  {w.sport} / {w.league} / {w.abbreviation}
                </div>
              </div>
              <IconBtn onClick={() => startEditWidget(w)} color={T.textMuted} size={14} title="Edit">✎</IconBtn>
              <IconBtn onClick={() => deleteWidget(w.id)} color={T.textMuted} size={16} title="Delete">×</IconBtn>
            </div>
          ))}

          {teamWidgets.length === 0 && (
            <div style={{ color: T.textSecondary, fontSize: 13, padding: "4px 0" }}>No widgets added yet.</div>
          )}
        </div>

        {editingWidget !== null && (
          <div style={formStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Display name</div>
                <input style={inputStyle} value={widgetForm.name} onChange={e => setWidgetForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Red Sox" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Sport</div>
                  <input style={inputStyle} value={widgetForm.sport} onChange={e => setWidgetForm(f => ({ ...f, sport: e.target.value }))} placeholder="baseball" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>League</div>
                  <input style={inputStyle} value={widgetForm.league} onChange={e => setWidgetForm(f => ({ ...f, league: e.target.value }))} placeholder="mlb" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Team abbr</div>
                  <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                    value={widgetForm.abbreviation}
                    onChange={e => setWidgetForm(f => ({ ...f, abbreviation: e.target.value }))}
                    placeholder="BOS" />
                </div>
              </div>
              <Toggle value={widgetForm.showWildCard} onChange={v => setWidgetForm(f => ({ ...f, showWildCard: v }))} label="Show wild card standings" />
              {editingWidget === "new" && (
                <div style={{ color: T.textMuted, fontSize: 11.5 }}>
                  It'll be placed in the first open spot on the dashboard — drag it wherever you like after adding.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button style={btnPrimary} onClick={saveWidget}>Save</button>
                <button style={btnSecondary} onClick={() => setEditingWidget(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {editingWidget === null && (
          <button onClick={startNewWidget} style={{
            background: "none", color: T.textSecondary, border: `1px dashed ${T.borderStrong}`,
            borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>
            + Add widget
          </button>
        )}
      </Card>

      <Card>
        <SectionLabel>Notification Icons</SectionLabel>
        <div style={{ color: T.textSecondary, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
          Assign a custom icon — an emoji or uploaded image — to notifications from a specific app or containing one or more keywords.
          Separate multiple keywords with commas; a notification matches if it contains any of them.
          Images are compressed to 64×64px and stored locally.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 8 }}>
          {iconRules.map(rule => (
            <div key={rule.id} onClick={() => startEditRule(rule)} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: T.elevated, borderRadius: 8, padding: "9px 12px",
              border: `1px solid ${T.border}`,
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.elevatedHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.elevated; }}
            >
              <NotifIcon rule={rule} color={T.textMuted} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>{rule.name || rule.matchValue}</div>
                <div style={{ color: T.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  {rule.matchType === "app" ? "app: " : "keywords: "}{rule.matchValue}
                </div>
              </div>
              <IconBtn onClick={(e) => { e.stopPropagation(); startEditRule(rule); }} color={T.textMuted} size={14} title="Edit">✎</IconBtn>
              <IconBtn onClick={(e) => { e.stopPropagation(); deleteRule(rule.id); }} color={T.textMuted} size={16} title="Delete">×</IconBtn>
            </div>
          ))}

          {iconRules.length === 0 && (
            <div style={{ color: T.textSecondary, fontSize: 13, padding: "4px 0" }}>No icon rules yet.</div>
          )}
        </div>

        {editingRule !== null && (
          <div style={formStyle} onClick={(e) => e.stopPropagation()}>
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
                      borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, textTransform: "capitalize", fontWeight: 500,
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
                        borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, borderRadius: 8, padding: "8px 12px" }}>
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
            background: "none", color: T.textSecondary, border: `1px dashed ${T.borderStrong}`,
            borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>
            + Add icon rule
          </button>
        )}
      </Card>
    </div>
  );
}

export default SettingsPanel;