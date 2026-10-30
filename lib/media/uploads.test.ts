import { describe, expect, it } from "vitest";
import { baseMimeType, isAllowedType, mimeFromPath, ownsPath, uploadPath } from "./uploads";

const user = "11111111-2222-3333-4444-555555555555";
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("uploads", () => {
  it("accepts the formats phones record", () => {
    expect(isAllowedType("audio", "audio/webm;codecs=opus")).toBe(true); // Chrome / Android
    expect(isAllowedType("audio", "audio/mp4")).toBe(true); // Safari / iPhone
    expect(isAllowedType("photo", "image/jpeg")).toBe(true);
  });

  it("rejects other file types", () => {
    expect(isAllowedType("photo", "image/svg+xml")).toBe(false);
    expect(isAllowedType("photo", "audio/webm")).toBe(false);
    expect(isAllowedType("audio", "text/html")).toBe(false);
  });

  it("builds and checks per-user paths", () => {
    const path = uploadPath(user, "audio", "audio/webm;codecs=opus", id);
    expect(path).toBe(`${user}/audio/${id}.webm`);
    expect(ownsPath(user, "audio", path)).toBe(true);
    expect(mimeFromPath(path)).toBe("audio/webm");
    expect(baseMimeType("Audio/MP4; codecs=mp4a")).toBe("audio/mp4");
  });

  it("refuses someone else's file or a path trick", () => {
    expect(ownsPath(user, "photo", `99999999-2222-3333-4444-555555555555/photo/${id}.jpg`)).toBe(false);
    expect(ownsPath(user, "photo", `${user}/photo/../../other/${id}.jpg`)).toBe(false);
    expect(ownsPath(user, "photo", `${user}/audio/${id}.webm`)).toBe(false);
  });
});
