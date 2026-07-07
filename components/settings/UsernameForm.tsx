"use client";

import { useState, useTransition } from "react";
import { updateUsername } from "@/lib/actions/settings";

export function UsernameForm({ currentUsername }: { currentUsername: string | null }) {
  const [value, setValue] = useState(currentUsername ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateUsername(value);
      if (result.ok) {
        setMessage("Username updated.");
      } else if (result.reason === "TAKEN") {
        setMessage("That username is already taken.");
      } else if (result.reason === "INVALID_FORMAT") {
        setMessage("Username must be 3-20 characters: letters, numbers, or underscores.");
      } else {
        setMessage(result.message ?? "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={3}
          maxLength={20}
          className="flex-1 rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.08] backdrop-blur-xl px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-amber-500 text-black font-medium px-4 py-2 text-sm shadow-sm shadow-amber-500/20 disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {message && <p className="text-sm text-zinc-500">{message}</p>}
    </form>
  );
}
