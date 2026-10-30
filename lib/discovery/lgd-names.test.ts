import { describe, expect, it } from "vitest";
import { basicName, coreName } from "./lgd-names";

describe("basicName", () => {
  it("lowercases and strips punctuation", () => {
    expect(basicName("  District Planning & Development Board ")).toBe("district planning development board");
    expect(basicName("Sri Ganganagar (M.Cl.)")).toBe("sri ganganagar m cl");
  });
});

describe("coreName", () => {
  it("removes urban body type words in any position", () => {
    expect(coreName("Municipal Council Kupwara")).toBe("kupwara");
    expect(coreName("Greater Hyderabad Municipal Corporation")).toBe("greater hyderabad");
    expect(coreName("Bruhat Bengaluru Mahanagara Palike")).toBe("bruhat bengaluru");
  });

  it("prefers the longest matching term", () => {
    expect(coreName("Hubli City Municipal Council")).toBe("hubli");
  });

  it("removes rural body type words", () => {
    expect(coreName("GRAMA PANCHAYAT Kodlipet")).toBe("kodlipet");
    expect(coreName("Panchayat Samiti Bikaner")).toBe("bikaner");
  });

  it("keeps the name when it is only a governance word", () => {
    expect(coreName("Municipality")).toBe("municipality");
  });

  it("does not cut words that only contain a term", () => {
    expect(coreName("Blockville")).toBe("blockville");
  });
});
