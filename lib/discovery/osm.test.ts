import { describe, expect, it } from "vitest";
import { distanceM, osmUrl, parseOverpass, roadFromNominatim } from "./osm";
import { cellId } from "./locate";

const point = { lat: 26.45, lon: 80.33 };

describe("parseOverpass", () => {
  const out = parseOverpass(
    [
      { type: "area", id: 3600000000 + 1942586, tags: { boundary: "administrative", admin_level: "4", name: "उत्तर प्रदेश", "name:en": "Uttar Pradesh", wikidata: "Q1498" } },
      { type: "area", id: 3600000000 + 99, tags: { boundary: "administrative", admin_level: "10", name: "Ward 12" } },
      { type: "way", id: 5, tags: { highway: "trunk", ref: "NH34", name: "GT Road" }, center: { lat: 26.4501, lon: 80.33 } },
      { type: "way", id: 6, tags: { highway: "residential" }, center: { lat: 26.4505, lon: 80.33 } },
      { type: "node", id: 7, tags: { amenity: "school", name: "Govt School" }, lat: 26.451, lon: 80.33 },
      { type: "node", id: 8, tags: { highway: "bus_stop" }, lat: 26.4502, lon: 80.33 },
      { type: "way", id: 9, tags: { office: "government", name: "Tehsil Office", phone: "+91 1" }, center: { lat: 26.46, lon: 80.33 } },
    ],
    point,
  );

  it("reads admin areas in English, sorted by level, with sources", () => {
    expect(out.admin.map((a) => [a.admin_level, a.name])).toEqual([[4, "Uttar Pradesh"], [10, "Ward 12"]]);
    expect(out.admin[0].source).toBe("https://www.openstreetmap.org/relation/1942586");
    expect(out.admin[0].wikidata).toBe("Q1498");
  });

  it("picks the nearest road with its reference", () => {
    expect(out.road).toMatchObject({ highway: "trunk", ref: "NH34" });
  });

  it("separates nearby places from offices", () => {
    expect(out.nearby.map((p) => p.kind)).toEqual(["bus_stop", "school"]);
    expect(out.offices[0]).toMatchObject({ name: "Tehsil Office", phone: "+91 1" });
  });
});

describe("helpers", () => {
  it("turns Overpass area ids back into OSM links", () => {
    expect(osmUrl({ type: "area", id: 2400000000 + 42 })).toBe("https://www.openstreetmap.org/way/42");
    expect(osmUrl({ type: "node", id: 7 })).toBe("https://www.openstreetmap.org/node/7");
  });

  it("measures distance in metres", () => {
    expect(distanceM(point, { lat: 26.451, lon: 80.33 })).toBeGreaterThan(105);
    expect(distanceM(point, { lat: 26.451, lon: 80.33 })).toBeLessThan(118);
  });

  it("groups nearby points into ~100 m cells", () => {
    expect(cellId(26.44991, 80.33192)).toBe(cellId(26.4502, 80.3321));
    expect(cellId(26.4499, 80.3319)).not.toBe(cellId(26.4519, 80.3319));
  });

  it("reads the road (class + NH/SH ref) from Nominatim", () => {
    expect(roadFromNominatim({ category: "highway", type: "trunk", name: "NH34", namedetails: { ref: "NH34" }, osm_type: "way", osm_id: 1 }))
      .toMatchObject({ highway: "trunk", ref: "NH34", source: "https://www.openstreetmap.org/way/1" });
    expect(roadFromNominatim({ category: "building", type: "house" })).toBeNull();
  });
});
