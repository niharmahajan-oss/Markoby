import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/app/auth/auth-form";
import { Wordmark } from "@/components/wordmark";
import { getUserWithSubscription } from "@/lib/auth";

export const metadata = { title: "Sign up · Markoby" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getUserWithSubscription();
  if (user) redirect("/dashboard");

  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4">
      <Link href="/" className="mb-10">
        <Wordmark />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground mt-1 mb-8 text-sm">
          Your first project is free. ₹299/month after that.
        </p>
        <AuthForm mode="signup" error={error} />
      </div>
    </main>
  );
}
