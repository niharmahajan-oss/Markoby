import Image from "next/image";
import Link from "next/link";

/**
 * Brand lockup: the Markoby "m" icon + wordmark.
 * The icon is the dark rounded-square app tile (public/markoby-icon.png);
 * it sits natively on the dark UI without any blending tricks.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/markoby-icon.png"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 rounded-lg"
        priority
      />
      <span className="text-xl font-semibold tracking-tight">Markoby</span>
    </span>
  );
}

export function WordmarkLink({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={className}>
      <Wordmark />
    </Link>
  );
}
