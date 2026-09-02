const STATE_ABBR = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const state = {
  locations: [],
  filter: "ALL",
  query: "",
  markers: new Map(),
  activeId: null,
  origin: null,
  userLocation: null,
  nearestId: null,
  driveById: {},
  routeDest: null,
  kindFilter: "ALL",
};

const listEl = document.getElementById("location-list");
const emptyEl = document.getElementById("empty-state");
const countEl = document.getElementById("count-label");
const searchEl = document.getElementById("search");
const searchForm = document.getElementById("search-form");
const searchStatus = document.getElementById("search-status");
const filtersEl = document.getElementById("filters");
const kindFiltersEl = document.getElementById("kind-filters");
const locateBar = document.getElementById("locate-bar");
const locateBtn = document.getElementById("locate-btn");
const locateMenu = document.getElementById("locate-menu");
const locateStatus = document.getElementById("locate-status");
const LOCATION_PREF_KEY = "hd-eyewear-location";
const THEME_KEY = "hd-eyewear-theme";
const sidebarEl = document.getElementById("sidebar");
const sheetHandle = document.getElementById("sheet-handle");
const finderOpen = document.getElementById("finder-open");
const appEl = document.querySelector(".app");
const daylightToggle = document.getElementById("daylight-toggle");
const daylightToggleMobile = document.getElementById("daylight-toggle-mobile");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // private mode
  }
  return window.matchMedia("(max-width: 800px)").matches ? "light" : "dark";
}

let currentTheme = readSavedTheme();
document.documentElement.classList.remove("theme-light", "theme-dark");
document.documentElement.classList.add(`theme-${currentTheme}`);

const map = L.map("map", {
  scrollWheelZoom: true,
  zoomControl: false,
  preferCanvas: true,
  fadeAnimation: false,
  markerZoomAnimation: false,
  zoomSnap: 0,
  zoomDelta: 0.75,
  wheelDebounceTime: 16,
  wheelPxPerZoomLevel: 70,
  bounceAtZoomLimits: false,
  maxZoom: 19,
});

L.control.zoom({ position: "bottomright" }).addTo(map);

const canvasRenderer = L.canvas({ padding: 0.5, tolerance: 8 });

const VECTOR_STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/liberty",
};
const ESRI_TILES = {
  dark: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
  light: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
};

let vectorLayer = null;
let rasterLayers = [];
let originMarker = null;
let destPin = null;
let routeLayer = null;
let ignoreMapClick = false;
let planetTileTemplate = "";
let prefetchTimer = 0;

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function addEsriBase(theme = currentTheme) {
  for (const layer of rasterLayers) map.removeLayer(layer);
  rasterLayers = [];
  const tiles = ESRI_TILES[theme] || ESRI_TILES.dark;
  const opts = {
    maxZoom: 19,
    maxNativeZoom: 16,
    detectRetina: true,
    keepBuffer: 8,
    updateWhenZooming: true,
    updateWhenIdle: false,
  };
  rasterLayers = [
    L.tileLayer(tiles.base, { ...opts, attribution: "Tiles &copy; Esri" }).addTo(map),
    L.tileLayer(tiles.ref, { ...opts, attribution: "" }).addTo(map),
  ];
}

const PLACE_STYLE = {
  place_city_large: { size: 16, selectedSize: 18, maxZoom: 17 },
  place_city: { size: 14, selectedSize: 15, maxZoom: 16 },
  place_town: { size: 13, selectedSize: 12, maxZoom: 15 },
  place_village: { size: 12, selectedSize: 11, maxZoom: 14 },
  place_suburb: { size: 12, selectedSize: 11, maxZoom: 16 },
  place_state: { size: 13, selectedSize: 13, maxZoom: 11 },
  place_other: { size: 11, selectedSize: 10, maxZoom: 15 },
  label_city_capital: { size: 16, selectedSize: 18, maxZoom: 17 },
  label_city: { size: 14, selectedSize: 15, maxZoom: 16 },
  label_town: { size: 13, selectedSize: 12, maxZoom: 15 },
  label_village: { size: 12, selectedSize: 11, maxZoom: 14 },
  label_state: { size: 13, selectedSize: 13, maxZoom: 11 },
  label_other: { size: 11, selectedSize: 10, maxZoom: 15 },
};

const CITY_LAYERS = ["place_city", "label_city"];
const TOWN_LAYERS = ["place_town", "label_town"];
const VILLAGE_LAYERS = ["place_village", "label_village"];

const CLUTTER_LAYERS = [
  "place_other",
  "place_suburb",
  "place_village",
  "highway_name_other",
  "road_oneway",
  "road_oneway_opposite",
  "highway_path",
  "water_name",
  "label_other",
  "label_village",
  "highway-name-path",
  "highway-name-minor",
  "highway-name-major",
  "road_one_way_arrow",
  "road_one_way_arrow_opposite",
  "poi_r20",
  "poi_r7",
  "poi_r1",
  "poi_transit",
  "water_name_point_label",
  "water_name_line_label",
  "waterway_line_label",
];

const SUBDIVISION_RE = /\b(hills?|estates?|manor|crossing|commons|landing|farms?|woods?|acres|pointe?s?|heights?|terrace|square|meadows?|glen|ridge|crest|chase|knoll|trace|oaks?|pines?|grove|village|parkway|station|harbour|harbor)\b/i;
const COMPASS_RE = /^(north|south|east|west|n\.?|s\.?|e\.?|w\.?|upper|lower|greater|little)\s+/i;

const placeBaseFilters = new Map();
let labelsReady = false;

function getGlMap() {
  try {
    return vectorLayer?.getMaplibreMap?.() || null;
  } catch {
    return null;
  }
}

function setLayerVisible(glMap, id, visible) {
  if (!glMap.getLayer(id)) return;
  glMap.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

function setPlaceFilter(glMap, id, extra) {
  if (!glMap.getLayer(id)) return;
  const base = placeBaseFilters.get(id);
  if (!extra) {
    glMap.setFilter(id, base || null);
    return;
  }
  glMap.setFilter(id, base ? ["all", base, extra] : extra);
}

function nameInFilter(names) {
  if (!names.length) return ["==", 0, 1];
  return ["in", ["downcase", ["coalesce", ["get", "name"], ["get", "name_en"], ""]], ["literal", names]];
}

function clarifyPlaceLabels(glMap) {
  const styleLayers = glMap.getStyle()?.layers || [];
  placeBaseFilters.clear();

  for (const spec of styleLayers) {
    if (spec.id.startsWith("place_") || spec.id.startsWith("label_")) {
      placeBaseFilters.set(spec.id, spec.filter || null);
    }
  }

  for (const [id, layer] of Object.entries(PLACE_STYLE)) {
    if (!glMap.getLayer(id)) continue;
    const spec = styleLayers.find((item) => item.id === id);
    if (currentTheme === "light") {
      glMap.setPaintProperty(id, "text-color", "#1c1914");
      glMap.setPaintProperty(id, "text-halo-color", "rgba(255, 255, 255, 0.92)");
    } else {
      glMap.setPaintProperty(id, "text-color", "#f3efe6");
      glMap.setPaintProperty(id, "text-halo-color", "rgba(8, 8, 8, 0.92)");
    }
    glMap.setPaintProperty(id, "text-halo-width", 1.8);
    glMap.setPaintProperty(id, "text-halo-blur", 0.15);
    glMap.setLayoutProperty(id, "text-transform", "none");
    glMap.setLayoutProperty(id, "text-font", ["Noto Sans Bold"]);
    glMap.setLayerZoomRange(id, spec?.minzoom ?? 0, layer.maxZoom);
  }
  labelsReady = true;
  applyMapLabelMode(glMap);
}

function routeCoordinates() {
  const coords = [];
  if (!routeLayer) return coords;
  routeLayer.eachLayer((layer) => {
    const pts = layer.getLatLngs?.();
    if (!pts) return;
    const flat = Array.isArray(pts[0]) ? pts.flat(2) : pts;
    for (const point of flat) {
      if (point?.lat != null) coords.push([point.lng, point.lat]);
    }
  });
  return coords;
}

function pointToSegmentMiles(lat, lng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng;
  const dy = bLat - aLat;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((lng - aLng) * dx + (lat - aLat) * dy) / len2));
  return haversineMiles(lat, lng, aLat + t * dy, aLng + t * dx);
}

function milesToRoute(lat, lng, coords) {
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const d = pointToSegmentMiles(lat, lng, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
    if (d < best) best = d;
  }
  return best;
}

function normalizePlaceName(value) {
  return String(value || "").trim().toLowerCase();
}

function isSubdivisionName(name, majorNames) {
  const n = normalizePlaceName(name);
  if (!n) return true;
  if (SUBDIVISION_RE.test(n)) return true;
  const stripped = n.replace(COMPASS_RE, "").trim();
  if (stripped && stripped !== n && majorNames.has(stripped)) return true;
  for (const city of majorNames) {
    if (!city || city === n) continue;
    if (n.startsWith(`${city} `) || n.endsWith(` ${city}`) || n.includes(` ${city} `)) return true;
    if (n.startsWith(`${city}-`) || n.endsWith(`-${city}`)) return true;
  }
  return false;
}

function placeRank(props) {
  const rank = Number(props.rank);
  return Number.isFinite(rank) ? rank : 99;
}

function collectRouteLabels(glMap) {
  const dest = state.locations.find((loc) => loc.id === state.activeId);
  const pinned = new Set(
    [dest?.city, state.origin?.city].map(normalizePlaceName).filter(Boolean)
  );
  const city = new Set();
  const town = new Set(pinned);
  const majors = [];

  let features = [];
  try {
    features = glMap.querySourceFeatures("openmaptiles", { sourceLayer: "place" });
  } catch {
    features = [];
  }

  for (const feat of features) {
    const props = feat.properties || {};
    const name = normalizePlaceName(props.name_en || props.name);
    const geom = feat.geometry;
    if (!name || geom?.type !== "Point") continue;
    const [lng, lat] = geom.coordinates;
    const klass = props.class;
    const rank = placeRank(props);
    if (klass === "city" && rank <= 4) {
      majors.push({ name, lat, lng, rank });
    }
  }

  const majorNames = new Set([...majors.map((item) => item.name), ...pinned]);
  const coords = routeCoordinates();
  const along = [];

  if (coords.length >= 2) {
    const seen = new Set();
    for (const feat of features) {
      const props = feat.properties || {};
      const name = normalizePlaceName(props.name_en || props.name);
      const geom = feat.geometry;
      if (!name || seen.has(name) || geom?.type !== "Point") continue;
      const klass = props.class;
      if (klass !== "city" && klass !== "town") continue;
      if (klass === "suburb" || klass === "neighbourhood" || klass === "quarter") continue;
      const rank = placeRank(props);
      if (klass === "city" && rank > 8) continue;
      if (klass === "town" && rank > 10) continue;
      const [lng, lat] = geom.coordinates;
      const miles = milesToRoute(lat, lng, coords);
      const maxMiles = klass === "city" ? 2.2 : 1.4;
      if (miles > maxMiles) continue;
      if (isSubdivisionName(name, majorNames)) continue;
      if (majors.some((major) => major.name !== name && haversineMiles(lat, lng, major.lat, major.lng) <= 5)) continue;
      seen.add(name);
      along.push({ name, klass, rank, miles, lat, lng });
    }

    along.sort((a, b) => a.rank - b.rank || a.miles - b.miles);
    const picked = [];
    for (const item of along) {
      if (picked.length >= 5) break;
      if (picked.some((other) => haversineMiles(item.lat, item.lng, other.lat, other.lng) < 10)) continue;
      picked.push(item);
      if (item.klass === "city") city.add(item.name);
      else town.add(item.name);
    }
  }

  for (const name of pinned) {
    city.add(name);
    town.add(name);
  }

  return { city: [...city], town: [...town] };
}

function applyMapLabelMode(glMap) {
  if (!glMap || !labelsReady) return;
  const selected = Boolean(state.activeId);
  const routed = selected && Boolean(routeLayer);

  for (const id of CLUTTER_LAYERS) setLayerVisible(glMap, id, !selected);

  for (const [id, layer] of Object.entries(PLACE_STYLE)) {
    if (!glMap.getLayer(id)) continue;
    glMap.setLayoutProperty(id, "text-size", selected ? layer.selectedSize : layer.size);
  }

  if (!selected) {
    for (const id of [...CITY_LAYERS, ...TOWN_LAYERS, ...VILLAGE_LAYERS]) {
      setLayerVisible(glMap, id, true);
      setPlaceFilter(glMap, id, null);
    }
    return;
  }

  const names = collectRouteLabels(glMap);
  for (const id of VILLAGE_LAYERS) {
    setLayerVisible(glMap, id, false);
    setPlaceFilter(glMap, id, ["==", 0, 1]);
  }
  for (const id of CITY_LAYERS) {
    setLayerVisible(glMap, id, true);
    setPlaceFilter(glMap, id, routed
      ? nameInFilter(names.city)
      : ["<=", ["coalesce", ["to-number", ["get", "rank"]], 99], 4]);
  }
  for (const id of TOWN_LAYERS) {
    setLayerVisible(glMap, id, names.town.length > 0);
    setPlaceFilter(glMap, id, nameInFilter(names.town));
  }
}

function scheduleLabelRefresh() {
  const glMap = getGlMap();
  if (!glMap) return;
  const run = () => applyMapLabelMode(glMap);
  if (glMap.isStyleLoaded()) {
    glMap.once("idle", run);
    run();
  }
}

function addMapBase() {
  if (!hasWebGL() || typeof L.maplibreGL !== "function") {
    addEsriBase();
    return;
  }
  try {
    vectorLayer = L.maplibreGL({
      style: VECTOR_STYLES[currentTheme] || VECTOR_STYLES.dark,
      attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; OpenMapTiles &copy; OpenStreetMap',
    }).addTo(map);
    const glMap = getGlMap();
    if (!glMap) return;
    const apply = () => clarifyPlaceLabels(glMap);
    glMap.on("style.load", apply);
    if (glMap.isStyleLoaded()) apply();
  } catch {
    vectorLayer = null;
    addEsriBase();
  }
}

function resizeVectorMap() {
  try {
    vectorLayer?.getMaplibreMap?.()?.resize();
  } catch {
    // raster fallback
  }
}

function syncThemeToggles() {
  const on = currentTheme === "light";
  for (const btn of [daylightToggle, daylightToggleMobile]) {
    if (!btn) continue;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function switchMapStyle(theme) {
  const glMap = getGlMap();
  if (glMap) {
    labelsReady = false;
    glMap.setStyle(VECTOR_STYLES[theme] || VECTOR_STYLES.dark);
    return;
  }
  if (rasterLayers.length) addEsriBase(theme);
}

function setTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.classList.remove("theme-light", "theme-dark");
  document.documentElement.classList.add(`theme-${currentTheme}`);
  try {
    localStorage.setItem(THEME_KEY, currentTheme);
  } catch {
    // private mode
  }
  syncThemeToggles();
  switchMapStyle(currentTheme);
}

function toggleSettings(force) {
  if (!settingsPanel || !settingsBtn) return;
  const open = force == null ? settingsPanel.hidden : force;
  settingsPanel.hidden = !open;
  settingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

syncThemeToggles();

function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y, z };
}

function tileUrl(z, x, y) {
  return planetTileTemplate.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

function warmUrls(urls, limit = 160) {
  for (const url of urls.slice(0, limit)) {
    fetch(url, { mode: "cors", credentials: "omit" }).catch(() => {});
  }
}

function prefetchAround(lat, lng, zoom) {
  if (!planetTileTemplate || lat == null || lng == null) return;
  const z = Math.min(14, Math.max(6, Math.round(zoom)));
  const center = lngLatToTile(lng, lat, z);
  const urls = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      urls.push(tileUrl(z, center.x + dx, center.y + dy));
    }
  }
  if (z < 14) {
    const next = lngLatToTile(lng, lat, z + 1);
    urls.push(tileUrl(z + 1, next.x, next.y));
  }
  warmUrls(urls, 12);
}

async function warmMapCache(locations) {
  try {
    const planet = await fetch("https://tiles.openfreemap.org/planet").then((res) => res.json());
    planetTileTemplate = planet.tiles?.[0] || "";
    if (!planetTileTemplate) return;

    const pts = locations.filter((loc) => loc.lat != null && loc.lng != null);
    if (!pts.length) return;

    const bounds = L.latLngBounds(pts.map((loc) => [loc.lat, loc.lng])).pad(0.12);
    const urls = [
      VECTOR_STYLES[currentTheme] || VECTOR_STYLES.dark,
      "https://tiles.openfreemap.org/planet",
      "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json",
      "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.png",
      "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf",
      "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold/0-255.pbf",
    ];

    for (const z of [6, 7, 8, 9]) {
      const nw = lngLatToTile(bounds.getWest(), bounds.getNorth(), z);
      const se = lngLatToTile(bounds.getEast(), bounds.getSouth(), z);
      for (let x = nw.x; x <= se.x; x += 1) {
        for (let y = nw.y; y <= se.y; y += 1) {
          urls.push(tileUrl(z, x, y));
        }
      }
    }

    warmUrls(urls);
  } catch {
    // keep browsing; cache will fill from live requests
  }
}

function registerMapCache() {
  if (!("serviceWorker" in navigator)) return;
  const swUrl = new URL("../sw.js", import.meta.url);
  navigator.serviceWorker.register(swUrl).catch(() => {});
}

addMapBase();
registerMapCache();

map.on("click", (event) => {
  const target = event.originalEvent?.target;
  if (target?.closest?.(".leaflet-popup, .leaflet-control, .finder-open, .dest-pin-wrap")) return;
  if (ignoreMapClick) {
    ignoreMapClick = false;
    return;
  }
  hideFinder();
});

map.on("moveend", () => {
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    const center = map.getCenter();
    prefetchAround(center.lat, center.lng, map.getZoom());
    if (state.activeId) scheduleLabelRefresh();
  }, 350);
});

let searchSeq = 0;
let debounceTimer = 0;

function isMobile() {
  return window.matchMedia("(max-width: 800px)").matches;
}

function formatPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(raw).trim();
}

function telHref(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits ? `tel:+1${digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits}` : "";
}

const DAY_IDX = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseClock(value) {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDayList(spec) {
  const days = [];
  for (const part of spec.split(",")) {
    const token = part.trim().toLowerCase();
    if (!token) continue;
    const range = token.split("-");
    const start = DAY_IDX[range[0]];
    const end = range[1] ? DAY_IDX[range[1]] : start;
    if (start == null || end == null) continue;
    if (start <= end) {
      for (let day = start; day <= end; day += 1) days.push(day);
    } else {
      for (let day = start; day <= 6; day += 1) days.push(day);
      for (let day = 0; day <= end; day += 1) days.push(day);
    }
  }
  return days;
}

function parseOpeningHours(spec) {
  if (!spec) return null;
  const raw = String(spec).trim();
  if (raw === "24/7") {
    return Object.fromEntries([...Array(7)].map((_, day) => [day, [{ start: 0, end: 1440 }]]));
  }
  const week = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const chunk of raw.split(";")) {
    const part = chunk.trim();
    if (!part) continue;
    if (/\boff\b/i.test(part)) {
      const days = parseDayList(part.replace(/\boff\b/i, "").trim());
      for (const day of days) week[day] = [];
      continue;
    }
    const match = part.match(/^([A-Za-z][A-Za-z0-9,\- ]*?)\s+(\d.*)$/);
    if (!match) continue;
    const days = parseDayList(match[1]);
    const ranges = match[2].split(",").map((item) => {
      const times = item.trim().split("-");
      const start = parseClock(times[0]);
      const end = parseClock(times[1] || "");
      return start != null && end != null ? { start, end } : null;
    }).filter(Boolean);
    for (const day of days) week[day] = ranges;
  }
  return week;
}

function easternNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const week = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return {
    day: week[get("weekday").slice(0, 3).toLowerCase()] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function formatClock(minutes) {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return minute ? `${hour12}:${String(minute).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}

function hoursStatus(loc) {
  const week = parseOpeningHours(loc.hours);
  const tel = telHref(loc.phone);
  if (!week) {
    return {
      open: null,
      label: "Call to confirm hours",
      href: tel,
    };
  }
  const now = easternNow();
  const today = week[now.day] || [];
  const current = today.find((range) => now.minutes >= range.start && now.minutes < range.end);
  if (current) {
    return { open: true, label: `Open now · until ${formatClock(current.end)}`, href: "" };
  }
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const day = (now.day + ahead) % 7;
    const ranges = week[day] || [];
    const next = ranges.find((range) => ahead > 0 || range.start > now.minutes);
    if (!next) continue;
    const when = ahead === 0 ? formatClock(next.start) : `${DAY_NAME[day].slice(0, 3)} ${formatClock(next.start)}`;
    return { open: false, label: `Closed · Opens ${when}`, href: "" };
  }
  return { open: false, label: "Closed", href: tel };
}

function storeShareText(loc) {
  const phone = formatPhone(loc.phone);
  return [
    loc.name.trim(),
    loc.address.trim(),
    `${loc.city.trim()}, ${loc.state.trim()}`,
    phone,
  ].filter(Boolean).join("\n");
}

async function shareLocation(loc, button) {
  const text = storeShareText(loc);
  try {
    if (navigator.share) {
      await navigator.share({ title: loc.name.trim(), text });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = "Share";
      }, 1400);
    }
  } catch {
    // ignore
  }
}

function setFinderHidden(hidden) {
  appEl.classList.toggle("finder-hidden", hidden);
  sidebarEl.classList.toggle("is-minimized", hidden && isMobile());
  if (hidden) {
    sidebarEl.classList.remove("is-expanded");
    sidebarEl.style.height = "";
  }
  if (finderOpen) finderOpen.hidden = !hidden;
  requestAnimationFrame(() => {
    map.invalidateSize({ animate: false });
    resizeVectorMap();
    const bounds = currentRouteBounds();
    if (bounds) fitInView(bounds, { animate: false });
  });
}

function hideFinder() {
  setFinderHidden(true);
}

function showFinder() {
  setFinderHidden(false);
}

function collapseMobileSheet() {
  hideFinder();
}

function selectedActions(id) {
  return `
    <button type="button" class="card-share" data-share-id="${id}">Share</button>
    <button type="button" class="card-go" data-go-id="${id}">Go now</button>
  `;
}

function currentRouteBounds() {
  if (routeLayer && routeLayer.getBounds().isValid()) return routeLayer.getBounds();
  if (state.origin && state.routeDest) {
    return L.latLngBounds(
      [state.origin.lat, state.origin.lng],
      [state.routeDest.lat, state.routeDest.lng]
    );
  }
  return null;
}

function fitInView(bounds, { animate = true } = {}) {
  if (!bounds || !bounds.isValid()) return;
  map.invalidateSize({ animate: false });
  resizeVectorMap();
  const options = {
    animate,
    duration: 0.75,
    easeLinearity: 0.2,
    maxZoom: 12,
    padding: [80, 80],
  };
  if (isMobile()) {
    const sheet = sidebarEl.getBoundingClientRect();
    options.padding = undefined;
    options.paddingTopLeft = L.point(28, 28);
    options.paddingBottomRight = L.point(28, Math.round(sheet.height) + 28);
  }
  map.fitBounds(bounds, options);
}

function syncMapViewport() {
  map.invalidateSize({ animate: false });
  resizeVectorMap();
  const bounds = currentRouteBounds();
  if (bounds) fitInView(bounds, { animate: false });
}

function openDirections(origin, dest) {
  collapseMobileSheet();
  const destStr = `${dest.lat},${dest.lng}`;
  const originStr = origin ? `${origin.lat},${origin.lng}` : "";
  const label = encodeURIComponent(`${dest.name.trim()}, ${dest.address.trim()}, ${dest.city.trim()}, ${dest.state.trim()}`);
  const ua = navigator.userAgent || "";
  const web = origin
    ? `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=driving&dir_action=navigate`
    : `https://www.google.com/maps/dir/?api=1&destination=${destStr}&travelmode=driving&dir_action=navigate`;

  if (/iPhone|iPad|iPod/i.test(ua)) {
    window.location.href = origin
      ? `maps://maps.apple.com/?saddr=${originStr}&daddr=${destStr}&dirflg=d`
      : `maps://maps.apple.com/?daddr=${destStr}&dirflg=d`;
    return;
  }
  if (/Android/i.test(ua)) {
    window.location.href = `google.navigation:q=${destStr}&mode=d`;
    setTimeout(() => {
      window.location.href = `geo:0,0?q=${destStr}(${label})`;
    }, 400);
    return;
  }
  window.open(web, "_blank", "noopener");
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function formatDrive(seconds, meters) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const miles = meters / 1609.344;
  const milesLabel = miles >= 10 ? miles.toFixed(0) : miles.toFixed(1);
  const timeLabel = minutes >= 60
    ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
    : `${minutes} min`;
  return `${timeLabel} · ${milesLabel} mi`;
}

function normalizeState(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_ABBR[raw.toLowerCase()] || raw;
}

function queryHasState(query) {
  return /,\s*[A-Za-z]{2}\b/.test(query) ||
    /\b(MD|DE|VA|WV|NY|PA|NC|NJ|DC|Maryland|Delaware|Virginia|West Virginia)\b/i.test(query);
}

function locKind(loc) {
  return loc.kind === "dealership" ? "dealership" : "eyewear";
}

function candidateLocations() {
  return state.locations.filter((loc) => {
    if (state.filter !== "ALL" && loc.state !== state.filter) return false;
    if (state.kindFilter !== "ALL" && locKind(loc) !== state.kindFilter) return false;
    return loc.lat != null && loc.lng != null;
  });
}

function driveInfo(loc) {
  return state.driveById[loc.id] || null;
}

function sortByDrive(list) {
  return [...list].sort((a, b) => {
    const da = driveInfo(a);
    const db = driveInfo(b);
    if (da && db) return da.seconds - db.seconds || da.meters - db.meters;
    if (da) return -1;
    if (db) return 1;
    if (!state.origin) return 0;
    return haversineMiles(state.origin.lat, state.origin.lng, a.lat, a.lng) -
      haversineMiles(state.origin.lat, state.origin.lng, b.lat, b.lng);
  });
}

function popupPanOptions() {
  const pad = 24;
  const sheet = isMobile() ? Math.round(sidebarEl.getBoundingClientRect().height) : 0;
  return {
    className: "map-callout-wrap dest-popup",
    closeButton: true,
    autoPan: true,
    keepInView: true,
    autoClose: true,
    maxWidth: 220,
    minWidth: 168,
    offset: L.point(0, -6),
    autoPanPaddingTopLeft: L.point(pad, pad),
    autoPanPaddingBottomRight: L.point(pad, sheet + pad),
  };
}

function popupHtml(loc) {
  const drive = driveInfo(loc);
  const closest = loc.id === state.nearestId;
  const nearest = state.locations.find((item) => item.id === state.nearestId);
  const nearestDrive = nearest ? driveInfo(nearest) : null;
  let time = "Get directions";
  let note = "Opens turn-by-turn from here";

  if (drive) {
    const minutes = Math.max(1, Math.round(drive.seconds / 60));
    const miles = drive.meters / 1609.344;
    time = minutes >= 60
      ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
      : `${minutes} min`;
    const milesLabel = `${miles >= 10 ? miles.toFixed(0) : miles.toFixed(1)} mi`;
    if (closest) {
      note = `${milesLabel} · closest store`;
    } else if (nearestDrive) {
      const extra = Math.max(1, Math.round((drive.seconds - nearestDrive.seconds) / 60));
      note = `${milesLabel} · ${extra} min farther than closest`;
    } else {
      note = `${milesLabel} drive`;
    }
  } else if (state.origin) {
    const miles = haversineMiles(state.origin.lat, state.origin.lng, loc.lat, loc.lng);
    time = `${miles.toFixed(1)} mi`;
    note = closest ? "Closest store" : "Straight-line distance";
  }

  const hours = hoursStatus(loc);
  const hoursLine = hours.open == null
    ? ""
    : `<p class="callout-note ${hours.open ? "is-open" : "is-closed"}">${escapeHtml(hours.label)}</p>`;

  return `
    <div class="map-callout dest-callout">
      <p class="callout-kicker">Destination</p>
      <p class="callout-name">${escapeHtml(loc.name.trim())}</p>
      <p class="callout-time">${escapeHtml(time)}</p>
      <p class="callout-note">${escapeHtml(note)}</p>
      ${hoursLine}
      <button type="button" class="popup-go" data-go-id="${loc.id}">Go now</button>
    </div>
  `;
}

function refreshPopups() {
  if (destPin && state.activeId) {
    const loc = state.locations.find((item) => item.id === state.activeId);
    if (loc) destPin.setPopupContent(popupHtml(loc));
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setStatus(message, show = true) {
  searchStatus.hidden = !show;
  searchStatus.textContent = message || "";
}

function updateGoNow(origin, dest) {
  state.routeDest = dest || null;
}

function renderList() {
  const visible = sortByDrive(candidateLocations());
  const total = state.locations.length;
  const dealers = state.locations.filter((loc) => locKind(loc) === "dealership").length;
  const shops = total - dealers;
  countEl.textContent = visible.length === total
    ? `${total} locations · ${shops} eyewear · ${dealers} dealers`
    : `${visible.length} of ${total} locations`;

  if (visible[0] && (driveInfo(visible[0]) || state.origin)) {
    state.nearestId = visible[0].id;
  }

  listEl.replaceChildren();
  emptyEl.hidden = visible.length > 0;

  for (const loc of visible) {
    const li = document.createElement("li");
    const card = document.createElement("div");
    card.className = "location-card";
    card.dataset.id = String(loc.id);
    if (loc.id === state.activeId) card.classList.add("is-active");

    const phone = formatPhone(loc.phone);
    const drive = driveInfo(loc);
    const closest = loc.id === state.nearestId;
    const driveLabel = drive
      ? formatDrive(drive.seconds, drive.meters)
      : state.origin
        ? `${haversineMiles(state.origin.lat, state.origin.lng, loc.lat, loc.lng).toFixed(1)} mi`
        : "";

    const phoneLink = phone && telHref(loc.phone)
      ? `<a class="card-phone" href="${telHref(loc.phone)}">${escapeHtml(phone)}</a>`
      : phone
        ? `<p class="card-phone">${escapeHtml(phone)}</p>`
        : "";
    const hours = hoursStatus(loc);
    const hoursLine = hours.href
      ? `<a class="card-hours ${hours.open == null ? "" : hours.open ? "is-open" : "is-closed"}" href="${hours.href}">${escapeHtml(hours.label)}</a>`
      : `<p class="card-hours ${hours.open ? "is-open" : "is-closed"}">${escapeHtml(hours.label)}</p>`;

    card.innerHTML = `
      ${closest ? '<p class="super-title">Closest</p>' : ""}
      <h2>${escapeHtml(loc.name.trim())}</h2>
      <div class="card-details">
        <p class="card-address">${escapeHtml(loc.address.trim())}<br>${escapeHtml(loc.city.trim())}, ${escapeHtml(loc.state.trim())}</p>
        ${phoneLink}
        ${hoursLine}
      </div>
      <div class="card-footer">
        ${locKind(loc) === "dealership" ? '<span class="kind-tag">Dealer</span>' : ""}
        <span class="state-tag">${escapeHtml(loc.state.trim())}</span>
        ${driveLabel ? `<span class="drive-time">${escapeHtml(driveLabel)}</span>` : ""}
        ${loc.id === state.activeId ? selectedActions(loc.id) : ""}
      </div>
    `;
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-go-id], [data-share-id], .card-phone, .card-hours")) return;
      selectLocation(loc.id, { fly: !state.origin, openPopup: true });
      if (state.origin) drawRouteTo(loc, { fit: true });
    });
    li.appendChild(card);
    listEl.appendChild(li);
  }

  refreshPopups();

  for (const [id, marker] of state.markers) {
    const loc = state.locations.find((item) => item.id === id);
    const show = loc && visible.some((item) => item.id === id);
    if (show) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  }
}

function selectLocation(id, options = {}) {
  const fly = options === true || options.fly;
  const openPopup = options.openPopup !== false;
  state.activeId = id;
  for (const card of listEl.querySelectorAll(".location-card")) {
    const selected = Number(card.dataset.id) === id;
    card.classList.toggle("is-active", selected);
    card.querySelector(".card-go")?.remove();
    card.querySelector(".card-share")?.remove();
    if (selected) {
      const footer = card.querySelector(".card-footer") || card;
      footer.insertAdjacentHTML("beforeend", selectedActions(id));
    }
  }
  const card = listEl.querySelector(`.location-card[data-id="${id}"]`);
  if (card) card.scrollIntoView({ block: "nearest" });

  const loc = state.locations.find((item) => item.id === id);
  if (loc) setDestPin(loc, { openPopup });
  syncActiveMarker();

  const marker = state.markers.get(id);
  if (marker) {
    if (fly) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13), { animate: false });
    }
    const at = marker.getLatLng();
    prefetchAround(at.lat, at.lng, Math.max(map.getZoom(), 13));
  }
  scheduleLabelRefresh();
}

function addMarkers() {
  const bounds = [];
  for (const loc of state.locations) {
    if (loc.lat == null || loc.lng == null) continue;
    const dealer = locKind(loc) === "dealership";
    const marker = L.circleMarker([loc.lat, loc.lng], {
      renderer: canvasRenderer,
      radius: dealer ? 7 : 7,
      color: dealer ? "#f15a22" : "#111111",
      weight: 2,
      fillColor: dealer ? "#111111" : "#f15a22",
      fillOpacity: 1,
    });
    marker.on("click", async () => {
      ignoreMapClick = true;
      hideFinder();
      selectLocation(loc.id, { openPopup: true });
      if (state.origin) await drawRouteTo(loc, { fit: true });
    });
    marker.addTo(map);
    state.markers.set(loc.id, marker);
    bounds.push([loc.lat, loc.lng]);
  }
  if (bounds.length) {
    map.setView([38.2, -77.4], 6);
  } else {
    map.setView([38.0, -77.5], 6);
  }
}

function destPinIcon() {
  return L.divIcon({
    className: "dest-pin-wrap",
    html: '<span class="dest-pin" aria-hidden="true"></span>',
    iconSize: [28, 40],
    iconAnchor: [14, 38],
    popupAnchor: [0, -32],
  });
}

function syncActiveMarker() {
  for (const [id, marker] of state.markers) {
    const hide = id === state.activeId;
    marker.setStyle({
      opacity: hide ? 0 : 1,
      fillOpacity: hide ? 0 : 1,
    });
  }
}

function setDestPin(loc, { openPopup = true } = {}) {
  if (!loc || loc.lat == null || loc.lng == null) return;
  if (destPin) {
    destPin.setLatLng([loc.lat, loc.lng]);
    destPin.setPopupContent(popupHtml(loc));
  } else {
    destPin = L.marker([loc.lat, loc.lng], {
      icon: destPinIcon(),
      zIndexOffset: 800,
      keyboard: false,
    });
    destPin.bindPopup(popupHtml(loc), popupPanOptions());
    destPin.on("click", () => {
      ignoreMapClick = true;
    });
    destPin.addTo(map);
  }
  if (openPopup) destPin.openPopup();
}

function setOriginMarker(origin) {
  if (originMarker) map.removeLayer(originMarker);
  originMarker = L.circleMarker([origin.lat, origin.lng], {
    renderer: canvasRenderer,
    radius: 7,
    color: "#111111",
    weight: 2,
    fillColor: "#d8d5ce",
    fillOpacity: 1,
  }).addTo(map);
  originMarker.bindPopup(`<h3>${escapeHtml(origin.label || "Your location")}</h3>`, { autoPan: false });
}

async function reverseGeocode(point) {
  const url = "https://photon.komoot.io/reverse?" + new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lng),
  });
  const data = await fetch(url).then((res) => res.json());
  const props = data?.features?.[0]?.properties;
  if (!props) return null;
  const city = props.city || props.town || props.village || props.name || "";
  const region = normalizeState(props.state);
  const bits = [city, region].filter(Boolean);
  return {
    city,
    state: region,
    label: bits.join(", ") || "Your location",
  };
}

async function geocodeAddress(query, bias) {
  const raw = query.trim();
  if (!raw) return null;

  const biasedQuery = bias?.state && !queryHasState(raw)
    ? `${raw}, ${bias.state}`
    : raw;

  try {
    const params = new URLSearchParams({
      q: biasedQuery,
      limit: "5",
      lang: "en",
    });
    if (bias?.lat != null && bias?.lng != null) {
      params.set("lat", String(bias.lat));
      params.set("lon", String(bias.lng));
    }
    const data = await fetch("https://photon.komoot.io/api/?" + params).then((res) => res.json());
    const features = data?.features || [];
    if (features.length) {
      const picked = pickNearbyFeature(features, bias) || features[0];
      const [lng, lat] = picked.geometry.coordinates;
      const props = picked.properties || {};
      const city = props.city || props.name || "";
      const region = normalizeState(props.state);
      return {
        lat,
        lng,
        label: [props.name || city, city !== props.name ? city : "", region].filter(Boolean).join(", ") || biasedQuery,
        state: region,
      };
    }
  } catch {
    // fall through
  }

  const censusQuery = biasedQuery;
  try {
    const censusUrl = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + new URLSearchParams({
      address: censusQuery,
      benchmark: "Public_AR_Current",
      format: "json",
    });
    const data = await fetch(censusUrl).then((res) => res.json());
    const match = data?.result?.addressMatches?.[0];
    if (match?.coordinates) {
      return {
        lat: match.coordinates.y,
        lng: match.coordinates.x,
        label: match.matchedAddress || censusQuery,
      };
    }
  } catch {
    // fall through
  }

  const nomParams = new URLSearchParams({
    q: biasedQuery,
    format: "json",
    limit: "5",
    countrycodes: "us",
  });
  if (bias?.lat != null && bias?.lng != null) {
    const pad = 1.75;
    nomParams.set("viewbox", `${bias.lng - pad},${bias.lat + pad},${bias.lng + pad},${bias.lat - pad}`);
    nomParams.set("bounded", "0");
  }
  const nom = await fetch("https://nominatim.openstreetmap.org/search?" + nomParams, {
    headers: { Accept: "application/json" },
  }).then((res) => res.json());
  if (nom?.length) {
    const picked = pickNearbyNominatim(nom, bias) || nom[0];
    return {
      lat: Number(picked.lat),
      lng: Number(picked.lon),
      label: picked.display_name || biasedQuery,
    };
  }
  return null;
}

function pickNearbyFeature(features, bias) {
  if (!bias || bias.lat == null) return features[0];
  let best = null;
  let bestMiles = Infinity;
  for (const feature of features) {
    const [lng, lat] = feature.geometry.coordinates;
    const miles = haversineMiles(bias.lat, bias.lng, lat, lng);
    if (miles < bestMiles) {
      bestMiles = miles;
      best = feature;
    }
  }
  return best;
}

function pickNearbyNominatim(results, bias) {
  if (!bias || bias.lat == null) return results[0];
  let best = null;
  let bestMiles = Infinity;
  for (const item of results) {
    const miles = haversineMiles(bias.lat, bias.lng, Number(item.lat), Number(item.lon));
    if (miles < bestMiles) {
      bestMiles = miles;
      best = item;
    }
  }
  return best;
}

async function fetchDriveTable(origin, pool) {
  if (!pool.length) return {};
  const coords = [`${origin.lng},${origin.lat}`, ...pool.map((loc) => `${loc.lng},${loc.lat}`)].join(";");
  const destinations = pool.map((_, index) => index + 1).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${destinations}&annotations=duration,distance`;
  const data = await fetch(url).then((res) => res.json());
  const durations = data?.durations?.[0];
  const distances = data?.distances?.[0];
  if (!durations) return {};
  const byId = {};
  pool.forEach((loc, index) => {
    if (durations[index] == null) return;
    byId[loc.id] = {
      seconds: durations[index],
      meters: distances?.[index] ?? haversineMiles(origin.lat, origin.lng, loc.lat, loc.lng) * 1609.344,
    };
  });
  return byId;
}

async function fetchRoute(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  const data = await fetch(url).then((res) => res.json());
  const route = data?.routes?.[0];
  if (!route) return null;
  return {
    geometry: route.geometry,
    seconds: route.duration,
    meters: route.distance,
  };
}

async function drawRouteTo(loc, { fit = false } = {}) {
  if (!state.origin || loc.lat == null || loc.lng == null) return;
  try {
    const route = await fetchRoute(state.origin, loc);
    if (routeLayer) map.removeLayer(routeLayer);
    if (route?.geometry) {
      routeLayer = L.geoJSON(route.geometry, {
        style: { color: "#f15a22", weight: 5, opacity: 0.9 },
      }).addTo(map);
    }
  } catch {
    // keep list sort even if the line fails
  }
  updateGoNow(state.origin, loc);
  if (state.activeId !== loc.id) {
    selectLocation(loc.id, { openPopup: true });
  } else {
    setDestPin(loc, { openPopup: true });
  }
  if (fit) {
    const fitted = routeLayer && routeLayer.getBounds().isValid()
      ? routeLayer.getBounds()
      : L.latLngBounds([[state.origin.lat, state.origin.lng], [loc.lat, loc.lng]]);
    fitInView(fitted);
  }
  scheduleLabelRefresh();
}

async function applyOrigin(origin, seq) {
  state.origin = origin;
  setOriginMarker(origin);
  prefetchAround(origin.lat, origin.lng, 12);
  try {
    state.driveById = await fetchDriveTable(origin, state.locations.filter((loc) => loc.lat != null));
  } catch {
    state.driveById = {};
  }
  if (seq != null && seq !== searchSeq) return;
  renderList();
  const closest = sortByDrive(candidateLocations())[0];
  if (closest) {
    state.nearestId = closest.id;
    await drawRouteTo(closest, { fit: true });
    renderList();
  }
}

async function updateFromSearch() {
  const seq = ++searchSeq;
  const q = state.query.trim();

  if (!q) {
    if (state.userLocation) {
      setStatus("", false);
      await applyOrigin(state.userLocation, seq);
    }
    return;
  }

  if (q.length < 3) return;

  setStatus("Updating closest locations…");
  try {
    const origin = await geocodeAddress(q, state.userLocation);
    if (seq !== searchSeq) return;
    if (!origin) {
      setStatus("Could not find that place. Keep typing a city or address.");
      return;
    }
    const sameAsUser = state.userLocation && origin.label === state.userLocation.label;
    setStatus(sameAsUser ? "" : `From ${origin.label}`, !sameAsUser);
    await applyOrigin(origin, seq);
  } catch {
    if (seq !== searchSeq) return;
    setStatus("Could not look that up right now.");
  }
}

function locationPrefOff() {
  try {
    return localStorage.getItem(LOCATION_PREF_KEY) === "off";
  } catch {
    return false;
  }
}

function setLocationPref(value) {
  try {
    if (value) localStorage.setItem(LOCATION_PREF_KEY, value);
    else localStorage.removeItem(LOCATION_PREF_KEY);
  } catch {
    // private mode
  }
}

function closeLocateMenu() {
  if (!locateMenu) return;
  locateMenu.hidden = true;
  locateBtn.setAttribute("aria-expanded", "false");
}

function toggleLocateMenu() {
  if (!locateMenu) return;
  const open = locateMenu.hidden;
  locateMenu.hidden = !open;
  locateBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function resetLocateBar() {
  locateBar.classList.remove("is-on");
  locateBtn.disabled = false;
  locateBtn.textContent = "Use my location";
  locateStatus.hidden = false;
  locateStatus.textContent = "Allow to find a store near you.";
  closeLocateMenu();
}

function clearOrigin() {
  state.origin = null;
  state.driveById = {};
  state.nearestId = null;
  state.routeDest = null;
  if (originMarker) {
    map.removeLayer(originMarker);
    originMarker = null;
  }
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  renderList();
  const pts = state.locations
    .filter((loc) => loc.lat != null && loc.lng != null)
    .map((loc) => [loc.lat, loc.lng]);
  if (pts.length) fitInView(L.latLngBounds(pts));
  scheduleLabelRefresh();
}

async function revokeGeolocationPermission() {
  if (!navigator.permissions) return;
  try {
    if (typeof navigator.permissions.revoke === "function") {
      await navigator.permissions.revoke({ name: "geolocation" });
    }
  } catch {
    // most browsers do not allow pages to revoke location
  }
}

async function stopSharingLocation() {
  const originWasUser = Boolean(
    state.origin &&
    state.userLocation &&
    state.origin.lat === state.userLocation.lat &&
    state.origin.lng === state.userLocation.lng
  );
  state.userLocation = null;
  setLocationPref("off");
  resetLocateBar();
  await revokeGeolocationPermission();
  if (state.query.trim()) {
    if (originWasUser) await updateFromSearch();
    return;
  }
  clearOrigin();
}

function requestUserLocation() {
  if (!navigator.geolocation) {
    locateStatus.hidden = false;
    locateStatus.textContent = "Location is not available in this browser.";
    return;
  }

  closeLocateMenu();
  setLocationPref("");
  locateBtn.disabled = true;
  locateStatus.textContent = "Checking your location…";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const point = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: "Your location",
      };
      try {
        const rev = await reverseGeocode(point);
        if (rev) {
          point.label = rev.label;
          point.state = rev.state;
          point.city = rev.city;
        }
      } catch {
        // keep raw coordinates
      }
      state.userLocation = point;
      setLocationPref("");
      locateBar.classList.add("is-on");
      locateStatus.textContent = "Showing locations near:";
      locateStatus.hidden = false;
      locateBtn.textContent = point.label && point.label !== "Your location" ? point.label : "Your location";
      locateBtn.disabled = false;
      if (!state.query.trim()) {
        setStatus("", false);
        await applyOrigin(point);
      } else {
        await updateFromSearch();
      }
    },
    () => {
      setLocationPref("off");
      resetLocateBar();
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

kindFiltersEl?.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-kind]");
  if (!btn) return;
  state.kindFilter = btn.dataset.kind;
  for (const item of kindFiltersEl.querySelectorAll(".filter-btn")) {
    item.classList.toggle("is-active", item === btn);
  }
  renderList();
  const closest = sortByDrive(candidateLocations())[0];
  if (closest && state.origin) await drawRouteTo(closest, { fit: true });
});

filtersEl.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-state]");
  if (!btn) return;
  state.filter = btn.dataset.state;
  for (const item of filtersEl.querySelectorAll(".filter-btn")) {
    item.classList.toggle("is-active", item === btn);
  }
  renderList();
  const closest = sortByDrive(candidateLocations())[0];
  if (closest && state.origin) await drawRouteTo(closest, { fit: true });
});

searchEl.addEventListener("input", () => {
  state.query = searchEl.value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updateFromSearch();
  }, 450);
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(debounceTimer);
  updateFromSearch();
});

function onDaylightClick() {
  setTheme(currentTheme === "light" ? "dark" : "light");
  if (isMobile()) toggleSettings(false);
}

daylightToggle?.addEventListener("click", onDaylightClick);
daylightToggleMobile?.addEventListener("click", onDaylightClick);
settingsBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSettings();
});

sidebarEl.addEventListener("click", (event) => {
  if (!isMobile() || !settingsPanel || settingsPanel.hidden) return;
  if (event.target.closest("#settings-btn")) return;
  toggleSettings(false);
});

locateBtn.addEventListener("click", () => {
  if (locateBar.classList.contains("is-on")) {
    toggleLocateMenu();
    return;
  }
  requestUserLocation();
});

locateMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-locate-action]")?.dataset.locateAction;
  if (action === "refresh") requestUserLocation();
  if (action === "stop") stopSharingLocation();
});

document.addEventListener("click", (event) => {
  if (!locateMenu.hidden && !event.target.closest(".locate-place")) {
    closeLocateMenu();
  }
  if (settingsPanel && !settingsPanel.hidden && !event.target.closest(".header-tools") && !event.target.closest(".settings-panel")) {
    toggleSettings(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLocateMenu();
    toggleSettings(false);
  }
});

if (navigator.permissions?.query) {
  navigator.permissions.query({ name: "geolocation" }).then((status) => {
    status.onchange = () => {
      if (status.state !== "granted" && state.userLocation) {
        stopSharingLocation();
      }
    };
  }).catch(() => {});
}

document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go-id]");
  if (!go) return;
  event.preventDefault();
  event.stopPropagation();
  const dest = state.locations.find((loc) => loc.id === Number(go.dataset.goId));
  if (dest) openDirections(state.origin, dest);
});

let sheetDrag = null;
let sheetMoved = false;
sheetHandle.addEventListener("pointerdown", (event) => {
  if (!isMobile()) return;
  sheetMoved = false;
  sheetDrag = {
    y: event.clientY,
    h: sidebarEl.getBoundingClientRect().height,
  };
  sheetHandle.setPointerCapture(event.pointerId);
});
sheetHandle.addEventListener("pointermove", (event) => {
  if (!sheetDrag) return;
  if (Math.abs(event.clientY - sheetDrag.y) > 6) sheetMoved = true;
  if (appEl.classList.contains("finder-hidden") && event.clientY < sheetDrag.y - 8) {
    showFinder();
    sheetDrag.h = sidebarEl.getBoundingClientRect().height;
  }
  const next = Math.min(
    window.innerHeight * 0.88,
    Math.max(window.innerHeight * 0.28, sheetDrag.h + (sheetDrag.y - event.clientY))
  );
  sidebarEl.style.height = `${next}px`;
  sidebarEl.classList.toggle("is-expanded", next > window.innerHeight * 0.6);
});
function endSheetDrag() {
  if (!sheetDrag) return;
  const h = sidebarEl.getBoundingClientRect().height;
  const expanded = h > window.innerHeight * 0.58;
  sidebarEl.classList.toggle("is-expanded", expanded);
  sidebarEl.style.height = "";
  sheetDrag = null;
  if (sheetMoved && routeLayer) fitInView(routeLayer.getBounds());
}
sheetHandle.addEventListener("pointerup", endSheetDrag);
sheetHandle.addEventListener("pointercancel", endSheetDrag);
sheetHandle.addEventListener("click", () => {
  if (!isMobile() || sheetMoved) return;
  if (appEl.classList.contains("finder-hidden")) {
    showFinder();
    sidebarEl.classList.add("is-expanded");
    return;
  }
  sidebarEl.classList.toggle("is-expanded");
  sidebarEl.style.height = "";
  if (routeLayer) fitInView(routeLayer.getBounds());
});

finderOpen?.addEventListener("click", (event) => {
  event.stopPropagation();
  showFinder();
  if (isMobile()) sidebarEl.classList.add("is-expanded");
});

const mapPaneEl = document.querySelector(".map-pane");
let viewportTimer = 0;
if (mapPaneEl && typeof ResizeObserver === "function") {
  new ResizeObserver(() => {
    clearTimeout(viewportTimer);
    viewportTimer = setTimeout(syncMapViewport, 80);
  }).observe(mapPaneEl);
}

window.addEventListener("resize", () => {
  clearTimeout(viewportTimer);
  viewportTimer = setTimeout(syncMapViewport, 80);
});

const locations = await fetch("data/locations.json").then((res) => {
  if (!res.ok) throw new Error(`Failed to load locations: ${res.status}`);
  return res.json();
});

if (!Array.isArray(locations) || !locations.length) {
  console.error("Location list failed to load");
}

state.locations = locations;
addMarkers();
renderList();
map.invalidateSize({ animate: false });
resizeVectorMap();
const warm = () => warmMapCache(state.locations);
if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 1800 });
else setTimeout(warm, 500);
document.addEventListener("click", (event) => {
  const share = event.target.closest("[data-share-id]");
  if (!share) return;
  event.preventDefault();
  event.stopPropagation();
  const loc = state.locations.find((item) => item.id === Number(share.dataset.shareId));
  if (loc) shareLocation(loc, share);
});
