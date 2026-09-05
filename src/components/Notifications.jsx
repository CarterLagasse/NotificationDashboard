import { useState, useEffect, useRef, useMemo, memo } from "react";
import { T, getAppColor, APP_CLICK_LINKS } from "../theme";
import { timeAgo, formatAbsolute, parseKeywords } from "../utils";
import { Dot, Tag, IconBtn } from "./Primitives";

// ─── Notification section ───────────────────────────────────────────────
// Icon resolution, the notification card itself, and the date divider used
// to group the list by day.

// ─── Notification Icon ──────────────────────────────────────────────────
function NotifIcon({ rule, color, size = 32 }) {
  if (!rule) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: color + "22", border: `1.5px solid ${color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Dot color={color} size={8} />
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
        borderRadius: isCircle ? "50%" : 6,
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

// Finds the first icon rule (from Settings) that matches a notification,
// either by exact app package or by keyword found in its title/text.
//
// `parsedKeywordRules` is an optional precomputed list of
// { rule, keywords } pairs (keywords already split via parseKeywords) so
// callers rendering many notifications against the same rule set don't pay
// the string-split cost of parseKeywords() on every single card, every
// render. Falls back to parsing inline if it isn't provided.
function resolveIcon(n, iconRules, parsedKeywordRules) {
  for (const rule of iconRules) {
    if (rule.matchType === "app" && rule.matchValue === n.packageName) return rule;
  }
  const text = `${n.appName} ${n.title || ""} ${n.text || ""}`.toLowerCase();
  if (parsedKeywordRules) {
    for (const { rule, keywords } of parsedKeywordRules) {
      if (keywords.some(k => text.includes(k))) return rule;
    }
    return null;
  }
  for (const rule of iconRules) {
    if (rule.matchType === "keyword") {
      const keywords = parseKeywords(rule.matchValue);
      if (keywords.some(k => text.includes(k))) return rule;
    }
  }
  return null;
}

// Precomputes { rule, keywords } for every keyword-type rule. Call once at
// the list level (memoized on iconRules) and pass the result down to each
// NotificationCard via the parsedKeywordRules prop so the split only runs
// when the rule set actually changes, not on every card/every render.
function useParsedKeywordRules(iconRules) {
  return useMemo(
    () => iconRules
      .filter(r => r.matchType === "keyword")
      .map(rule => ({ rule, keywords: parseKeywords(rule.matchValue) })),
    [iconRules]
  );
}

// ─── Notification Card ──────────────────────────────────────────────────
const NotificationCard = memo(function NotificationCard({ notification: n, onDelete, onStar, onGroupAssign, groups, selected, onSelect, selectMode, isNew, timeMode, iconRules, parsedKeywordRules }) {
  const color = getAppColor(n.packageName);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const menuRef = useRef(null);
  const cardRef = useRef(null);
  const clickLink = APP_CLICK_LINKS[n.packageName];

  // Only recompute the matched icon rule when something that could actually
  // change the match result changes — not on every unrelated re-render
  // (e.g. sibling cards' hover state, selection toggles elsewhere in the list).
  const iconRule = useMemo(
    () => resolveIcon(n, iconRules, parsedKeywordRules),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.packageName, n.title, n.text, n.appName, iconRules, parsedKeywordRules]
  );

  useEffect(() => {
    if (!showGroupMenu) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowGroupMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showGroupMenu]);

  const handleCardClick = () => {
    if (selectMode) { onSelect(n.id); return; }
    if (clickLink) window.open(clickLink, "_blank", "noopener,noreferrer");
  };

  // Hover is handled via direct style mutation instead of useState so that
  // mouse movement over the list doesn't trigger a React re-render per card
  // (matches the pattern already used for row hover in SettingsPanel).
  const handleMouseEnter = () => {
    if (cardRef.current && !selected) {
      cardRef.current.style.background = T.surfaceHover;
      cardRef.current.style.boxShadow = "0 2px 8px rgba(0,0,0,0.28)";
    }
  };
  const handleMouseLeave = () => {
    if (cardRef.current && !selected) {
      cardRef.current.style.background = T.surface;
      cardRef.current.style.boxShadow = "0 1px 2px rgba(0,0,0,0.16)";
    }
  };

  return (
    <div ref={cardRef} onClick={handleCardClick}
      onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
      style={{
        background: selected ? T.primarySoft : T.surface,
        border: `1px solid ${selected ? T.primary : T.border}`,
        borderLeft: `3px solid ${n.starred ? T.star : color}`,
        borderRadius: 10, padding: "12px 14px", marginBottom: 7,
        animation: isNew ? "slideIn 0.25s ease" : "none",
        transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.16)",
        display: "flex", gap: 12, alignItems: "flex-start",
        cursor: selectMode || clickLink ? "pointer" : "default",
      }}>
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <NotifIcon rule={iconRule} color={color} size={30} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
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
          <span style={{ color: T.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
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
                background: T.elevated, border: `1px solid ${T.borderStrong}`,
                borderRadius: 10, padding: 4, zIndex: 200, minWidth: 150,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
                {[null, ...groups].map(g => (
                  <div key={g ?? "__none__"}
                    onClick={() => { onGroupAssign(n.id, g); setShowGroupMenu(false); }}
                    style={{
                      padding: "7px 10px", cursor: "pointer", fontSize: 13, borderRadius: 6,
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
});


// ─── Date Divider ────────────────────────────────────────────────────────
function DateDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 9px" }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

export { NotifIcon, resolveIcon, useParsedKeywordRules, NotificationCard, DateDivider };