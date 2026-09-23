import { LogIn } from "lucide-react";
import Link from "next/link";

import { WordmarkLink } from "@/components/wordmark";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#platforms", label: "Platforms" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteNav() {
  return (
    <header className="border-border/60 bg-background/70 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <WordmarkLink />
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/auth/login" />}>
            <LogIn className="h-4 w-4" />
            Log in
          </Button>
          <Button size="sm" render={<Link href="/auth/signup" />}>
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}
