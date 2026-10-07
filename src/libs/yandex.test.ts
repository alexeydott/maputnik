import {describe, expect, test} from "vitest";
import {
  addYandexBasemap,
  buildBlankStyleWithBasemap,
  buildYandexTilesUrl,
  YANDEX_ATTRIBUTION,
  YANDEX_LAYER_ID,
  YANDEX_MAXZOOM,
  YANDEX_SOURCE_ID,
  yandexBasemapLayer,
  yandexRasterSource,
} from "./yandex";

describe("buildYandexTilesUrl", () => {
  test("builds the official Tiles API template", () => {
    expect(buildYandexTilesUrl("KEY123")).toBe(
      "https://tiles.api-maps.yandex.ru/v1/tiles/?apikey=KEY123&lang=ru_RU&l=map&projection=web_mercator&scale=1&x={x}&y={y}&z={z}"
    );
  });
  test("trims and encodes the key", () => {
    expect(buildYandexTilesUrl("  a/b+c ")).toContain("apikey=a%2Fb%2Bc");
  });
  test("custom lang", () => {
    expect(buildYandexTilesUrl("K", "en_US")).toContain("lang=en_US");
  });
});

describe("yandexRasterSource", () => {
  test("raster source with tiles, tileSize and attribution", () => {
    const src: any = yandexRasterSource("K");
    expect(src.type).toBe("raster");
    expect(src.tiles).toHaveLength(1);
    expect(src.tiles[0]).toContain("tiles.api-maps.yandex.ru");
    expect(src.tileSize).toBe(256);
    expect(src.maxzoom).toBe(YANDEX_MAXZOOM);
    expect(src.attribution).toBe(YANDEX_ATTRIBUTION);
    expect(YANDEX_ATTRIBUTION).toContain("Яндекс");
  });
});

describe("addYandexBasemap", () => {
  const base: any = {
    version: 8,
    name: "test",
    sources: { vec: { type: "vector", url: "https://example.com/t.json" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#fff" } },
      { id: "fill-1", type: "fill", source: "vec", "source-layer": "a" },
    ],
  };

  test("inserts basemap after the background layer", () => {
    const out: any = addYandexBasemap(base, "K");
    expect(out.layers.map((l: any) => l.id)).toEqual(["background", YANDEX_LAYER_ID, "fill-1"]);
    expect(out.sources[YANDEX_SOURCE_ID].type).toBe("raster");
    expect(out.layers[1]).toEqual(yandexBasemapLayer());
  });

  test("inserts at index 0 without a background layer", () => {
    const noBg = { ...base, layers: [base.layers[1]] };
    const out: any = addYandexBasemap(noBg, "K");
    expect(out.layers[0].id).toBe(YANDEX_LAYER_ID);
  });

  test("replaces an existing basemap instead of duplicating", () => {
    const once: any = addYandexBasemap(base, "OLD");
    const twice: any = addYandexBasemap(once, "NEW");
    const ids = twice.layers.map((l: any) => l.id);
    expect(ids.filter((id: string) => id === YANDEX_LAYER_ID)).toHaveLength(1);
    expect(twice.sources[YANDEX_SOURCE_ID].tiles[0]).toContain("apikey=NEW");
  });

  test("does not mutate the input style", () => {
    const before = JSON.stringify(base);
    addYandexBasemap(base, "K");
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("buildBlankStyleWithBasemap", () => {
  test("minimal valid style with only the basemap", () => {
    const style: any = buildBlankStyleWithBasemap("K");
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual([YANDEX_SOURCE_ID]);
    expect(style.layers.map((l: any) => l.id)).toEqual([YANDEX_LAYER_ID]);
    expect(style.layers[0].type).toBe("raster");
  });
});
