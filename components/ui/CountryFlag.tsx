import * as Flags from "country-flag-icons/react/3x2";

type FlagComponent = (props: { className?: string; title?: string }) => React.JSX.Element;
const FLAGS = Flags as unknown as Record<string, FlagComponent>;

export function CountryFlag({
  countryCode,
  flagEmoji,
  flagStyle,
  name,
  size = "sm",
}: {
  countryCode?: string | null;
  flagEmoji?: string | null;
  flagStyle?: { bg: string } | null;
  name: string;
  size?: "sm" | "md";
}) {
  const dimensions = size === "md" ? "h-6 w-8" : "h-4 w-6";
  const FlagComponent = countryCode ? FLAGS[countryCode.toUpperCase()] : undefined;

  if (FlagComponent) {
    return (
      <span className={`inline-flex ${dimensions} shrink-0 overflow-hidden rounded-sm shadow-sm`}>
        <FlagComponent className="h-full w-full object-cover" title={name} />
      </span>
    );
  }

  // Custom (non-real-world) countries have no real flag - fall back to the
  // emoji/color they picked at setup.
  return (
    <span
      className={`inline-flex ${dimensions} shrink-0 items-center justify-center rounded-sm text-xs leading-none`}
      style={{ backgroundColor: flagStyle?.bg }}
      title={name}
    >
      {flagEmoji ?? "🏳️"}
    </span>
  );
}
