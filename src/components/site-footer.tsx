import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { Separator } from "@/components/ui/separator";

const FOOTER_COLS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "Sign up", href: "/auth/signup" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "mailto:hello@markoby.app" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Refunds", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark />
            <p className="text-muted-foreground mt-3 max-w-xs text-sm">
              Your AI growth marketer for the zero-ad-budget era.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-medium tracking-widest uppercase">{col.heading}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8" />
        <p className="text-muted-foreground text-xs">
          © {new Date().getFullYear()} Markoby. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
