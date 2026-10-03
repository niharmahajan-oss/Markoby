import Image from "next/image";
import Link from "next/link";

const FOOTER_COLS: {
  heading: string;
  span: string;
  links: { label: string; href: string }[];
}[] = [
  {
    heading: "Product",
    span: "md:col-span-2",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Platforms", href: "#platforms" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Company",
    span: "md:col-span-3",
    links: [
      { label: "About Markoby", href: "#" },
      { label: "Growth Blog", href: "#" },
      { label: "Founder Contact", href: "mailto:hello@markoby.app" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Legal",
    span: "md:col-span-2",
    links: [
      { label: "Terms of Service", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Refund Policy", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800/80 bg-[#07080a] pt-16 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 border-b border-zinc-800/60 pb-12 md:grid-cols-12">
          <div className="space-y-4 md:col-span-5">
            <div className="flex items-center gap-2.5">
              <Image
                src="/markoby-icon.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-md"
              />
              <span className="text-lg font-bold tracking-tight text-white">
                Markoby
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-400">
              Your AI growth marketer for the zero-ad-budget era. Built to help
              early-stage founders turn code into customers organically.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.heading} className={col.span}>
              <h4 className="mb-4 text-xs font-semibold tracking-wider text-zinc-200 uppercase">
                {col.heading}
              </h4>
              <ul className="space-y-2.5 text-sm text-zinc-400">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition hover:text-[#a3f324]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between pt-8 text-xs text-zinc-500 sm:flex-row">
          <p>
            © {new Date().getFullYear()} Markoby. Built for zero-ad-budget
            founders worldwide.
          </p>
          <span className="mt-4 flex items-center gap-1.5 sm:mt-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a3f324]" />
            Razorpay verified INR checkout
          </span>
        </div>
      </div>
    </footer>
  );
}
