// ─── Cleaning + blocking ─────────────────────────────────────────────────
// All notification filtering lives here: hard-blocked packages/keywords,
// per-app allowlists, and the "passes*" predicates the WebSocket handler
// runs every incoming notification through before it's ever added to state.

const JUNK_PREFIXES = [
  "Make sure your device is connected to the Internet.",
];

// Per-app keyword filters for notification TITLES only (not the body).
const JUNK_HEADER_KEYWORDS = {
  // "com.instagram.android": ["liked your", "started following you"],
  // "com.google.android.gm": ["promo", "sale"],
};

const JUNK_PACKAGES = [
  "com.android.deskclock",
  "com.sec.android.app.clockpackage",
  "com.sec.android.app.camera",
  "com.sec.android.gallery3d",
  "com.android.systemui",
  "com.samsung.android.app.smartcapture",
  "com.android.system",
  "com.google.android.apps.maps",
  "com.microsoft.appmanager",
  "com.sec.android.app.samsungapps",
];

// Apps that are muted by default — notifications from these packages are
// dropped UNLESS the title or text starts with one of the listed prefixes.
const APP_ALLOWLIST_FILTERS = {
  // "com.android.dialer":            ["Missed call"],
};

const APP_BANNED_EXACT = {
  "com.textra": ["Sent"],
};

const APP_BANNED_PREFIXES = {
  "com.samsung.android.incallui":      ["Call"],
  "com.android.systemui":              ["Flashlight turned on", "Charging started (", "Charging (", "Edge lighting", "Charge your phone."],
  "com.google.android.apps.paidtasks": ["Turning on Location History", "Want more surveys? Finish", "New survey available", "Tap to answer survey"],
  "android":                           ["Private DNS", "An open", "If you don’t want SOSApp to use this feature, t"],
  "com.android.systemui":              ["If you don’t want SOSApp to use this feature, t"],
  "com.google.android.apps.maps":      ["From "],
  "com.sec.android.app.samsungapps":   ["1 update available"],
  "com.samsung.android.forest":        ["Turn down the volume"], // check to make sure this is the right package
};

function passesAppAllowlist(n) {
  const allowedPrefixes = APP_ALLOWLIST_FILTERS[n.packageName];
  if (!allowedPrefixes || allowedPrefixes.length === 0) return true; // no restriction for this app
  const title = n.title || "";
  const text = n.text || "";
  return allowedPrefixes.some(p => title.startsWith(p) || text.startsWith(p));

}

function passesAppBannedExact(n) {
  const bannedExact = APP_BANNED_EXACT[n.packageName];
  if (!bannedExact || bannedExact.length === 0) return true; // no exact-match bans for this app
  const title = n.title || "";
  const text = n.text || "";
  return !bannedExact.some(m => title === m || text === m);
}

function passesAppBannedPrefixes(n) {
  const bannedPrefixes = APP_BANNED_PREFIXES[n.packageName];
  if (!bannedPrefixes || bannedPrefixes.length === 0) return true; // no bans for this app
  const title = n.title || "";
  const text = n.text || "";
  return !bannedPrefixes.some(p => title.startsWith(p) || text.startsWith(p));
}

// Drops notifications whose TITLE (header) contains any junk keyword for that app.
function passesJunkHeaderKeywords(n) {
  const keywords = JUNK_HEADER_KEYWORDS[n.packageName];
  if (!keywords || keywords.length === 0) return true;
  const title = (n.title || "").toLowerCase();
  if (!title) return true;
  return !keywords.some(k => title.includes(k.toLowerCase()));
}

export {
  JUNK_PREFIXES, JUNK_HEADER_KEYWORDS, JUNK_PACKAGES,
  APP_ALLOWLIST_FILTERS, APP_BANNED_EXACT, APP_BANNED_PREFIXES,
  passesAppAllowlist, passesAppBannedExact, passesAppBannedPrefixes, passesJunkHeaderKeywords,
};