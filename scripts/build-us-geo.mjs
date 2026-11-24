// Builds docs/assets/geo/us-states.json (lower 48 + DC) from the us-atlas states TopoJSON.
// Usage: node scripts/build-us-geo.mjs <path/to/states-10m.json> [out.json]
// The source is data: it is parsed, never executed. See docs/assets/geo/README.md.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAsset } from "./geo-lib.mjs";

const FIPS = {
  "01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO",
  "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC",
  "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

const [source, out] = process.argv.slice(2);
if (!source) {
  console.error("Usage: node scripts/build-us-geo.mjs <states-10m.json> [out.json]");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const target = out ? resolve(out) : join(here, "..", "docs", "assets", "geo", "us-states.json");
const topology = JSON.parse(readFileSync(resolve(source), "utf8"));
const asset = buildAsset(topology, FIPS);
const text = JSON.stringify(asset);
writeFileSync(target, text);
console.log(`${Object.keys(asset.states).length} states, ${asset.arcs.length} arcs, ${text.length} bytes -> ${target}`);
