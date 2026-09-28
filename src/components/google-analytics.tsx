import Script from "next/script";

const GA_MEASUREMENT_ID = "G-G5PWBQN9T6";

/**
 * Google Analytics 4 (gtag.js).
 *
 * `afterInteractive` is the recommended strategy for analytics: the script
 * loads after hydration and never blocks first paint. The inline config
 * snippet is safe even if gtag.js hasn't finished downloading yet — commands
 * queue in `dataLayer` until the library is ready.
 */
export function GoogleAnalytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
