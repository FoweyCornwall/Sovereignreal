"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GdpHistoryPoint } from "@/lib/game/loadStats";
import { formatWithCommas } from "@/lib/game/format";

export function GdpChart({ points }: { points: GdpHistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-zinc-500">
        Not enough history yet. Enact and let a few policies complete to see
        your GDP growth chart.
      </p>
    );
  }

  const data = points.map((p) => ({
    time: new Date(p.recordedAt).getTime(),
    gdp: p.gdp,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis
            dataKey="time"
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            hide
          />
          <YAxis tickFormatter={(v) => formatWithCommas(v)} width={80} />
          <Tooltip
            labelFormatter={(t) => new Date(t).toLocaleString()}
            formatter={(v) => formatWithCommas(Number(v))}
          />
          <Line type="monotone" dataKey="gdp" stroke="#f59e0b" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
