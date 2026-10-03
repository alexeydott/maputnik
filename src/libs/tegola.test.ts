import {describe, expect, test} from "vitest";
import {
  buildStyleFromTileJson,
  getCapabilitiesUrl,
  getSourceId,
  getTileJsonUrl,
  normalizeServerUrl,
  type TegolaTileJson,
} from "./tegola";

describe("normalizeServerUrl", () => {
  test("strips trailing slashes", () => {
    expect(normalizeServerUrl("http://host:port///")).toBe("http://host:port");
  });
  test("adds http scheme when missing", () => {
    expect(normalizeServerUrl("host:port")).toBe("http://host:port");
  });
  test("keeps https scheme", () => {
    expect(normalizeServerUrl("https://host/")).toBe("https://host");
  });
  test("trims whitespace", () => {
    expect(normalizeServerUrl("  http://host ")).toBe("http://host");
  });
  test("empty stays empty", () => {
    expect(normalizeServerUrl("")).toBe("");
  });
});

describe("tegola urls", () => {
  test("capabilities url", () => {
    expect(getCapabilitiesUrl("http://localhost:9090/")).toBe("http://localhost:9090/capabilities");
  });
  test("tilejson url", () => {
    expect(getTileJsonUrl("localhost:9090", "osm")).toBe("http://localhost:9090/capabilities/osm.json");
  });
  test("source id", () => {
    expect(getSourceId("osm")).toBe("tegola-osm");
  });
});

const tileJson: TegolaTileJson = {
  tilejson: "2.2.0",
  name: "osm",
  attribution: "© OpenStreetMap",
  center: [10, 50, 5],
  vector_layers: [
    {id: "places", minzoom: 0, maxzoom: 14},
    {id: "roads", minzoom: 5, maxzoom: 14},
    {id: "water", minzoom: 0, maxzoom: 14},
  ],
};

describe("buildStyleFromTileJson", () => {
  test("builds a v8 style with vector source and background", () => {
    const style = buildStyleFromTileJson("http://localhost:9090", "osm", tileJson, {
      places: "point",
      roads: "line",
    });
    expect(style.version).toBe(8);
    expect(style.name).toBe("tegola-osm");
    const source: any = style.sources["tegola-osm"];
    expect(source.type).toBe("vector");
    expect(source.url).toBe("http://localhost:9090/capabilities/osm.json");
    expect(source.attribution).toBe("© OpenStreetMap");
    expect(style.layers[0].id).toBe("background");
    expect(style.center).toEqual([10, 50]);
    expect(style.zoom).toBe(5);
    expect(style.glyphs).toContain("{fontstack}");
  });

  test("generates geometry + label layers per vector layer", () => {
    const style = buildStyleFromTileJson("http://localhost:9090", "osm", tileJson, {
      places: "point",
      roads: "line",
    });
    const ids = style.layers.map(l => l.id);
    expect(ids).toContain("tegola-osm-places");       // circle
    expect(ids).toContain("tegola-osm-places-label"); // symbol
    expect(ids).toContain("tegola-osm-roads");        // line
    expect(ids).toContain("tegola-osm-water");        // fill (default)

    const places: any = style.layers.find(l => l.id === "tegola-osm-places");
    expect(places.type).toBe("circle");
    expect(places["source-layer"]).toBe("places");

    const roads: any = style.layers.find(l => l.id === "tegola-osm-roads");
    expect(roads.type).toBe("line");

    const label: any = style.layers.find(l => l.id === "tegola-osm-places-label");
    expect(label.type).toBe("symbol");
    expect(label.layout["symbol-placement"]).toBe("point");

    const roadLabel: any = style.layers.find(l => l.id === "tegola-osm-roads-label");
    expect(roadLabel.layout["symbol-placement"]).toBe("line");
  });

  test("works without center and attribution", () => {
    const style = buildStyleFromTileJson("http://h", "m", {tilejson: "2.2.0"});
    expect(style.center).toBeUndefined();
    expect(style.layers).toHaveLength(1); // only background
  });
});
