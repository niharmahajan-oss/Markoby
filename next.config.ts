import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The checkout lives in a parent-dir workspace; pin the Turbopack root so
     Next stops scanning upward for a lockfile. */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
