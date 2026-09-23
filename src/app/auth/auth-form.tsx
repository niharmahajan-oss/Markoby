"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { signIn, signUp } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({
  mode,
  error,
  next,
}: {
  mode: "login" | "signup";
  error?: string;
  next?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error ?? null;

  function onSubmit(formData: FormData) {
    setLocalError(null);
    if (next) formData.set("next", next);
    // NOTE: no try/catch here — the server actions call redirect(), which
    // throws a control-flow error we must not swallow.
    startTransition(async () => {
      if (mode === "signup") await signUp(formData);
      else await signIn(formData);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {mode === "signup" && (
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" placeholder="Ada Lovelace" autoComplete="name" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@startup.com"
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="••••••••"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        {mode === "signup" && (
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        )}
      </div>

      {shownError && (
        <p className="text-destructive text-sm">{shownError}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {mode === "signup" ? "Create account" : "Log in"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/auth/login" className="text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New to Markoby?{" "}
            <Link href="/auth/signup" className="text-foreground underline-offset-4 hover:underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
