"use client";

import { useState, useTransition } from "react";
import { deleteAndRestart } from "@/lib/actions/settings";

export function DeleteAndRestartButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-600 text-red-600 dark:text-red-400 font-medium py-2 px-4"
      >
        Delete &amp; Restart Country
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-600 p-4">
      <p className="text-sm">
        This permanently wipes your GDP, treasury, sectors, and history, and
        returns you to Country Setup. This cannot be undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => deleteAndRestart())}
          className="rounded-md bg-red-600 text-white font-medium py-2 px-4 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 py-2 px-4"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
