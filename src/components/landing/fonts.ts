import { Caveat, Inter } from "next/font/google";

/**
 * The marketing site uses Inter, while the product UI keeps Geist.
 * Both are loaded here and applied only inside the landing page tree.
 */
export const landingSans = Inter({
  subsets: ["latin"],
  display: "swap",
});

/** Handwritten face used for the highlighted phrase in the hero headline. */
export const landingAccent = Caveat({
  subsets: ["latin"],
  weight: "600",
  display: "swap",
});
