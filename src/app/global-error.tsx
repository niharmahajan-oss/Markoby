"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, where
 * no app styles or components are guaranteed to be available. Kept dependency
 * free and inline-styled on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08090b",
          color: "#f5f5f4",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#a1a1aa", margin: "0 0 24px", fontSize: "0.9rem" }}>
            Markoby hit an unexpected error loading this page. Reloading usually
            fixes it.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                background: "#a3e635",
                color: "#0a0a0a",
                border: "none",
                borderRadius: "9999px",
                padding: "10px 20px",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Deliberately a plain anchor: this boundary renders outside the app shell. */}
            <a
              href="/dashboard"
              style={{
                border: "1px solid #3f3f46",
                color: "#f5f5f4",
                borderRadius: "9999px",
                padding: "10px 20px",
                fontSize: "0.9rem",
                textDecoration: "none",
              }}
            >
              Back to dashboard
            </a>
          </div>
          {error.digest && (
            <p style={{ color: "#71717a", fontSize: "0.75rem", marginTop: "20px" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
