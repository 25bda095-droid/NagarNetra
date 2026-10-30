import { describe, expect, it } from "vitest";
import { detectInAppBrowser } from "./in-app-browser";
import { safeNextPath } from "@/lib/http";

describe("detectInAppBrowser", () => {
  it("detects Instagram", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";
    expect(detectInAppBrowser(ua)).toBe("Instagram");
  });

  it("detects Facebook", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 [FBAN/EMA;FBLC/en_US;FBAV/400.0.0]";
    expect(detectInAppBrowser(ua)).toBe("Facebook");
  });

  it("detects a generic Android WebView", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36";
    expect(detectInAppBrowser(ua)).toBe("an in-app browser");
  });

  it("allows normal Chrome and Safari", () => {
    const chrome =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
    const safari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(detectInAppBrowser(chrome)).toBeNull();
    expect(detectInAppBrowser(safari)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps paths on our own site", () => {
    expect(safeNextPath("/report")).toBe("/report");
  });

  it("blocks redirects to other sites", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
