import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  MessageSquareText,
  Rocket,
  Target,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  DiscordIcon,
  InstagramIcon,
  RedditIcon,
  XIcon,
  YoutubeIcon,
} from "@/components/platform-icon";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const HOW_IT_WORKS = [
  {
    icon: Rocket,
    step: "01",
    title: "Drop your site",
    body: "Paste your product's URL. Markoby reads it so the interview starts from what you already built — not from zero.",
  },
  {
    icon: MessageSquareText,
    step: "02",
    title: "Get interviewed",
    body: "An AI growth marketer asks about your product, audience, and constraints — one sharp question at a time.",
  },
  {
    icon: Target,
    step: "03",
    title: "Get plans + prospects",
    body: "Platform-native marketing plans with weekly calendars, plus real people to reach on each platform.",
  },
];

const PLATFORMS_ROW = [
  { name: "Reddit", icon: RedditIcon },
  { name: "X (Twitter)", icon: XIcon },
  { name: "Instagram", icon: InstagramIcon },
  { name: "Discord", icon: DiscordIcon },
  { name: "YouTube", icon: YoutubeIcon },
];

const PRICING_FEATURES = [
  "Unlimited projects & re-runs",
  "AI onboarding interview",
  "Plans for all 5 platforms",
  "Prospect lists with relevance reasons",
  "Weekly content calendars with drafts",
  "Community & subreddit targeting guides",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="surface-glow relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center md:pt-32">
            <Badge variant="secondary" className="mb-6 gap-1.5 rounded-full px-3 py-1">
              <span className="bg-primary inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
              Built for zero-ad-budget founders
            </Badge>
            <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Your first 1,000 customers shouldn&apos;t cost{" "}
              <span className="font-display accent-gradient-text italic">a rupee of ad spend</span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-balance">
              Markoby interviews you about your startup like a senior growth
              marketer would — then turns that into platform-native marketing
              plans and a list of real people to reach on Reddit, X, Instagram,
              Discord, and YouTube.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-8 text-base" render={<Link href="/auth/signup" />}>
                Start with your first project
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="ghost" className="h-12 px-8 text-base" render={<Link href="#how-it-works" />}>
                See how it works
              </Button>
            </div>
            <p className="text-muted-foreground mt-6 text-sm">
              ₹299/month · cancel anytime · no ad spend, ever
            </p>
            <Image
              src="/markoby-lockup.png"
              alt="Markoby — grow social. faster."
              width={1024}
              height={683}
              priority
              className="mx-auto mt-14 w-full max-w-xl mix-blend-screen"
            />
          </div>
        </section>

        {/* Problem / solution */}
        <section className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
                  You can&apos;t outspend anyone.{" "}
                  <span className="text-muted-foreground">So out-position them.</span>
                </h2>
                <p className="text-muted-foreground mt-5 leading-relaxed">
                  Early-stage founders don&apos;t lose on product — they lose on
                  distribution. Agencies cost more than your server bill. Ads
                  burn cash before product-market fit. And &ldquo;just post more&rdquo;
                  advice ignores that every platform punishes startups differently.
                </p>
                <p className="mt-4 leading-relaxed">
                  Markoby is the growth marketer you can&apos;t hire yet: it learns
                  your product deeply, then tells you exactly what to post, where
                  to show up, and who to talk to — with plans shaped around your
                  actual time, team, and tone.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { icon: CalendarClock, stat: "3 weeks", label: "of concrete, day-by-day content calendar per platform — not vague advice" },
                  { icon: Users, stat: "5 platforms", label: "with strategies matched to each one's culture, not one generic template" },
                  { icon: BadgeCheck, stat: "Reason-given", label: "every prospect comes with why they're worth your time" },
                  { icon: MessageSquareText, stat: "Adaptive", label: "the interview follows your product, not a fixed form" },
                ].map((item) => (
                  <Card key={item.stat} className="border-border/70 bg-card/60">
                    <CardContent className="flex flex-col gap-2 p-5">
                      <item.icon className="text-primary h-5 w-5" />
                      <p className="mt-1 font-semibold tracking-tight">{item.stat}</p>
                      <p className="text-muted-foreground text-sm">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-14 text-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                How Markoby works
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
                From &ldquo;I built something&rdquo; to &ldquo;I know exactly what to post today&rdquo; in one sitting.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {HOW_IT_WORKS.map((step) => (
                <Card key={step.step} className="border-border/70 bg-card/60 relative overflow-hidden">
                  <CardContent className="p-7">
                    <span className="font-display text-muted-foreground/50 absolute top-5 right-6 text-5xl italic">
                      {step.step}
                    </span>
                    <div className="border-border bg-secondary inline-flex h-11 w-11 items-center justify-center rounded-xl border">
                      <step.icon className="text-primary h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
                    <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section id="platforms" className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Platform-native, not platform-blind
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-2xl">
              Reddit punishes anything that reads like an ad. X rewards build-in-public.
              Instagram lives on Reels. You get a plan built around each platform&apos;s
              actual culture — plus a prospect list where the platform&apos;s API allows it.
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              {PLATFORMS_ROW.map((p) => (
                <div
                  key={p.name}
                  className="border-border/70 bg-card/60 hover:border-primary/40 flex items-center gap-3 rounded-2xl border px-6 py-4 transition-colors"
                >
                  <p.icon className="h-6 w-6" />
                  <span className="font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  One plan. Everything in it.
                </h2>
                <p className="text-muted-foreground mt-4 leading-relaxed">
                  No tiers, no feature chess, no &ldquo;contact sales.&rdquo; The whole
                  product costs less per month than an hour of an agency&apos;s time.
                </p>
                <ul className="mt-8 space-y-3.5">
                  {PRICING_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <BadgeCheck className="text-primary mt-0.5 h-5 w-5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Card className="border-primary/30 bg-primary/5 relative overflow-hidden shadow-[0_0_80px_var(--glow)]">
                <CardContent className="p-9">
                  <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
                    Markoby Pro
                  </p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-6xl font-semibold tracking-tight">₹299</span>
                    <span className="text-muted-foreground">/ month</span>
                  </div>
                  <p className="text-muted-foreground mt-3 text-sm">
                    Billed monthly in INR via Razorpay. Cancel anytime — your
                    plans and prospects stay yours.
                  </p>
                  <Button size="lg" className="mt-8 w-full" render={<Link href="/auth/signup" />}>
                    Subscribe &amp; start
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Separator className="my-6" />
                  <p className="text-muted-foreground text-center text-xs">
                    14 countries&apos; payment methods via UPI, cards &amp; netbanking
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Social proof — clearly-marked placeholder */}
        <section className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 text-center">
              <Badge variant="outline" className="mb-4">
                Placeholder — replace with real customer quotes at launch
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Founders stop guessing
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  quote: "The interview alone was worth it — I finally understood who I'm actually selling to.",
                  name: "Founder, devtool startup",
                },
                {
                  quote: "First Reddit post from the calendar got 40 upvotes and 3 demo requests. Never touched Reddit before.",
                  name: "Founder, B2B SaaS",
                },
                {
                  quote: "It told me NOT to do YouTube and focus on Discord instead. Saved me months.",
                  name: "Founder, consumer app",
                },
              ].map((t) => (
                <Card key={t.name} className="border-border/70 bg-card/60">
                  <CardContent className="p-7">
                    <p className="leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                    <p className="text-muted-foreground mt-5 text-sm">{t.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="surface-glow border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              Stop shouting into the void. Start showing up where your customers already are.
            </h2>
            <Button size="lg" className="mt-10 h-12 px-8 text-base" render={<Link href="/auth/signup" />}>
              Get your marketing plan
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
