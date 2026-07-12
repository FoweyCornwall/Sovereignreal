"use client";

import { useMemo } from "react";
import { ShieldTile, type TileOutcome, type TileStatus } from "@/components/pvp/ShieldTile";
import type { MatchRound } from "@/lib/actions/pvpMatch";
import { SECTORS, type Sector } from "@/lib/game/constants";

interface TileData {
  status: TileStatus;
  myScore: number | null;
  opponentScore: number | null;
  outcome: TileOutcome | null;
}

export function SiegeRing({
  rounds,
  displayedRoundNumber,
  myPendingSector,
  selectable,
  flashSectors,
  flashKey,
  onSectorClick,
}: {
  rounds: MatchRound[];
  displayedRoundNumber: number;
  myPendingSector: Sector | null;
  selectable: boolean;
  flashSectors: string[];
  flashKey: number;
  onSectorClick?: (sector: Sector) => void;
}) {
  const tiles = useMemo(() => {
    const map = new Map<Sector, TileData>();

    for (const round of rounds.slice(0, displayedRoundNumber)) {
      if (!round.resolved) continue;

      if (round.sameSector && round.mySector) {
        map.set(round.mySector, {
          status: "revealed",
          myScore: round.myScoreOnMySector,
          opponentScore: round.opponentScoreOnMySector,
          outcome: round.myPoints === 1 ? "won" : "lost",
        });
        continue;
      }

      if (round.mySector) {
        map.set(round.mySector, {
          status: "revealed",
          myScore: round.myScoreOnMySector,
          opponentScore: round.opponentScoreOnMySector,
          outcome: round.myPoints === 1 ? "won" : "no-point",
        });
      }
      if (round.opponentSector) {
        map.set(round.opponentSector, {
          status: "revealed",
          myScore: round.myScoreOnOpponentSector,
          opponentScore: round.opponentScoreOnOpponentSector,
          outcome: round.opponentPoints === 1 ? "lost" : "no-point",
        });
      }
    }

    const result: Record<Sector, TileData> = {} as Record<Sector, TileData>;
    for (const sector of SECTORS) {
      const revealedTile = map.get(sector);
      if (revealedTile) {
        result[sector] = revealedTile;
      } else if (sector === myPendingSector) {
        result[sector] = { status: "pending-mine", myScore: null, opponentScore: null, outcome: null };
      } else if (selectable) {
        result[sector] = { status: "selectable", myScore: null, opponentScore: null, outcome: null };
      } else {
        result[sector] = { status: "unused", myScore: null, opponentScore: null, outcome: null };
      }
    }
    return result;
  }, [rounds, displayedRoundNumber, myPendingSector, selectable]);

  return (
    <div className="grid grid-cols-5 gap-2">
      {SECTORS.map((sector) => {
        const tile = tiles[sector];
        return (
          <ShieldTile
            key={sector}
            sector={sector}
            status={tile.status}
            myScore={tile.myScore}
            opponentScore={tile.opponentScore}
            outcome={tile.outcome}
            flashKey={flashSectors.includes(sector) ? flashKey : 0}
            onSelect={() => onSectorClick?.(sector)}
          />
        );
      })}
    </div>
  );
}
