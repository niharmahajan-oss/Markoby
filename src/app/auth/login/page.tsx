import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/app/auth/auth-form";
import { Wordmark } from "@/components/wordmark";
import { getUserWithSubscription } from "@/lib/auth";

export const metadata = { title: "Log in · Markoby" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const user = await getUserWithSubscription();
  if (user) redirect("/dashboard");

  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4">
      <Link href="/" className="mb-10">
        <Wordmark />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1 mb-8 text-sm">
          Log in to keep growing your startup.
        </p>
        <AuthForm mode="login" error={error} next={next} />
      </div>
    </main>
  );
}
