import { getRarityInfo } from "@/lib/game/mutations";
import type { SectorMutation } from "@/lib/types/game";

export function MutationBadge({ mutation }: { mutation: SectorMutation }) {
  const info = getRarityInfo(mutation.rarity);
  const isIridescent = info.color === "iridescent";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color: isIridescent ? "#000" : info.color,
        backgroundColor: isIridescent
          ? undefined
          : `color-mix(in srgb, ${info.color} 22%, transparent)`,
        border: isIridescent
          ? undefined
          : `1px solid color-mix(in srgb, ${info.color} 45%, transparent)`,
        backgroundImage: isIridescent
          ? "linear-gradient(90deg, #ff9a9e, #fad0c4, #a18cd1, #fbc2eb, #8fd3f4)"
          : undefined,
      }}
      title={`${info.label} mutation`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: isIridescent ? undefined : info.color,
          backgroundImage: isIridescent
            ? "linear-gradient(90deg, #ff9a9e, #a18cd1, #8fd3f4)"
            : undefined,
        }}
      />
      ×{mutation.multiplier}
    </span>
  );
}
