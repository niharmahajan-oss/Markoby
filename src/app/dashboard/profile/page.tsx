import { CreditCard, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/actions";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  FREE_TRIAL_PROJECTS,
  SUBSCRIBE_PATH,
  getUserWithAccess,
  getUserWithSubscription,
} from "@/lib/auth";
import {
  BILLING_PRICING,
  billingCurrencyFromHeaders,
  type BillingCurrency,
} from "@/lib/billing/currency";

export const metadata = { title: "Profile" };

function initialsFor(fullName: string | null, email: string): string {
  return (fullName ?? email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ProfilePage() {
  const session = await getUserWithAccess();
  if (!session) redirect("/auth/login?next=/dashboard/profile");

  const { user, access } = session;
  const used = Math.min(access.projectCount, FREE_TRIAL_PROJECTS);
  const memberSince = formatDate(user.createdAt);

  // Show the plan price in the currency actually billed: the stored
  // subscription currency when one exists, otherwise the server-detected one.
  const fullUser = await getUserWithSubscription();
  const currency: BillingCurrency =
    fullUser?.subscriptionCurrency ?? billingCurrencyFromHeaders(await headers());
  const pricing = BILLING_PRICING[currency];

  const planStatus = access.active
    ? { label: "Markoby Pro · active", variant: "default" as const }
    : access.onTrial
      ? { label: "Free trial", variant: "secondary" as const }
      : user.subscriptionStatus === "past_due"
        ? { label: "Payment failed", variant: "destructive" as const }
        : user.subscriptionStatus === "canceled"
          ? { label: "Subscription ended", variant: "destructive" as const }
          : { label: "No subscription", variant: "outline" as const };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Your account, your plan, and how much of the free trial you&apos;ve used.
      </p>

      <Card className="border-border/70 mt-8">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>How Markoby identifies you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback>{initialsFor(user.fullName, user.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{user.fullName ?? "No name set"}</p>
              <p className="text-muted-foreground truncate text-sm">{user.email}</p>
              {memberSince && (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Member since {memberSince}
                </p>
              )}
            </div>
          </div>
          <Separator />
          <ProfileForm fullName={user.fullName} />
        </CardContent>
      </Card>

      <Card className="border-border/70 mt-6">
        <CardHeader>
          <CardTitle>Plan &amp; usage</CardTitle>
          <CardDescription>
            One plan, {pricing.amountLabel}/month, everything included. Cancel
            anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">Status</span>
            <Badge variant={planStatus.variant}>
              {access.active && <Sparkles className="h-3.5 w-3.5" />}
              {planStatus.label}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">Projects</span>
            <span className="text-sm">
              {access.projectCount}
              {access.active ? (
                <span className="text-muted-foreground"> · unlimited</span>
              ) : null}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">Free trial</span>
            <span className="text-sm">
              {used} of {FREE_TRIAL_PROJECTS} free project used
            </span>
          </div>

          {access.active ? (
            <p className="text-muted-foreground pt-2 text-xs leading-relaxed">
              Billing runs through Razorpay. To change or cancel the plan, use the
              link in any Razorpay receipt, or email{" "}
              <Link
                href="mailto:support@markoby.app"
                className="underline-offset-4 hover:underline"
              >
                support@markoby.app
              </Link>
              .
            </p>
          ) : (
            <div className="pt-2">
              <Button render={<Link href={`${SUBSCRIBE_PATH}?reason=trial`} />}>
                <CreditCard className="h-4 w-4" />
                {pricing.buttonLabel}
              </Button>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                Your projects, plans and prospects stay yours whether or not you
                subscribe.
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <span className="text-muted-foreground text-xs">
            Signed in as {user.email}
          </span>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
