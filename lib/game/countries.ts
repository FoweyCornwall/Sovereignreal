// Static list of real-world countries for the Country Setup picker (Flow 1).
// A representative ~100-country set is sufficient for MVP; expand later if
// a fuller ISO 3166-1 list is wanted - no schema change needed either way.

export function isoToFlagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65)))
    .join("");
}

export interface RealWorldCountry {
  name: string;
  iso2: string;
  flagEmoji: string;
}

const ISO_CODES: [string, string][] = [
  ["Afghanistan", "AF"], ["Argentina", "AR"], ["Australia", "AU"], ["Austria", "AT"],
  ["Bangladesh", "BD"], ["Belgium", "BE"], ["Bolivia", "BO"], ["Brazil", "BR"],
  ["Canada", "CA"], ["Chile", "CL"], ["China", "CN"], ["Colombia", "CO"],
  ["Croatia", "HR"], ["Cuba", "CU"], ["Czechia", "CZ"], ["Denmark", "DK"],
  ["Ecuador", "EC"], ["Egypt", "EG"], ["Estonia", "EE"], ["Ethiopia", "ET"],
  ["Finland", "FI"], ["France", "FR"], ["Germany", "DE"], ["Ghana", "GH"],
  ["Greece", "GR"], ["Hungary", "HU"], ["Iceland", "IS"], ["India", "IN"],
  ["Indonesia", "ID"], ["Iran", "IR"], ["Iraq", "IQ"], ["Ireland", "IE"],
  ["Israel", "IL"], ["Italy", "IT"], ["Jamaica", "JM"], ["Japan", "JP"],
  ["Jordan", "JO"], ["Kazakhstan", "KZ"], ["Kenya", "KE"], ["South Korea", "KR"],
  ["Kuwait", "KW"], ["Latvia", "LV"], ["Lebanon", "LB"], ["Lithuania", "LT"],
  ["Malaysia", "MY"], ["Mexico", "MX"], ["Mongolia", "MN"], ["Morocco", "MA"],
  ["Nepal", "NP"], ["Netherlands", "NL"], ["New Zealand", "NZ"], ["Nigeria", "NG"],
  ["Norway", "NO"], ["Pakistan", "PK"], ["Panama", "PA"], ["Peru", "PE"],
  ["Philippines", "PH"], ["Poland", "PL"], ["Portugal", "PT"], ["Qatar", "QA"],
  ["Romania", "RO"], ["Russia", "RU"], ["Saudi Arabia", "SA"], ["Senegal", "SN"],
  ["Serbia", "RS"], ["Singapore", "SG"], ["Slovakia", "SK"], ["Slovenia", "SI"],
  ["South Africa", "ZA"], ["Spain", "ES"], ["Sri Lanka", "LK"], ["Sweden", "SE"],
  ["Switzerland", "CH"], ["Taiwan", "TW"], ["Tanzania", "TZ"], ["Thailand", "TH"],
  ["Tunisia", "TN"], ["Turkey", "TR"], ["Uganda", "UG"], ["Ukraine", "UA"],
  ["United Arab Emirates", "AE"], ["United Kingdom", "GB"], ["United States", "US"],
  ["Uruguay", "UY"], ["Venezuela", "VE"], ["Vietnam", "VN"], ["Zambia", "ZM"],
  ["Zimbabwe", "ZW"], ["Algeria", "DZ"], ["Angola", "AO"], ["Belarus", "BY"],
  ["Bulgaria", "BG"], ["Cambodia", "KH"], ["Cameroon", "CM"], ["Costa Rica", "CR"],
  ["Cyprus", "CY"], ["Dominican Republic", "DO"], ["El Salvador", "SV"],
  ["Fiji", "FJ"], ["Georgia", "GE"], ["Guatemala", "GT"], ["Honduras", "HN"],
  ["Luxembourg", "LU"], ["Malta", "MT"], ["Moldova", "MD"], ["Myanmar", "MM"],
];

export const REAL_WORLD_COUNTRIES: RealWorldCountry[] = ISO_CODES.map(
  ([name, iso2]) => ({ name, iso2, flagEmoji: isoToFlagEmoji(iso2) })
).sort((a, b) => a.name.localeCompare(b.name));

// Curated flag-emoji set offered for custom countries as a lightweight
// alternative to designing a flag from scratch.
export const CUSTOM_FLAG_EMOJI_CHOICES = [
  "🏴", "🏳️", "🚩", "🎌", "🏴‍☠️", "⭐", "🌟", "🔶", "🔷", "🔺",
  "🔻", "⚜️", "🦅", "🦁", "🐉", "⚓", "🗼", "🏔️", "🌊", "☀️",
];

export const CUSTOM_FLAG_COLOR_CHOICES = [
  "#1e3a8a", "#991b1b", "#166534", "#78350f", "#581c87",
  "#0f172a", "#b91c1c", "#065f46", "#92400e", "#312e81",
];
