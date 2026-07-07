import { MUTATION_RARITIES_INFO } from "@/lib/game/mutations";

export function MutationOddsTable() {
  return (
    <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Rarity</th>
            <th className="text-right px-3 py-2 font-medium">Odds</th>
            <th className="text-right px-3 py-2 font-medium">Multiplier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {MUTATION_RARITIES_INFO.map((r) => {
            const isIridescent = r.color === "iridescent";
            return (
              <tr key={r.rarity}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: isIridescent ? undefined : r.color,
                        backgroundImage: isIridescent
                          ? "linear-gradient(90deg, #ff9a9e, #a18cd1, #8fd3f4)"
                          : undefined,
                      }}
                    />
                    {r.label}
                  </span>
                </td>
                <td className="text-right px-3 py-2 tabular-nums">{r.weightPercent}%</td>
                <td className="text-right px-3 py-2 tabular-nums">×{r.multiplier}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
