"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CUSTOM_FLAG_COLOR_CHOICES,
  CUSTOM_FLAG_EMOJI_CHOICES,
  REAL_WORLD_COUNTRIES,
} from "@/lib/game/countries";
import { createCountry } from "@/lib/actions/setup";

type Mode = "real" | "custom";

export function CountrySetupForm() {
  const [mode, setMode] = useState<Mode>("real");
  const [search, setSearch] = useState("");
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const [customName, setCustomName] = useState("");
  const [customEmoji, setCustomEmoji] = useState(CUSTOM_FLAG_EMOJI_CHOICES[0]);
  const [customColor, setCustomColor] = useState(CUSTOM_FLAG_COLOR_CHOICES[0]);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return REAL_WORLD_COUNTRIES;
    return REAL_WORLD_COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const selectedCountry = REAL_WORLD_COUNTRIES.find((c) => c.iso2 === selectedIso);

  function handleSubmit() {
    setError(null);

    if (mode === "real") {
      if (!selectedCountry) {
        setError("Pick a country first.");
        return;
      }
      startTransition(async () => {
        const result = await createCountry({
          name: selectedCountry.name,
          flagEmoji: selectedCountry.flagEmoji,
          countryCode: selectedCountry.iso2,
        });
        if (result && !result.ok) setError(result.message ?? "Something went wrong.");
      });
    } else {
      if (!customName.trim()) {
        setError("Name your country first.");
        return;
      }
      startTransition(async () => {
        const result = await createCountry({
          name: customName,
          flagEmoji: customEmoji,
          flagStyle: { bg: customColor },
        });
        if (result && !result.ok) setError(result.message ?? "Something went wrong.");
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-full border border-zinc-300 dark:border-zinc-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setMode("real")}
          className={`flex-1 py-2 text-sm font-medium ${
            mode === "real" ? "bg-amber-500 text-black" : ""
          }`}
        >
          Real-World Country
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`flex-1 py-2 text-sm font-medium ${
            mode === "custom" ? "bg-amber-500 text-black" : ""
          }`}
        >
          Custom Country
        </button>
      </div>

      {mode === "real" ? (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-900">
            {filteredCountries.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => setSelectedIso(c.iso2)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${
                  selectedIso === c.iso2 ? "bg-amber-500/10" : ""
                }`}
              >
                <span className="text-xl">{c.flagEmoji}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Country name
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={40}
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm">
            Flag emblem
            <div className="flex flex-wrap gap-2">
              {CUSTOM_FLAG_EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setCustomEmoji(emoji)}
                  className={`text-xl rounded-full border px-2 py-1 ${
                    customEmoji === emoji
                      ? "border-amber-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            Flag color
            <div className="flex flex-wrap gap-2">
              {CUSTOM_FLAG_COLOR_CHOICES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCustomColor(color)}
                  style={{ backgroundColor: color }}
                  className={`h-8 w-8 rounded-full border-2 ${
                    customColor === color ? "border-amber-500" : "border-transparent"
                  }`}
                  aria-label={color}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-zinc-500">
            Preview:
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg"
              style={{ backgroundColor: customColor }}
            >
              {customEmoji}
            </span>
            {customName || "Your Nation"}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="rounded-full bg-amber-500 text-black font-medium py-2 disabled:opacity-50"
      >
        {pending ? "Founding your nation…" : "Found Nation"}
      </button>
    </div>
  );
}
