"use client";

import { ShieldTile } from "@/components/pvp/ShieldTile";
import type { MatchSectorState } from "@/lib/actions/pvpMatch";
import type { Sector } from "@/lib/game/constants";

export interface FlashTarget {
  side: "mine" | "opponent";
  sector: Sector;
  outcome: "hit" | "miss";
  key: number;
}

export function SiegeRing({
  mySectors,
  opponentSectors,
  canAttack,
  onAttack,
  flashTarget,
  shakeKey,
}: {
  mySectors: MatchSectorState[];
  opponentSectors: MatchSectorState[];
  canAttack: boolean;
  onAttack: (sector: Sector) => void;
  flashTarget: FlashTarget | null;
  shakeKey: number;
}) {
  return (
    <div key={shakeKey > 0 ? `shake-${shakeKey}` : "no-shake"} className="siege-shield-shake flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-zinc-500">Opponent</p>
        <div className="grid grid-cols-5 gap-2">
          {opponentSectors.map((s) => (
            <ShieldTile
              key={s.sector}
              sector={s.sector}
              currentScore={s.currentScore}
              mutationMultiplier={s.mutationMultiplier}
              targetable={canAttack}
              onAttack={onAttack}
              flashOutcome={
                flashTarget?.side === "opponent" && flashTarget.sector === s.sector
                  ? flashTarget.outcome
                  : null
              }
              flashKey={flashTarget?.side === "opponent" && flashTarget.sector === s.sector ? flashTarget.key : 0}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs text-zinc-500">You</p>
        <div className="grid grid-cols-5 gap-2">
          {mySectors.map((s) => (
            <ShieldTile
              key={s.sector}
              sector={s.sector}
              currentScore={s.currentScore}
              mutationMultiplier={s.mutationMultiplier}
              targetable={false}
              flashOutcome={
                flashTarget?.side === "mine" && flashTarget.sector === s.sector ? flashTarget.outcome : null
              }
              flashKey={flashTarget?.side === "mine" && flashTarget.sector === s.sector ? flashTarget.key : 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
