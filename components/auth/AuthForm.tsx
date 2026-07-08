"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "@/lib/actions/auth";

interface AuthFormProps {
  mode: "login" | "signup";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    {}
  );

  const isLogin = mode === "login";

  return (
    <form action={formAction} className="w-full max-w-sm flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-center">
        {isLogin ? "Sign in to Sovereign" : "Create your account"}
      </h1>

      {!isLogin && (
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            type="text"
            name="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]{3,20}"
            title="3-20 characters: letters, numbers, or underscores"
            autoComplete="username"
            className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-2"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          name="password"
          required
          minLength={6}
          autoComplete={isLogin ? "current-password" : "new-password"}
          className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 px-3 py-2"
        />
      </label>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-500 text-black font-medium py-2.5 shadow-sm shadow-brand-500/20 disabled:opacity-50"
      >
        {pending ? "Please wait…" : isLogin ? "Sign in" : "Sign up"}
      </button>

      <p className="text-sm text-center text-zinc-500">
        {isLogin ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
