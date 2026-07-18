"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CountrySetupForm,
  type CountrySetupFormInitialValues,
} from "@/components/countryPicker/CountrySetupForm";
import { updateCountryIdentity } from "@/lib/actions/setup";

export function ChangeCountryPanel({
  initialValues,
  identityUpdatedAt,
}: {
  initialValues: CountrySetupFormInitialValues;
  identityUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [now] = useState(() => Date.now());

  const cooldownUntil = identityUpdatedAt
    ? new Date(identityUpdatedAt).getTime() + 24 * 60 * 60 * 1000
    : 0;
  const onCooldown = now < cooldownUntil;

  if (onCooldown) {
    const retryDate = new Date(cooldownUntil);
    return (
      <p className="text-sm text-zinc-500">
        You changed your country recently. You can change it again after{" "}
        {retryDate.toLocaleString()}.
      </p>
    );
  }

  return (
    <CountrySetupForm
      mode="update"
      initialValues={initialValues}
      onSubmit={async (input) => {
        const result = await updateCountryIdentity(input);
        if (!result.ok) {
          if (result.reason === "ON_COOLDOWN") {
            return { ok: false, message: "You can only change your country once every 24 hours." };
          }
          if (result.reason === "NAME_REQUIRED") {
            return { ok: false, message: "Name your country first." };
          }
          return { ok: false, message: "Something went wrong." };
        }
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
