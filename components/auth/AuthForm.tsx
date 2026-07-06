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

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
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
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
        />
      </label>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-500 text-black font-medium py-2 disabled:opacity-50"
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
