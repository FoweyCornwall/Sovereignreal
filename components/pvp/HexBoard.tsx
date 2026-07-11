"use client";

import type { MatchTile, TileType } from "@/lib/actions/pvpMatch";

const HEX_SIZE = 34;

const TILE_FILL: Record<TileType, string> = {
  home_a: "#3f3f46",
  home_b: "#3f3f46",
  hub: "#facc15",
  oil: "#27272a",
  tech: "#38bdf8",
  agriculture: "#4ade80",
  neutral: "#a1a1aa",
};

function axialToPixel(q: number, r: number) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 1.5 * r;
  return { x, y };
}

function hexPoints(cx: number, cy: number) {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    const px = cx + HEX_SIZE * Math.cos(angleRad);
    const py = cy + HEX_SIZE * Math.sin(angleRad);
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return points.join(" ");
}

function isAdjacent(q1: number, r1: number, q2: number, r2: number) {
  return (
    (q1 !== q2 || r1 !== r2) &&
    Math.abs(q1 - q2) <= 1 &&
    Math.abs(r1 - r2) <= 1 &&
    Math.abs(q1 + r1 - (q2 + r2)) <= 1
  );
}

export function HexBoard({
  tiles,
  myCountryId,
  opponentCountryId,
  onClaim,
  canClaim,
}: {
  tiles: MatchTile[];
  myCountryId: string;
  opponentCountryId: string;
  onClaim?: (q: number, r: number) => void;
  canClaim: boolean;
}) {
  const mine = new Set(
    tiles.filter((t) => t.ownerCountryId === myCountryId).map((t) => `${t.q},${t.r}`)
  );

  const positions = tiles.map((t) => ({ ...t, ...axialToPixel(t.q, t.r) }));
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs) - HEX_SIZE;
  const maxX = Math.max(...xs) + HEX_SIZE;
  const minY = Math.min(...ys) - HEX_SIZE;
  const maxY = Math.max(...ys) + HEX_SIZE;

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="w-full h-auto max-h-[70vh]"
    >
      {positions.map((tile) => {
        const isMine = tile.ownerCountryId === myCountryId;
        const isEnemy = tile.ownerCountryId === opponentCountryId;
        const claimable =
          canClaim &&
          tile.ownerCountryId === null &&
          tile.tileType !== "home_a" &&
          tile.tileType !== "home_b" &&
          Array.from(mine).some((key) => {
            const [mq, mr] = key.split(",").map(Number);
            return isAdjacent(tile.q, tile.r, mq, mr);
          });

        return (
          <polygon
            key={`${tile.q},${tile.r}`}
            points={hexPoints(tile.x, tile.y)}
            fill={TILE_FILL[tile.tileType]}
            fillOpacity={tile.connected || tile.tileType === "neutral" ? 1 : 0.45}
            stroke={isMine ? "#22c55e" : isEnemy ? "#ef4444" : claimable ? "#facc15" : "#00000022"}
            strokeWidth={isMine || isEnemy ? 3 : claimable ? 2 : 1}
            className={claimable ? "cursor-pointer" : undefined}
            onClick={claimable && onClaim ? () => onClaim(tile.q, tile.r) : undefined}
          />
        );
      })}
    </svg>
  );
}
