// Design tokens and app-specific colors/links shared across the whole app.

const T = {
  bg:            "#08080D",
  surface:       "#12121B",
  surfaceHover:  "#16161F",
  elevated:      "#1B1B28",
  elevatedHover: "#232332",
  border:        "#232333",
  borderStrong:  "#33334A",
  primary:       "#6366F1",
  primaryHover:  "#7476F3",
  primarySoft:   "#6366F11F",
  star:          "#FBBF24",
  danger:        "#F43F5E",
  dangerSoft:    "#F43F5E1F",
  success:       "#34D399",
  textPrimary:   "#F5F5FA",
  textSecondary: "#9C9CB8",
  textMuted:     "#54546C",
};

const APP_COLORS = {
  "com.instagram.android":             "#E1306C",
  "com.google.android.gm":             "#EA4335",
  "com.whatsapp":                      "#25D366",
  "com.facebook.katana":               "#1877F2",
  "com.discord":                       "#5865F2",
  "com.textra":                        "#1A73E8",
  "com.linkedin.android":              "#559bf6",
};

// Apps that open a specific URL (in a new tab) when their notification card is clicked.
const APP_CLICK_LINKS = {
  "com.instagram.android": "https://www.instagram.com/direct/inbox/",
  "com.google.android.gm": "https://www.gmail.com",
  "com.linkedin.android": "https://www.linkedin.com",
};

function getAppColor(packageName) {
  return APP_COLORS[packageName] || T.textMuted;
}

export { T, APP_COLORS, APP_CLICK_LINKS, getAppColor };