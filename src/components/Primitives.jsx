import { useState } from "react";
import { T } from "../theme";

// ─── Primitive UI components ────────────────────────────────────────────
// Small shared atoms used across notifications, widgets, and settings.

function Dot({ color, size = 8, pulse = false }) {
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-block" }}>
      {pulse && (
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%", background: color,
          animation: "pulseRing 1.6s ease-out infinite",
        }} />
      )}
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
    </span>
  );
}

function Tag({ children, color = T.textSecondary, bg = T.elevated }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: bg, color, fontSize: 11, fontWeight: 700,
      borderRadius: 5, padding: "3px 8px", letterSpacing: "0.04em",
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
        background: hov ? T.elevatedHover : "none", border: "none", cursor: "pointer",
        color: hov ? T.textPrimary : color, fontSize: size, padding: "3px 6px", lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6, transition: "background 0.12s, color 0.12s",
      }}>
      {children}
    </button>
  );
}

function Pill({ children, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: active ? T.primary : (hov ? T.elevatedHover : T.elevated),
        color: active ? "#fff" : T.textSecondary,
        border: `1px solid ${active ? T.primary : T.border}`,
        borderRadius: 7, padding: "6px 13px", cursor: "pointer",
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
        width: 38, height: 22, borderRadius: 11,
        background: value ? T.primary : T.elevated,
        border: `1px solid ${value ? T.primary : T.borderStrong}`,
        position: "relative", transition: "background 0.2s, border-color 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }} />
      </div>
      {label && <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 500 }}>{label}</span>}
    </label>
  );
}

function BatteryBar({ pct }) {
  const color = pct > 50 ? T.success : pct > 20 ? T.star : T.danger;
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

function StatSkeleton({ width = 60 }) {
  return (
    <div style={{
      width, height: 22, borderRadius: 6,
      background: T.elevated, border: `1px solid ${T.border}`,
      animation: "shimmer 1.3s ease-in-out infinite",
    }} />
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
      borderRadius: 10, padding: "14px 16px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.24)",
      ...style,
    }}>
      {children}
    </div>
  );
}


export { Dot, Tag, IconBtn, Pill, Toggle, BatteryBar, StatSkeleton, SectionLabel, Card };