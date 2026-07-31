import { useState, useEffect } from "react";
import { T } from "../theme";
import { Dot, Card, SectionLabel } from "./Primitives";

// ─── Widget section ──────────────────────────────────────────────────────
// Score widgets: grid config, layout/geometry helpers, standings math,
// the individual team card, and the drag-to-move/drag-to-resize grid.

// ─── Widget grid config ──────────────────────────────────────────────────
const GRID_COLS = 8;
const GRID_GAP = 10;
const CELL_W = 87;   // px per column unit
const ROW_H = 30;    // px per row unit
const MIN_W = 3;
const MIN_H = 6;
const CONTAINER_W = GRID_COLS * CELL_W + (GRID_COLS - 1) * GRID_GAP;

// Default set of score widgets. User-editable from Settings > Score Widgets
// from here on — this is only the seed value used the very first time.
const DEFAULT_TEAM_WIDGETS = [
  { id: "widget-bos", sport: "baseball", league: "mlb", abbreviation: "BOS", name: "Red Sox", showWildCard: true, enabled: true, layout: { x: 0, y: 0, w: 8, h: 18 } },
];
const TEAM_REFRESH_MS = 60000;

// ─── Widget grid geometry helpers ────────────────────────────────────────
function normalizeLayout(layout) {
  const w = Math.max(MIN_W, Math.min(GRID_COLS, Math.round(layout?.w ?? 4)));
  const h = Math.max(MIN_H, Math.round(layout?.h ?? 10));
  const x = Math.max(0, Math.min(GRID_COLS - w, Math.round(layout?.x ?? 0)));
  const y = Math.max(0, Math.round(layout?.y ?? 0));
  return { x, y, w, h };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isFreeSpot(candidate, others, ignoreId) {
  if (candidate.x < 0 || candidate.y < 0 || candidate.x + candidate.w > GRID_COLS) return false;
  return !others.some(o => o.id !== ignoreId && rectsOverlap(candidate, o.layout));
}

// Scans row-by-row/col-by-col for the first free spot big enough for w×h.
function findFreePosition(others, w, h) {
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      const candidate = { x, y, w, h };
      if (isFreeSpot(candidate, others, null)) return candidate;
    }
  }
  return { x: 0, y: 0, w, h };
}

// Ensures every widget has a valid, non-overlapping layout. Widgets missing a
// layout (e.g. from an older save format) are auto-placed into free space.
function normalizeWidgets(widgets) {
  const placed = [];
  for (const w of widgets) {
    let layout = w.layout ? normalizeLayout(w.layout) : null;
    if (!layout || placed.some(p => p.id !== w.id && rectsOverlap(layout, p.layout))) {
      layout = findFreePosition(placed, layout?.w ?? 4, layout?.h ?? 10);
    }
    placed.push({ ...w, layout });
  }
  return placed;
}

function gridToPx(layout) {
  return {
    left: layout.x * (CELL_W + GRID_GAP),
    top: layout.y * (ROW_H + GRID_GAP),
    width: layout.w * CELL_W + (layout.w - 1) * GRID_GAP,
    height: layout.h * ROW_H + (layout.h - 1) * GRID_GAP,
  };
}


// ─── Team Score Card ─────────────────────────────────────────────────────
function LeaderRow({ label, leader }) {
  if (!leader) return null;
  const athlete = leader.athlete;
  if (!athlete) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
      <span style={{
        width: 30, flexShrink: 0, fontSize: 10, fontWeight: 700, color: T.textMuted,
        fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.03em",
      }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary, flexShrink: 0 }}>
        {athlete.shortName || athlete.displayName}
      </span>
      <span style={{
        fontSize: 11.5, color: T.textSecondary, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
      }}>
        {leader.displayValue}
      </span>
    </div>
  );
}

// ESPN's standings endpoint only splits entries by league (AL/NL) — there is
// no division-level grouping in the response, and its gamesBehind stat is
// league-wide, not division-relative. So division membership is looked up
// here, and GB is recomputed locally from wins/losses.
const TEAM_DIVISIONS = {
  BAL: "AL East", BOS: "AL East", NYY: "AL East", TB: "AL East", TOR: "AL East",
  CWS: "AL Central", CHW: "AL Central", CLE: "AL Central", DET: "AL Central", KC: "AL Central", KCR: "AL Central", MIN: "AL Central",
  HOU: "AL West", LAA: "AL West", ATH: "AL West", OAK: "AL West", SEA: "AL West", TEX: "AL West",
  ATL: "NL East", MIA: "NL East", NYM: "NL East", PHI: "NL East", WSH: "NL East",
  CHC: "NL Central", CIN: "NL Central", MIL: "NL Central", PIT: "NL Central", STL: "NL Central",
  ARI: "NL West", COL: "NL West", LAD: "NL West", SD: "NL West", SF: "NL West",
};

// Pulls a stat value off a standings entry by trying several possible stat names.
function findStat(entry, names) {
  const stat = entry?.stats?.find(s => names.includes(s.name) || names.includes(s.type) || names.includes(s.shortDisplayName));
  if (!stat) return null;
  return { value: typeof stat.value === "number" ? stat.value : parseFloat(stat.value), display: stat.displayValue };
}

// Walks the standings tree and collects every leaf node that has entries
// (i.e. an actual list of teams), regardless of what level ESPN nests it at.
// Division membership is no longer inferred from this structure — see
// TEAM_DIVISIONS — so this just needs to surface every team exactly once.
function collectStandingsLeaves(node, leaves = []) {
  if (!node) return leaves;

  if (node.children && node.children.length) {
    node.children.forEach(child => collectStandingsLeaves(child, leaves));
    return leaves;
  }

  const entries = node.standings?.entries || node.entries;
  if (entries && entries.length) {
    leaves.push({ entries });
  }
  return leaves;
}

function normalizeEntry(entry) {
  const wins = findStat(entry, ["wins"])?.value ?? null;
  const losses = findStat(entry, ["losses"])?.value ?? null;
  const pct = findStat(entry, ["winPercent", "winPercentage"])?.value
    ?? (wins != null && losses != null && (wins + losses) > 0 ? wins / (wins + losses) : null);
  return {
    abbr: entry.team?.abbreviation,
    displayName: entry.team?.shortDisplayName || entry.team?.displayName || entry.team?.abbreviation,
    logo: entry.team?.logos?.[0]?.href,
    wins, losses, pct,
    gb: findStat(entry, ["gamesBehind"])?.display ?? "–",
    streak: findStat(entry, ["streak"])?.display ?? "–",
    l10: findStat(entry, ["lastTen"])?.display ?? "–",
    home: findStat(entry, ["home"])?.display ?? "–",
    road: findStat(entry, ["road", "away"])?.display ?? "–",
    diff: findStat(entry, ["differential", "runDifferential", "pointDifferential"])?.display ?? "–",
  };
}

function withGamesBehind(rows) {
  const sorted = [...rows].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const leader = sorted[0];
  return sorted.map(r => {
    if (!leader || r.abbr === leader.abbr || leader.wins == null || r.wins == null) {
      return { ...r, gb: r.abbr === leader?.abbr ? "–" : r.gb };
    }
    const gb = ((leader.wins - r.wins) + (r.losses - leader.losses)) / 2;
    return { ...r, gb: gb === 0 ? "–" : gb.toFixed(1) };
  });
}

// Given the league-wide normalized entry list, work out the wild-card race:
// exclude each division's leader (per TEAM_DIVISIONS), rank everyone else by
// win%, keep the top group.
function computeWildCard(leagueEntries) {
  const divisionLeaders = {};
  leagueEntries.forEach(e => {
    const div = TEAM_DIVISIONS[e.abbr];
    if (!div) return;
    if (!divisionLeaders[div] || (e.pct ?? 0) > (divisionLeaders[div].pct ?? 0)) divisionLeaders[div] = e;
  });
  const leaderAbbrs = new Set(Object.values(divisionLeaders).map(e => e.abbr));
  const contenders = leagueEntries
    .filter(e => !leaderAbbrs.has(e.abbr))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 5);
  if (contenders.length === 0) return contenders;
  const lead = contenders[0];
  return contenders.map((c, i) => {
    if (i === 0 || lead.wins == null || c.wins == null) return { ...c, wcGb: i === 0 ? "–" : c.gb };
    const gb = ((lead.wins - c.wins) + (c.losses - lead.losses)) / 2;
    return { ...c, wcGb: gb === 0 ? "–" : gb.toFixed(1) };
  });
}

function formatGameTime(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const datePart = isToday ? "Today" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function TeamCard({ sport, league, abbreviation, name, showWildCard = true, contentLevel = "standard" }) {
  const [game, setGame]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [failed, setFailed]     = useState(false);
  const [upcoming, setUpcoming] = useState([]);
  const [division, setDivision] = useState(null);
  const [wildCard, setWildCard] = useState(null);
  const [standingsFailed, setStandingsFailed] = useState(false);
  const [divisionName, setDivisionName] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadScoreboard = async () => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`);
        const data = await res.json();
        const events = data.events || [];
        const match = events.find(ev =>
          ev.competitions?.[0]?.competitors?.some(c => c.team?.abbreviation === abbreviation)
        );
        if (!cancelled) { setGame(match || null); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loadSchedule = async () => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${abbreviation.toLowerCase()}/schedule`);
        const data = await res.json();
        const events = data.events || [];
        const next = events
          .filter(ev => (ev.competitions?.[0]?.status?.type?.state || "pre") === "pre")
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 4)
          .map(ev => {
            const comp = ev.competitions?.[0];
            const away = comp?.competitors?.find(c => c.homeAway === "away");
            const home = comp?.competitors?.find(c => c.homeAway === "home");
            const isHome = home?.team?.abbreviation === abbreviation;
            const opponent = isHome ? away : home;
            const tracked = isHome ? home : away;
            const probable = tracked?.probables?.[0]?.athlete?.shortName
              || tracked?.probables?.[0]?.athlete?.displayName
              || null;
            return {
              id: ev.id,
              date: ev.date,
              isHome,
              opponentName: opponent?.team?.shortDisplayName || opponent?.team?.abbreviation || "TBD",
              opponentLogo: opponent?.team?.logo,
              probable,
            };
          });
        if (!cancelled) setUpcoming(next);
      } catch {
        if (!cancelled) setUpcoming([]);
      }
    };

    const loadStandings = async () => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings`);
        const data = await res.json();
        const leaves = collectStandingsLeaves(data);
        const allEntries = leaves.flatMap(leaf => leaf.entries).map(normalizeEntry);

        const myDivision = TEAM_DIVISIONS[abbreviation];
        const myLeague = myDivision ? myDivision.split(" ")[0] : null; // "AL" or "NL"

        const leagueEntries = myLeague
          ? allEntries.filter(e => TEAM_DIVISIONS[e.abbr]?.startsWith(myLeague))
          : allEntries;

        const divisionRows = myDivision
          ? withGamesBehind(leagueEntries.filter(e => TEAM_DIVISIONS[e.abbr] === myDivision))
          : [];

        const wc = myLeague ? computeWildCard(leagueEntries) : [];

        if (!cancelled) {
          setDivision(divisionRows.length ? divisionRows : null);
          setDivisionName(myDivision);
          setWildCard(wc.length ? wc : null);
          setStandingsFailed(false);
        }
      } catch {
        if (!cancelled) setStandingsFailed(true);
      }
    };

    loadScoreboard();
    loadSchedule();
    loadStandings();
    const id = setInterval(() => { loadScoreboard(); loadSchedule(); loadStandings(); }, TEAM_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [sport, league, abbreviation]);

  const comp   = game?.competitions?.[0];
  const away   = comp?.competitors?.find(c => c.homeAway === "away");
  const home   = comp?.competitors?.find(c => c.homeAway === "home");
  const status = comp?.status?.type || {};
  const isLive = status.state === "in";
  const isPre  = status.state === "pre";
  const trackedTeam = [away, home].find(c => c?.team?.abbreviation === abbreviation);
  const accent = trackedTeam?.team?.color ? `#${trackedTeam.team.color}` : T.primary;

  const recordOf = (c) => c?.records?.find(r => r.type === "total")?.summary;
  const innings = Math.max(away?.linescores?.length || 0, home?.linescores?.length || 0, 9);

  const TeamRow = ({ c }) => {
    const isTracked = c.team?.abbreviation === abbreviation;
    const record = recordOf(c);
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {c.team?.logo && <img src={c.team.logo} alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, fontWeight: isTracked ? 700 : 500,
              color: isTracked ? T.textPrimary : T.textSecondary,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {c.team?.shortDisplayName || c.team?.abbreviation}
            </div>
            {record && (
              <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                {record}
              </div>
            )}
          </div>
        </div>
        <span style={{
          fontSize: 17, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
          color: isTracked ? T.textPrimary : T.textSecondary, flexShrink: 0, marginLeft: 8,
        }}>
          {c.score ?? "–"}
        </span>
      </div>
    );
  };

  // Per-inning box score (R across innings, plus totals R/H/E).
  const BoxScore = () => {
    if (!away || !home) return null;
    const cell = { flex: "0 0 auto", width: 18, textAlign: "center", fontFamily: "'JetBrains Mono', monospace" };
    const HeaderRow = () => (
      <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
        <div style={{ width: 34, flexShrink: 0 }} />
        {Array.from({ length: innings }).map((_, i) => (
          <div key={i} style={{ ...cell, fontSize: 9.5, color: T.textMuted }}>{i + 1}</div>
        ))}
        <div style={{ ...cell, width: 20, fontSize: 9.5, fontWeight: 700, color: T.textSecondary }}>R</div>
        <div style={{ ...cell, width: 20, fontSize: 9.5, fontWeight: 700, color: T.textSecondary }}>H</div>
        <div style={{ ...cell, width: 20, fontSize: 9.5, fontWeight: 700, color: T.textSecondary }}>E</div>
      </div>
    );
    const Row = ({ c }) => {
      const isTracked = c.team?.abbreviation === abbreviation;
      return (
        <div style={{ display: "flex", gap: 3, alignItems: "center", padding: "1px 0" }}>
          <div style={{
            width: 34, flexShrink: 0, fontSize: 10.5, fontWeight: isTracked ? 700 : 500,
            color: isTracked ? T.textPrimary : T.textSecondary,
          }}>
            {c.team?.abbreviation}
          </div>
          {Array.from({ length: innings }).map((_, i) => (
            <div key={i} style={{ ...cell, fontSize: 10.5, color: T.textSecondary }}>
              {c.linescores?.[i]?.displayValue ?? "–"}
            </div>
          ))}
          <div style={{ ...cell, width: 20, fontSize: 10.5, fontWeight: 700, color: T.textPrimary }}>{c.score ?? "–"}</div>
          <div style={{ ...cell, width: 20, fontSize: 10.5, color: T.textSecondary }}>{c.hits ?? "–"}</div>
          <div style={{ ...cell, width: 20, fontSize: 10.5, color: T.textSecondary }}>{c.errors ?? "–"}</div>
        </div>
      );
    };
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}`, overflowX: "auto" }}>
        <HeaderRow />
        <Row c={away} />
        <Row c={home} />
      </div>
    );
  };

  // Stat leaders for the tracked team specifically (AVG / HR / RBI).
  const Leaders = () => {
    const leadersArr = trackedTeam?.leaders;
    if (!leadersArr || leadersArr.length === 0) return null;
    const pick = (statName) => leadersArr.find(l => l.name === statName)?.leaders?.[0];
    const avg = pick("avg");
    const hr  = pick("homeRuns");
    const rbi = pick("RBIs");
    if (!avg && !hr && !rbi) return null;
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Top performers
        </div>
        <LeaderRow label="AVG" leader={avg} />
        <LeaderRow label="HR"  leader={hr} />
        <LeaderRow label="RBI" leader={rbi} />
      </div>
    );
  };

  // Probable starting pitcher (shown before first pitch).
  const ProbablePitcher = () => {
    if (!isPre) return null;
    const probable = trackedTeam?.probables?.[0];
    if (!probable?.athlete) return null;
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Probable starter
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary }}>
            {probable.athlete.shortName || probable.athlete.displayName}
          </span>
          {probable.record && (
            <span style={{ fontSize: 11.5, color: T.textSecondary }}>{probable.record}</span>
          )}
        </div>
      </div>
    );
  };

  // Next several scheduled games, each with opponent + probable starter when known.
  const UpcomingGames = () => {
    if (upcoming.length === 0) return null;
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Upcoming games
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {upcoming.map(g => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {g.opponentLogo && <img src={g.opponentLogo} alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.isHome ? "vs" : "@"} {g.opponentName}
                </div>
                <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatGameTime(g.date)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, textAlign: "right", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.probable || "TBD"}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Compact standings table shared by the division and wild-card sections.
  const StandingsTable = ({ rows, gbKey, highlightAbbr }) => (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 4, padding: "2px 0 3px", fontSize: 9.5, fontWeight: 700, color: T.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>
        <div style={{ flex: 1 }}>Team</div>
        <div style={{ width: 26, textAlign: "center" }}>W</div>
        <div style={{ width: 26, textAlign: "center" }}>L</div>
        <div style={{ width: 32, textAlign: "center" }}>GB</div>
        <div style={{ width: 40, textAlign: "center" }}>Strk</div>
        <div style={{ width: 38, textAlign: "center" }}>L10</div>
      </div>
      {rows.map(r => (
        <div key={r.abbr} style={{
          display: "flex", gap: 4, alignItems: "center", padding: "3px 0",
          background: r.abbr === highlightAbbr ? T.primarySoft : "transparent",
          borderRadius: 5,
        }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            {r.logo && <img src={r.logo} alt="" style={{ width: 15, height: 15, flexShrink: 0 }} />}
            <span style={{
              fontSize: 11.5, fontWeight: r.abbr === highlightAbbr ? 700 : 500,
              color: r.abbr === highlightAbbr ? T.textPrimary : T.textSecondary,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {r.abbr}
            </span>
          </div>
          <div style={{ width: 26, textAlign: "center", fontSize: 11.5, color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{r.wins ?? "–"}</div>
          <div style={{ width: 26, textAlign: "center", fontSize: 11.5, color: T.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{r.losses ?? "–"}</div>
          <div style={{ width: 32, textAlign: "center", fontSize: 11.5, color: T.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{r[gbKey]}</div>
          <div style={{ width: 40, textAlign: "center", fontSize: 11, color: T.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{r.streak}</div>
          <div style={{ width: 38, textAlign: "center", fontSize: 11, color: T.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{r.l10}</div>
        </div>
      ))}
    </div>
  );

  const Standings = () => {
    if (standingsFailed || (!division && !(showWildCard && wildCard))) return null;
    const leagueAbbr = divisionName ? divisionName.split(" ")[0] : "";
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
        {division && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {divisionName}
            </div>
            <StandingsTable rows={division} gbKey="gb" highlightAbbr={abbreviation} />
          </>
        )}
        {showWildCard && wildCard && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 8 }}>
              {leagueAbbr} Wild Card
            </div>
            <StandingsTable rows={wildCard} gbKey="wcGb" highlightAbbr={abbreviation} />
          </>
        )}
      </div>
    );
  };

  let body;
  if (loading) {
    body = <div style={{ color: T.textSecondary, fontSize: 13 }}>Loading…</div>;
  } else if (failed) {
    body = <div style={{ color: T.textSecondary, fontSize: 13 }}>Couldn't load scores.</div>;
  } else if (!game) {
    body = <div style={{ color: T.textSecondary, fontSize: 13 }}>No game today.</div>;
  } else {
    body = (
      <>
        {away && <TeamRow c={away} />}
        {home && <TeamRow c={home} />}
        <div style={{
          marginTop: 6, display: "flex", alignItems: "center", gap: 6,
          color: isLive ? T.success : T.textSecondary, fontSize: 11, fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {isLive && <Dot color={T.success} size={6} pulse />}
          {status.shortDetail || status.detail || "—"}
        </div>
      </>
    );
  }

  return (
    <Card style={{ borderTop: `2px solid ${accent}`, borderTopLeftRadius: 10, borderTopRightRadius: 10, padding: "16px 18px", height: "100%", overflowY: "auto" }}>
      <SectionLabel>{name}</SectionLabel>
      {body}
      {contentLevel !== "compact" && !loading && !failed && game && <BoxScore />}
      {contentLevel !== "compact" && !loading && !failed && game && <ProbablePitcher />}
      {contentLevel !== "compact" && !loading && !failed && game && <Leaders />}
      {contentLevel === "full" && <UpcomingGames />}
      {contentLevel === "full" && <Standings />}
    </Card>
  );
}

// ─── Widget Grid (drag-to-move / drag-to-resize) ───────────────────────────

function WidgetGrid({ widgets, onLayoutChange }) {
  const [dragState, setDragState] = useState(null); // { id, mode, startClientX, startClientY, startLayout, candidate, blocked }

  const enabled = widgets.filter(w => w.enabled !== false);
  const maxY = Math.max(10, ...enabled.map(w => {
    const layout = (dragState && dragState.id === w.id) ? dragState.candidate : w.layout;
    return layout.y + layout.h;
  }));
  const containerHeight = maxY * ROW_H + (maxY - 1) * GRID_GAP;

  const startDrag = (e, widget, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      id: widget.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLayout: { ...widget.layout },
      candidate: { ...widget.layout },
      blocked: false,
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e) => {
      setDragState(prev => {
        if (!prev) return prev;
        const dxPx = e.clientX - prev.startClientX;
        const dyPx = e.clientY - prev.startClientY;
        const dx = Math.round(dxPx / (CELL_W + GRID_GAP));
        const dy = Math.round(dyPx / (ROW_H + GRID_GAP));

        let candidate;
        if (prev.mode === "move") {
          const x = Math.max(0, Math.min(GRID_COLS - prev.startLayout.w, prev.startLayout.x + dx));
          const y = Math.max(0, prev.startLayout.y + dy);
          candidate = { ...prev.startLayout, x, y };
        } else {
          const w = Math.max(MIN_W, Math.min(GRID_COLS - prev.startLayout.x, prev.startLayout.w + dx));
          const h = Math.max(MIN_H, prev.startLayout.h + dy);
          candidate = { ...prev.startLayout, w, h };
        }

        const others = enabled.map(w => ({ id: w.id, layout: w.layout }));
        const blocked = !isFreeSpot(candidate, others, prev.id);
        return { ...prev, candidate, blocked };
      });
    };

    const handleUp = () => {
      setDragState(prev => {
        if (prev && !prev.blocked) onLayoutChange(prev.id, prev.candidate);
        return null;
      });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, onLayoutChange]);

  return (
    <div style={{
      position: "relative",
      width: CONTAINER_W,
      height: containerHeight,
      backgroundImage: dragState
        ? `linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`
        : "none",
      backgroundSize: `${CELL_W + GRID_GAP}px ${ROW_H + GRID_GAP}px`,
      transition: "height 0.15s",
    }}>
      {enabled.map(w => {
        const isDragging = dragState && dragState.id === w.id;
        const layout = isDragging ? dragState.candidate : w.layout;
        const px = gridToPx(layout);
        const contentLevel = layout.h >= 16 && layout.w >= 4 ? "full" : layout.h >= 9 ? "standard" : "compact";

        return (
          <div key={w.id} style={{
            position: "absolute",
            left: px.left, top: px.top, width: px.width, height: px.height,
            zIndex: isDragging ? 50 : 1,
            transition: isDragging ? "none" : "left 0.15s, top 0.15s, width 0.15s, height 0.15s",
          }}>
            <div style={{
              position: "relative", width: "100%", height: "100%",
              outline: isDragging ? `2px solid ${dragState.blocked ? T.danger : T.primary}` : "none",
              outlineOffset: 2, borderRadius: 12,
              opacity: isDragging && dragState.blocked ? 0.7 : 1,
            }}>
              <TeamCard
                sport={w.sport} league={w.league} abbreviation={w.abbreviation}
                name={w.name} showWildCard={w.showWildCard !== false}
                contentLevel={contentLevel}
              />

              {/* Drag handle — move the widget */}
              <div
                onPointerDown={(e) => startDrag(e, w, "move")}
                title="Drag to move"
                style={{
                  position: "absolute", top: 8, right: 8, width: 22, height: 22,
                  borderRadius: 6, background: T.elevated, border: `1px solid ${T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.textMuted, fontSize: 13, cursor: "grab", userSelect: "none",
                  touchAction: "none",
                }}
              >
                ⠿
              </div>

              {/* Resize handle — bottom-right corner */}
              <div
                onPointerDown={(e) => startDrag(e, w, "resize")}
                title="Drag to resize"
                style={{
                  position: "absolute", right: 2, bottom: 2, width: 18, height: 18,
                  cursor: "nwse-resize", touchAction: "none",
                  borderRight: `2px solid ${T.borderStrong}`, borderBottom: `2px solid ${T.borderStrong}`,
                  borderBottomRightRadius: 8,
                }}
              />
            </div>
          </div>
        );
      })}

      {enabled.length === 0 && (
        <div style={{ color: T.textSecondary, fontSize: 13, padding: "20px 0" }}>
          No widgets enabled. Add one from Settings → Score Widgets.
        </div>
      )}
    </div>
  );
}

export {
  GRID_COLS, GRID_GAP, CELL_W, ROW_H, MIN_W, MIN_H, CONTAINER_W,
  DEFAULT_TEAM_WIDGETS, TEAM_REFRESH_MS,
  normalizeLayout, rectsOverlap, isFreeSpot, findFreePosition, normalizeWidgets, gridToPx,
  TeamCard, WidgetGrid,
};