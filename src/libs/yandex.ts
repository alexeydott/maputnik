import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Yandex Maps Tiles API as a raster basemap.
 * https://yandex.ru/maps-api/products/tiles-api
 *
 * Free: 0 RUB, up to 30 requests/sec, for commercial and non-commercial use
 * (permanent since 2026-06-03). Requires an API key from the Yandex
 * developer cabinet ("Подключить API" -> Tiles API).
 *
 * Official tile URL format (projection=web_mercator is mandatory,
 * otherwise markers shift):
 *   https://tiles.api-maps.yandex.ru/v1/tiles/?apikey={KEY}&lang=ru_RU&l=map&projection=web_mercator&scale=1&x={x}&y={y}&z={z}
 *
 * Attribution is required by the terms of use and must stay visible.
 */

export const YANDEX_TILES_BASE = "https://tiles.api-maps.yandex.ru/v1/tiles/";

export const YANDEX_ATTRIBUTION =
  '© <a href="https://yandex.ru/maps/" target="_blank" rel="noopener">Яндекс</a>';

export const YANDEX_MAXZOOM = 19;
export const YANDEX_TILE_SIZE = 256;

export const YANDEX_SOURCE_ID = "yandex-basemap";
export const YANDEX_LAYER_ID = "yandex-basemap";

/** Build the MapLibre {x}/{y}/{z} tile URL template for the given API key. */
export function buildYandexTilesUrl(apiKey: string, lang = "ru_RU"): string {
  const key = encodeURIComponent(apiKey.trim());
  return (
    `${YANDEX_TILES_BASE}?apikey=${key}` +
    `&lang=${encodeURIComponent(lang)}` +
    "&l=map&projection=web_mercator&scale=1&x={x}&y={y}&z={z}"
  );
}

/** MapLibre raster source spec for the Yandex basemap. */
export function yandexRasterSource(apiKey: string): SourceSpecification {
  return {
    type: "raster",
    tiles: [buildYandexTilesUrl(apiKey)],
    tileSize: YANDEX_TILE_SIZE,
    maxzoom: YANDEX_MAXZOOM,
    attribution: YANDEX_ATTRIBUTION,
  } as SourceSpecification;
}

/** Bottom raster layer spec rendering the Yandex basemap source. */
export function yandexBasemapLayer(): LayerSpecification {
  return {
    id: YANDEX_LAYER_ID,
    type: "raster",
    source: YANDEX_SOURCE_ID,
    paint: {
      "raster-opacity": 1,
    },
  } as LayerSpecification;
}

/**
 * Return a copy of `style` with the Yandex basemap raster source + layer.
 * The basemap layer is inserted at the bottom (index 0), or right after a
 * "background" layer when the style starts with one. Existing sources and
 * layers are preserved; an existing yandex-basemap source/layer is replaced.
 */
export function addYandexBasemap(style: StyleSpecification, apiKey: string): StyleSpecification {
  const next: StyleSpecification = {
    ...style,
    sources: { ...(style.sources || {}) },
    layers: [...(style.layers || [])],
  };
  next.sources![YANDEX_SOURCE_ID] = yandexRasterSource(apiKey);
  next.layers = next.layers!.filter(l => l.id !== YANDEX_LAYER_ID);
  const basemap = yandexBasemapLayer();
  const first = next.layers[0];
  if (first && first.type === "background") {
    next.layers.splice(1, 0, basemap);
  } else {
    next.layers.unshift(basemap);
  }
  return next;
}

/** Minimal valid style containing only the Yandex basemap. */
export function buildBlankStyleWithBasemap(apiKey: string): StyleSpecification {
  return {
    version: 8,
    name: "Yandex basemap",
    sources: {
      [YANDEX_SOURCE_ID]: yandexRasterSource(apiKey),
    },
    layers: [yandexBasemapLayer()],
  } as StyleSpecification;
}
