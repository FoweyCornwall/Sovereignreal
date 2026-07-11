"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CUSTOM_FLAG_COLOR_CHOICES,
  CUSTOM_FLAG_EMOJI_CHOICES,
  REAL_WORLD_COUNTRIES,
} from "@/lib/game/countries";
import { createCountry, type CreateCountryInput } from "@/lib/actions/setup";
import { CountryFlag } from "@/components/ui/CountryFlag";

type PickerMode = "real" | "custom";

export interface CountrySetupFormInitialValues {
  name: string;
  flagEmoji?: string | null;
  flagStyle?: { bg: string; pattern?: string } | null;
  countryCode?: string | null;
}

async function defaultOnSubmit(input: CreateCountryInput) {
  const result = await createCountry(input);
  if (result && !result.ok) {
    return { ok: false as const, message: result.message ?? "Something went wrong." };
  }
  return { ok: true as const };
}

export function CountrySetupForm({
  mode = "create",
  initialValues,
  onSubmit = defaultOnSubmit,
}: {
  mode?: "create" | "update";
  initialValues?: CountrySetupFormInitialValues;
  onSubmit?: (input: CreateCountryInput) => Promise<{ ok: boolean; message?: string }>;
}) {
  const initialIsCustom = initialValues && !initialValues.countryCode;
  const [pickerMode, setPickerMode] = useState<PickerMode>(initialIsCustom ? "custom" : "real");
  const [search, setSearch] = useState("");
  const [selectedIso, setSelectedIso] = useState<string | null>(
    initialValues?.countryCode ?? null
  );

  const [customName, setCustomName] = useState(
    initialIsCustom ? initialValues?.name ?? "" : ""
  );
  const [customEmoji, setCustomEmoji] = useState(
    (initialIsCustom && initialValues?.flagEmoji) || CUSTOM_FLAG_EMOJI_CHOICES[0]
  );
  const [customColor, setCustomColor] = useState(
    (initialIsCustom && initialValues?.flagStyle?.bg) || CUSTOM_FLAG_COLOR_CHOICES[0]
  );

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

    if (pickerMode === "real") {
      if (!selectedCountry) {
        setError("Pick a country first.");
        return;
      }
      startTransition(async () => {
        const result = await onSubmit({
          name: selectedCountry.name,
          flagEmoji: selectedCountry.flagEmoji,
          countryCode: selectedCountry.iso2,
        });
        if (!result.ok) setError(result.message ?? "Something went wrong.");
      });
    } else {
      if (!customName.trim()) {
        setError("Name your country first.");
        return;
      }
      startTransition(async () => {
        const result = await onSubmit({
          name: customName,
          flagEmoji: customEmoji,
          flagStyle: { bg: customColor },
        });
        if (!result.ok) setError(result.message ?? "Something went wrong.");
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setPickerMode("real")}
          className={`flex-1 py-2 text-sm font-medium ${
            pickerMode === "real" ? "bg-brand-500 text-black" : ""
          }`}
        >
          Real-World Country
        </button>
        <button
          type="button"
          onClick={() => setPickerMode("custom")}
          className={`flex-1 py-2 text-sm font-medium ${
            pickerMode === "custom" ? "bg-brand-500 text-black" : ""
          }`}
        >
          Custom Country
        </button>
      </div>

      {pickerMode === "real" ? (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm"
          />
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-900">
            {filteredCountries.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => setSelectedIso(c.iso2)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${
                  selectedIso === c.iso2 ? "bg-brand-500/10" : ""
                }`}
              >
                <CountryFlag countryCode={c.iso2} flagEmoji={c.flagEmoji} name={c.name} />
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
              className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-2"
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
                      ? "border-brand-500"
                      : "border-black/10 dark:border-white/10"
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
                    customColor === color ? "border-brand-500" : "border-transparent"
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
        className="rounded-xl bg-brand-500 text-black font-medium py-2.5 shadow-sm shadow-brand-500/20 disabled:opacity-50"
      >
        {pending
          ? mode === "create"
            ? "Founding your nation…"
            : "Saving…"
          : mode === "create"
            ? "Found Nation"
            : "Save Changes"}
      </button>
    </div>
  );
}
