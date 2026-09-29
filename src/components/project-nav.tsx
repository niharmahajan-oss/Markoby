"use client";

import { CalendarDays, LayoutList, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Shared tab strip for the three surfaces of a project workspace. */
export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = [
    { href: base, label: "Plans", icon: LayoutList, exact: true },
    { href: `${base}/calendar`, label: "Calendar", icon: CalendarDays },
    { href: `${base}/progress`, label: "Progress", icon: TrendingUp },
  ];

  return (
    <nav
      aria-label="Project sections"
      className="border-border bg-secondary/60 inline-flex flex-wrap items-center gap-1 rounded-full border p-1"
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
