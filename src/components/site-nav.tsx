"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#platforms", label: "Platforms" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#who-its-for", label: "Who it's for" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-800/60 bg-[#07080a]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Markoby homepage"
          className="group flex items-center gap-2.5"
        >
          <Image
            src="/markoby-icon.png"
            alt=""
            width={32}
            height={32}
            priority
            className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105"
          />
          <span className="text-xl font-bold tracking-tight text-white">
            Markoby
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-400 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="hidden text-sm font-medium text-zinc-300 transition-colors hover:text-white sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/auth/signup"
            className="shadow-glow-lime-sm inline-flex items-center justify-center rounded-full bg-[#a3f324] px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:scale-[1.02] hover:bg-[#b5fb38] sm:text-sm"
          >
            Start Free Trial
          </Link>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 transition-colors hover:text-white md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-zinc-800/60 px-4 py-3 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-2 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
