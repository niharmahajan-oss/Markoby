import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChartColumn,
  Check,
  ClipboardCheck,
  Clock,
  Link2,
  MessageSquare,
  PenLine,
  RefreshCw,
  Search,
  Target,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { landingAccent, landingSans } from "@/components/landing/fonts";
import { RegionPriceToggle } from "@/components/landing/region-price-toggle";
import { WorkspaceMockup } from "@/components/landing/workspace-mockup";
import {
  DiscordIcon,
  InstagramIcon,
  RedditIcon,
  XIcon,
  YoutubeIcon,
} from "@/components/platform-icon";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

const PAIN_POINTS = [
  {
    emoji: "💸",
    tile: "border-red-500/20 bg-red-500/10 text-red-400",
    title: "No budget for ads",
    body: "Burning $500/mo on PPC or Meta ads before finding true product-market fit only enriches ad networks. Paid conversion is brittle; organic resonance compounds.",
  },
  {
    emoji: "⏱️",
    tile: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    title: "No time for marketing",
    body: "You are writing code, onboarding clients, and fixing critical bugs. Staring at an empty compose box across five different apps isn't sustainable for a solo or duo team.",
  },
  {
    emoji: "🎯",
    tile: "border-purple-500/20 bg-purple-500/10 text-purple-400",
    title: "Zero idea what to post or where",
    body: "Generic advice says \u201cjust create content.\u201d But Reddit bans self-promo on sight, X rewards vulnerable build-in-public hooks, and Discord expects non-salesy community answers.",
  },
];

const PILLARS: { icon: LucideIcon; label: string; body: string }[] = [
  {
    icon: Clock,
    label: "3 weeks",
    body: "Day-by-day content calendar per platform — not vague advice.",
  },
  {
    icon: Users,
    label: "5 platforms",
    body: "Tailored strategies for each platform's culture, not generic cross-posts.",
  },
  {
    icon: BadgeCheck,
    label: "Reason-given",
    body: "Every prospect comes with why they're worth your specific time.",
  },
  {
    icon: MessageSquare,
    label: "Adaptive",
    body: "The interview follows your product logic, never a rigid static form.",
  },
];

const HOW_IT_WORKS: {
  icon: LucideIcon;
  step: string;
  title: string;
  body: string;
  footnote: string;
  accent?: boolean;
}[] = [
  {
    icon: Link2,
    step: "01",
    title: "Drop your site",
    body: "Paste your product's landing page URL. Markoby reads the features, headline value propositions, and positioning so the interview begins with context already understood.",
    footnote: "→ Auto-crawls your landing page",
  },
  {
    icon: MessageSquare,
    step: "02",
    title: "Get interviewed",
    body: "An AI growth marketer asks about your target users, weekly time constraints, and competitive wedge — one conversational, sharp question at a time.",
    footnote: "→ Roughly 5 minutes, mobile or desktop",
  },
  {
    icon: ClipboardCheck,
    step: "03",
    title: "Get plans + prospects",
    body: "Receive platform-native marketing plans with weekly schedules and draft copy, plus curated subreddits and real people already asking for what you built.",
    footnote: "→ Ready to post today",
    accent: true,
  },
];

type IconComponent = ComponentType<{ className?: string }>;

const PLATFORMS_ROW: {
  name: string;
  Icon: IconComponent;
  iconClass: string;
  hoverClass: string;
}[] = [
  {
    name: "Reddit",
    Icon: RedditIcon,
    iconClass: "text-[#ff4500]",
    hoverClass: "hover:border-orange-500/50",
  },
  {
    name: "X (Twitter)",
    Icon: XIcon,
    iconClass: "text-white",
    hoverClass: "hover:border-zinc-500",
  },
  {
    name: "Instagram",
    Icon: InstagramIcon,
    iconClass: "text-pink-400",
    hoverClass: "hover:border-pink-500/50",
  },
  {
    name: "Discord",
    Icon: DiscordIcon,
    iconClass: "text-[#5865F2]",
    hoverClass: "hover:border-[#5865F2]/50",
  },
  {
    name: "YouTube",
    Icon: YoutubeIcon,
    iconClass: "text-red-500",
    hoverClass: "hover:border-red-600/50",
  },
];

const PRICING_INCLUDED = [
  "Your first project is free — no card needed",
  "Unlimited projects & re-runs",
  "AI onboarding interview & market breakdown",
  "Plans for all 5 platforms",
  "Prospect lists with relevance reasons",
  "Weekly content calendars with drafts",
  "Community & subreddit targeting guides",
];

const WHO_ITS_FOR: {
  icon: LucideIcon;
  title: string;
  role: string;
  body: string;
}[] = [
  {
    icon: User,
    title: "Solo founders",
    role: "One person doing product and growth",
    body: "You write the code, answer support, and carry distribution. Markoby turns a single 20-minute interview into three weeks of scheduled, platform-native posts, so shipping content stops depending on inspiration.",
  },
  {
    icon: Users,
    title: "Duo teams pre-PMF",
    role: "Two founders, no marketing hire",
    body: "Nobody on the team owns marketing yet. Run a project per product, keep the interview answers as your positioning reference, and let the weekly check-in adapt next week's angles as traction changes.",
  },
  {
    icon: Target,
    title: "Zero-ad-budget builders",
    role: "Organic only, on purpose",
    body: "You would rather earn attention in the communities your customers already use. Every plan is written to survive platform culture — value-first on Reddit, build-in-public on X, non-salesy in Discord.",
  },
];

export default function LandingPage() {
  return (
    <div
      className={`${landingSans.className} min-h-svh bg-[#07080a] text-zinc-100 selection:bg-[#a3f324] selection:text-black`}
    >
      <SiteNav />

      <main>
        {/* Hero */}
        <section className="hero-glow-bg relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
          <div className="relative z-10 mx-auto max-w-6xl px-4 text-center sm:px-6">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/90 px-3.5 py-1.5 text-xs text-zinc-300 shadow-sm backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#a3f324]" />
              <span>Built for zero-ad-budget founders</span>
            </div>

            <h1 className="mx-auto max-w-4xl text-4xl leading-[1.12] font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Your first 1,000 customers shouldn&apos;t cost{" "}
              <span
                className={`accent-highlight ${landingAccent.className} text-5xl sm:text-7xl lg:text-8xl`}
              >
                a rupee of ad spend
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed font-normal text-zinc-400 sm:text-lg lg:text-xl">
              Markoby interviews you about your startup like a senior growth
              marketer would — then turns that into platform-native marketing
              plans and real people to reach on Reddit, X, Discord, Instagram,
              and YouTube.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/auth/signup"
                className="shadow-glow-lime inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#a3f324] px-7 py-3.5 text-sm font-bold text-black transition-all duration-200 hover:scale-[1.02] hover:bg-[#b5fb38] sm:w-auto"
              >
                <span>Start with your first project</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex w-full items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 px-7 py-3.5 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white sm:w-auto"
              >
                See how it works
              </Link>
            </div>

            <p className="mt-4 text-xs font-medium text-zinc-500 sm:text-sm">
              First project free · ₹299/month after · no ad spend, ever
            </p>

            <WorkspaceMockup />
          </div>
        </section>

        {/* Problem */}
        <section
          id="problem"
          className="border-t border-zinc-800/80 bg-[#07080a] py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 max-w-3xl">
              <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-5xl">
                You can&apos;t outspend anyone.
                <br />
                <span className="text-zinc-400">So out-position them.</span>
              </h2>
              <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">
                Early-stage founders don&apos;t lose on product — they lose on
                distribution. Agencies cost more than your server bill. Ads
                burn cash before product-market fit. And &ldquo;just post
                more&rdquo; advice ignores that every platform punishes
                startups differently.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {PAIN_POINTS.map((point) => (
                <div
                  key={point.title}
                  className="card-glass group relative overflow-hidden rounded-2xl border border-zinc-800/90 p-8"
                >
                  <div
                    className={`mb-6 flex h-12 w-12 items-center justify-center rounded-xl border text-xl ${point.tile}`}
                  >
                    {point.emoji}
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[#a3f324]">
                    {point.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    {point.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
              {PILLARS.map((pillar) => (
                <div
                  key={pillar.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[#a3f324]">
                    <pillar.icon className="h-4 w-4" />
                    {pillar.label}
                  </div>
                  <div className="text-sm font-medium text-zinc-300">
                    {pillar.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="scroll-mt-16 border-t border-zinc-800/80 bg-[#0a0c10] py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-20 max-w-3xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                How Markoby works
              </h2>
              <p className="mt-4 text-base text-zinc-400 sm:text-lg">
                From &ldquo;I built something&rdquo; to &ldquo;I know exactly
                what to post today&rdquo; in one sitting.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {HOW_IT_WORKS.map((step) => (
                <div
                  key={step.step}
                  className="group flex flex-col justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-8 transition-all hover:border-[#a3f324]/40"
                >
                  <div>
                    <div className="mb-8 flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#a3f324]/30 bg-[#a3f324]/10 text-[#a3f324]">
                        <step.icon className="h-6 w-6" />
                      </div>
                      <span className="font-serif text-4xl font-extralight text-zinc-700 italic">
                        {step.step}
                      </span>
                    </div>
                    <h3 className="mb-3 text-2xl font-bold text-white">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-400">
                      {step.body}
                    </p>
                  </div>
                  <div
                    className={`mt-8 border-t border-zinc-800/70 pt-4 font-mono text-xs ${
                      step.accent ? "text-[#a3f324]" : "text-zinc-500"
                    }`}
                  >
                    {step.footnote}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo */}
        <section
          id="demo"
          className="scroll-mt-16 border-t border-zinc-800/80 bg-[#07080a] py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                See Markoby in action
              </h2>
              <p className="mt-4 text-base text-zinc-400 sm:text-lg">
                A quick walkthrough of the interview, the plans it generates,
                and how your weekly calendar comes together.
              </p>
            </div>

            <div className="mx-auto mt-12 max-w-[880px] rounded-2xl border border-zinc-800/90 bg-zinc-900/60 overflow-hidden shadow-2xl">
              <video
                className="w-full"
                controls
                playsInline
                poster="/demo/brag-poster.jpg"
                src="/demo/brag.mp4"
              />
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section
          id="platforms"
          className="scroll-mt-16 border-t border-zinc-800/80 bg-[#07080a] py-20"
        >
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Platform-native, not platform-blind
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Reddit punishes anything that reads like an ad. X rewards
              build-in-public. Instagram lives on short reels. You get a plan
              built around each platform&apos;s actual culture — plus a
              prospect list where the platform&apos;s API allows it.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {PLATFORMS_ROW.map((platform) => (
                <div
                  key={platform.name}
                  className={`flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/90 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800/60 ${platform.hoverClass}`}
                >
                  <platform.Icon className={`h-5 w-5 ${platform.iconClass}`} />
                  {platform.name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="scroll-mt-16 border-t border-zinc-800/80 bg-[#0a0c10] py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 max-w-3xl">
              <span className="text-xs font-semibold tracking-widest text-[#a3f324] uppercase">
                Engineered for organic distribution
              </span>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                Everything an organic marketer gives you, without the $6,000
                retainer.
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
              <div className="card-glass flex flex-col justify-between rounded-2xl border border-zinc-800/90 p-8 md:col-span-7">
                <div>
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#a3f324]/10 font-bold text-[#a3f324]">
                    <PenLine className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">
                    AI-Drafted Posts per Platform
                  </h3>
                  <p className="max-w-lg text-sm leading-relaxed text-zinc-400">
                    Tone-adjusted hooks for Reddit discussions, high-engagement
                    threads for X, and video concepts for Reels. No generic
                    canned blurbs — each one fits the community it lands in.
                  </p>
                </div>
                <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/90 p-3 font-mono text-xs text-zinc-300">
                  <span className="text-[#a3f324]">
                    Reddit Hook Generated:
                  </span>{" "}
                  &ldquo;I spent 40 hours auditing failed micro-SaaS launches.
                  Here is the pattern everyone misses...&rdquo;
                </div>
              </div>

              <div className="card-glass flex flex-col justify-between rounded-2xl border border-zinc-800/90 p-8 md:col-span-5">
                <div>
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#a3f324]/10 font-bold text-[#a3f324]">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">
                    Content Calendar with Drafts
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Every plan lands pre-scheduled across three weeks. Drag any
                    post to a new day, then generate, edit, and approve the
                    draft without leaving the calendar.
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4 text-xs text-zinc-400">
                  <span>Mon: r/SideProject</span>
                  <span>Wed: X Teardown</span>
                  <span>Fri: Discord AMA</span>
                </div>
              </div>

              <div className="card-glass flex flex-col justify-between rounded-2xl border border-zinc-800/90 p-8 md:col-span-4">
                <div>
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#a3f324]/10 font-bold text-[#a3f324]">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">
                    Weekly Adaptive Check-ins
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Log what flopped and what clicked. Markoby folds that
                    feedback back into the plan and re-weights next week&apos;s
                    angles around whatever actually moved.
                  </p>
                </div>
              </div>

              <div className="card-glass flex flex-col justify-between rounded-2xl border border-zinc-800/90 p-8 md:col-span-4">
                <div>
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#a3f324]/10 font-bold text-[#a3f324]">
                    <Search className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">
                    Prospect &amp; Subreddit Discovery
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Curated niche subreddits, Discord groups, and public X
                    accounts already asking for the category of software you
                    sell — each with the reason they made the list.
                  </p>
                </div>
              </div>

              <div className="card-glass flex flex-col justify-between rounded-2xl border border-zinc-800/90 p-8 md:col-span-4">
                <div>
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#a3f324]/10 font-bold text-[#a3f324]">
                    <ChartColumn className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-white">
                    Organic Growth Dashboard
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    See posts shipped, drafts waiting, weekly momentum, and the
                    replies and signups you logged — no pixels, no tagging, no
                    setup.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          className="scroll-mt-16 border-t border-zinc-800/80 bg-[#07080a] py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-6">
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                  One plan. Everything in it.
                </h2>
                <p className="text-base leading-relaxed text-zinc-400 sm:text-lg">
                  No tiers, no feature chess, no &ldquo;contact sales.&rdquo;
                  The whole product costs less per month than an hour of an
                  agency&apos;s time.
                </p>
                <ul className="space-y-3.5 text-sm text-zinc-300">
                  {PRICING_INCLUDED.map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#a3f324]/20 text-[#a3f324]">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-6">
                <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-[#0f1117]/90 p-8 shadow-2xl sm:p-10">
                  <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                    <span className="h-2 w-2 rounded-full bg-[#a3f324]" />
                    Start with a free project
                  </div>
                  <div className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                    Markoby Pro
                  </div>

                  {/* Two regional plans, one product. India keeps ₹299 via
                      Razorpay; every other country pays $5 via PayPal — the
                      matching price and gateway are selected server-side from
                      geo headers on the actual checkout page. A tiny client
                      toggle lets you preview the other region's card. */}
                  <RegionPriceToggle />

                  <p className="mt-2 mb-8 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                    Cancel anytime — your plans and prospects stay yours. Your
                    region&apos;s gateway and currency are picked automatically
                    at checkout.
                  </p>
                  <Link
                    href="/auth/signup"
                    className="shadow-glow-lime inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#a3f324] px-6 py-4 font-bold text-black transition-all hover:scale-[1.01] hover:bg-[#b5fb38]"
                  >
                    <span>Start free — no card needed</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <div className="mt-6 grid grid-cols-2 gap-2 text-center text-xs font-medium text-zinc-500">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-2">
                      <span className="block text-zinc-300">India</span>
                      UPI, cards &amp; netbanking via Razorpay
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-2">
                      <span className="block text-zinc-300">International</span>
                      Cards &amp; PayPal via PayPal checkout
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section
          id="who-its-for"
          className="scroll-mt-16 border-t border-zinc-800/80 bg-[#0a0c10] py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-16 max-w-2xl text-center">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                Who it&apos;s for
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Founders stop guessing.
              </h2>
              <p className="mt-3 text-sm text-zinc-400 sm:text-base">
                Markoby is built for early-stage teams with no ad budget, no
                marketing hire, and no time to spare.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {WHO_ITS_FOR.map((card) => (
                <div
                  key={card.title}
                  className="card-glass flex flex-col justify-between rounded-2xl border border-zinc-800/90 p-7"
                >
                  <p className="mb-6 text-sm leading-relaxed text-zinc-300">
                    {card.body}
                  </p>
                  <div className="flex items-center gap-3 border-t border-zinc-800 pt-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 font-bold text-[#a3f324]">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {card.title}
                      </div>
                      <div className="text-xs text-zinc-500">{card.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-linear-to-b from-[#07080a] to-[#0d1017] py-24">
          <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="shadow-glow-lime relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/80 p-10 sm:p-16">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#a3f324]/10 blur-3xl" />
              <h2 className="mx-auto max-w-2xl text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-5xl">
                Stop shouting into the void. Start showing up where your
                customers already are.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
                Get your social distribution strategy and prospect list ready in
                the next 10 minutes.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/auth/signup"
                  className="shadow-glow-lime inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#a3f324] px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.02] hover:bg-[#b5fb38] sm:w-auto"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <p className="mt-4 text-xs font-medium text-zinc-500">
                Takes 5 minutes · No credit card required · First project
                completely free
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
