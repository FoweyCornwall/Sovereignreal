"use client";

import { ShieldTile } from "@/components/pvp/ShieldTile";
import type { MatchSectorReveal } from "@/lib/actions/pvpMatch";
import type { Sector } from "@/lib/game/constants";

export function SiegeRing({
  sectors,
  mySide,
  flashSector,
  flashKey,
  selectable,
  onSectorClick,
}: {
  sectors: MatchSectorReveal[];
  mySide: "a" | "b";
  flashSector: string | null;
  flashKey: number;
  selectable?: boolean;
  onSectorClick?: (sector: Sector) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {sectors.map((s) => {
        const myScore = s.revealed ? (mySide === "a" ? s.sideAScore : s.sideBScore) : null;
        const opponentScore = s.revealed ? (mySide === "a" ? s.sideBScore : s.sideAScore) : null;
        const iWon = s.revealed && s.winnerSide ? s.winnerSide === mySide : null;
        return (
          <ShieldTile
            key={s.sector}
            sector={s.sector}
            revealed={s.revealed}
            myScore={myScore}
            opponentScore={opponentScore}
            iWon={iWon}
            flashKey={flashSector === s.sector ? flashKey : 0}
            selectable={selectable && !s.revealed}
            onSelect={() => onSectorClick?.(s.sector)}
          />
        );
      })}
    </div>
  );
}
