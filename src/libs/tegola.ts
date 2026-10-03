import type {ExpressionSpecification, LayerSpecification, StyleSpecification} from "maplibre-gl";

/**
 * Tegola (https://tegola.io) vector tile server integration.
 *
 * A tegola server exposes:
 *   GET {serverUrl}/capabilities            -> { maps: [{ name, ... }] }
 *   GET {serverUrl}/capabilities/{name}.json -> TileJSON describing the map
 *
 * From the TileJSON we build a MapLibre GL v8 style whose vector source
 * points at the TileJSON URL, with one auto-generated layer per vector
 * layer (by geometry type) plus a label layer, so tile styles served by
 * tegola can be edited directly in Maputnik.
 */

export interface TegolaMapInfo {
  name: string
}

export interface TegolaVectorLayerInfo {
  id: string
  fields?: Record<string, string>
  description?: string
  minzoom?: number
  maxzoom?: number
}

export interface TegolaTileJson {
  tilejson: string
  name?: string
  attribution?: string
  center?: [number, number, number?]
  vector_layers?: Array<{
    id: string
    fields?: Record<string, string>
    description?: string
    minzoom?: number
    maxzoom?: number
  }>
  // tegola also reports geometry per layer via its own debug endpoints;
  // the TileJSON itself carries no geometry type, so callers may pass a
  // geometry-type hint map (layer id -> point | line | polygon).
}

/** Strip trailing slashes and add http:// when the scheme is missing. */
export function normalizeServerUrl(url: string): string {
  let str = (url || "").trim().replace(/\/+$/, "");
  if (str && !/^https?:\/\//i.test(str)) {
    str = `http://${str}`;
  }
  return str;
}

export function getCapabilitiesUrl(serverUrl: string): string {
  return `${normalizeServerUrl(serverUrl)}/capabilities`;
}

export function getTileJsonUrl(serverUrl: string, mapName: string): string {
  return `${normalizeServerUrl(serverUrl)}/capabilities/${mapName}.json`;
}

/** Style source id for a tegola map. */
export function getSourceId(mapName: string): string {
  return `tegola-${mapName}`;
}

const DEFAULT_GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

// Bright, distinguishable palette cycled per layer (same idea as fresco's
// material-color helper, without the extra dependency).
const LAYER_COLORS = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5",
];

function colorFor(index: number): string {
  return LAYER_COLORS[index % LAYER_COLORS.length];
}

// text-field coalescing over the attribute names tegola-based pipelines
// commonly use for display names (fresco parity).
const LABEL_TEXT_FIELD = [
  "coalesce",
  ["get", "name"],
  ["get", "NAME"],
  ["get", "caption"],
  ["get", "NAME_OBJ"],
  ["get", "street_name"],
  ["get", "region_name"],
  ["get", "district_name"],
  "",
] as unknown as ExpressionSpecification;

export type TegolaGeometryType = "point" | "line" | "polygon";

function layerTypeFor(geom: TegolaGeometryType): "circle" | "line" | "fill" {
  switch (geom) {
    case "point": return "circle";
    case "line": return "line";
    default: return "fill";
  }
}

/**
 * Build a MapLibre GL v8 style for a tegola map.
 *
 * @param geometryTypes optional layer-id -> geometry type hints; layers
 * without a hint default to fill (polygon).
 */
export function buildStyleFromTileJson(
  serverUrl: string,
  mapName: string,
  tileJson: TegolaTileJson,
  geometryTypes: Record<string, TegolaGeometryType> = {}
): StyleSpecification {
  const sourceId = getSourceId(mapName);
  const sourceUrl = getTileJsonUrl(serverUrl, mapName);
  const vectorLayers = tileJson.vector_layers || [];

  const layers: LayerSpecification[] = [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#e0e0e0",
      },
    } as LayerSpecification,
  ];

  vectorLayers.forEach((vl, index) => {
    const layerId = vl.id;
    const geom = geometryTypes[layerId] || "polygon";
    const type = layerTypeFor(geom);
    const color = colorFor(index);
    const minzoom = vl.minzoom ?? 0;
    const maxzoom = vl.maxzoom ?? 22;

    const paint: Record<string, unknown> =
      type === "circle"
        ? { "circle-radius": 4, "circle-color": color }
        : type === "line"
          ? { "line-color": color, "line-width": 1.5 }
          : { "fill-color": color, "fill-opacity": 0.4, "fill-outline-color": color };

    layers.push({
      id: `${sourceId}-${layerId}`,
      type,
      source: sourceId,
      "source-layer": layerId,
      minzoom,
      maxzoom,
      paint,
    } as LayerSpecification);

    // Label layer (fresco parity): symbol layer with coalesced text-field.
    layers.push({
      id: `${sourceId}-${layerId}-label`,
      type: "symbol",
      source: sourceId,
      "source-layer": layerId,
      minzoom,
      maxzoom,
      layout: {
        "text-field": LABEL_TEXT_FIELD,
        "text-font": ["Open Sans Regular"],
        "text-size": 12,
        "symbol-placement": geom === "line" ? "line" : "point",
      },
      paint: {
        "text-color": "#202020",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    } as LayerSpecification);
  });

  const style: StyleSpecification = {
    version: 8,
    name: sourceId,
    glyphs: DEFAULT_GLYPHS,
    sources: {
      [sourceId]: {
        type: "vector",
        url: sourceUrl,
      },
    },
    layers,
  };

  const center = tileJson.center;
  if (center && center.length >= 2) {
    style.center = [center[0], center[1]];
    if (center.length >= 3 && center[2] !== undefined) {
      style.zoom = center[2];
    }
  }
  if (tileJson.attribution) {
    style.sources[sourceId] = {
      ...(style.sources[sourceId] as object),
      attribution: tileJson.attribution,
    } as typeof style.sources[string];
  }

  return style;
}

/** Fetch JSON with a clear error for the UI. */
export async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }
  return response.json();
}
