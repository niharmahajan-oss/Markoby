"use client";

import { ChevronDown, CreditCard, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/app/auth/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * Account menu for the dashboard header.
 *
 * Deliberately hand-rolled: the previous Base UI <Menu> version rendered a
 * Menu.GroupLabel outside a Menu.Group, which throws at open time (Base UI
 * error #31) and took the whole page down. A few dozen lines of plain DOM is
 * cheaper than that class of failure.
 */
export function AccountMenu({
  email,
  fullName,
  billingHref,
}: {
  email: string;
  fullName: string | null;
  billingHref: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const initials = (fullName ?? email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground";

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-accent/60 focus-visible:ring-ring/50 inline-flex h-9 cursor-pointer items-center gap-2.5 rounded-full px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate sm:inline">{fullName ?? email}</span>
        <ChevronDown
          className={`text-muted-foreground h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="border-border bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-56 rounded-lg border p-1 shadow-lg"
        >
          <p className="text-muted-foreground truncate px-2 py-1.5 text-xs">{email}</p>
          <div className="bg-border/70 -mx-1 my-1 h-px" />
          <Link
            role="menuitem"
            href="/dashboard/profile"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <UserRound className="h-4 w-4" />
            Profile
          </Link>
          <Link
            role="menuitem"
            href={billingHref}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <CreditCard className="h-4 w-4" />
            Plan &amp; billing
          </Link>
          <div className="bg-border/70 -mx-1 my-1 h-px" />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className={`${itemClass} text-destructive cursor-pointer`}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
