/** Client-safe platform display labels (no server-only imports). */

import type { Platform } from "@/lib/ai/types";

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "reddit":
      return "Reddit";
    case "x":
      return "X (Twitter)";
    case "instagram":
      return "Instagram";
    case "discord":
      return "Discord";
    case "youtube":
      return "YouTube";
  }
}
