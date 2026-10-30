// Google blocks sign-in inside many in-app browsers ("disallowed_useragent").
// We detect them so the user gets "Open in Chrome / Safari" instead of a broken sign-in.

const IN_APP_PATTERNS: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Snapchat/i, "Snapchat"],
  [/\bLine\//i, "LINE"],
  [/Twitter/i, "X (Twitter)"],
  [/; wv\)/i, "an in-app browser"], // generic Android WebView
];

// Returns the app name when the page is open inside an in-app browser, otherwise null.
export function detectInAppBrowser(userAgent: string): string | null {
  for (const [pattern, name] of IN_APP_PATTERNS) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}
