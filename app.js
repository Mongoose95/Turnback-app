const LIMP = { id: "LIMP", name: "Parma", lat: 44.8245, lon: 10.2964 };
const LIDE = { id: "LIDE", name: "Reggio Emilia", lat: 44.698, lon: 10.665 };
const WINDY_POINT_FORECAST_KEY = "L0t9MIoLVNobQmkXlaNuRVeGm1L1NxXS";
const REGGIO_FIELD_ELEV_FT = 152;
const MIN_SAFETY_ALT_FT = 900;
const RWY_11 = 109;
const RWY_29 = 289;
const KNOWN_RUNWAYS = {
  LIDE: [
    { runway: "11", heading: 109, lengthM: 1210 },
    { runway: "29", heading: 289, lengthM: 1210 },
  ],
  LIPF: [
    { runway: "09", heading: 90, lengthM: 850 },
    { runway: "27", heading: 270, lengthM: 850 },
  ],
};
const AIRCRAFT_PROFILES = {
  c172m: {
    id: "c172m",
    label: "Cessna 172M",
    pageTitle: "LIDE Wx",
    pageSubhead: "LIMP METAR & TAF, surface wind, RWY 11/29, safety altitude, sunset, and Italy SWLL.",
    mtowLb: 2300,
    baseSafetyFt: 900,
    baseTakeoffRollFt: 835,
    baseTakeoff50Ft: 1475,
    baseLandingRollFt: 520,
    baseLanding50Ft: 1250,
    sourceNote: "C172M baseline currently used in the original briefing page.",
  },
  c150m: {
    id: "c150m",
    label: "Cessna 150M",
    pageTitle: "LIDE Wx",
    pageSubhead: "C150M performance profile active with the same live weather and airport tools.",
    mtowLb: 1600,
    baseSafetyFt: 780,
    baseTakeoffRollFt: 735,
    baseTakeoff50Ft: 1385,
    baseLandingRollFt: 445,
    baseLanding50Ft: 1075,
    sourceNote: "From the uploaded 1977 Cessna 150M handbook performance section.",
  },
  "8kcab": {
    id: "8kcab",
    label: "Super Decathlon 8KCAB",
    pageTitle: "LIDE Wx",
    pageSubhead: "8KCAB performance profile active with the same live weather and airport tools.",
    mtowLb: 1800,
    baseSafetyFt: 650,
    baseTakeoffRollFt: 456,
    baseTakeoff50Ft: 833,
    baseLandingRollFt: 413,
    baseLanding50Ft: 1023,
    sourceNote: "From the uploaded 8KCAB POH Section IV performance charts at sea level / standard conditions.",
  },
};
const LIDE_RUNWAY_LENGTH_M = 1210;
const FT_TO_M = 0.3048;

const state = {
  aircraft: null,
  surfaceWind: null,
  metar: null,
  taf: null,
  airports: null,
  runways: null,
};

const el = (id) => document.getElementById(id);

function getSelectedAircraft() {
  const params = new URLSearchParams(window.location.search);
  const requested = (params.get("aircraft") || "c172m").toLowerCase();
  return AIRCRAFT_PROFILES[requested] || AIRCRAFT_PROFILES.c172m;
}

function currentAircraft() {
  return state.aircraft || AIRCRAFT_PROFILES.c172m;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  el("clock").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  el("utcClock").textContent = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;
}

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function msToKt(ms) {
  return ms * 1.943844;
}

function windVectorToDirection(u, v) {
  const blowingTo = normalizeDegrees(Math.atan2(u, v) * 180 / Math.PI);
  return {
    from: normalizeDegrees(blowingTo + 180),
    to: blowingTo,
  };
}

function angularDifference(a, b) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return diff > 180 ? 360 - diff : diff;
}

function windComponents(runwayHeading, windDir, windSpeed) {
  const angle = degToRad(runwayHeading - windDir);
  const headwind = windSpeed * Math.cos(angle);
  const crosswind = windSpeed * Math.sin(angle);
  return { headwind, crosswind };
}

function splitWindComponents(components) {
  const headwind = Math.max(0, components.headwind);
  const tailwind = Math.max(0, -components.headwind);
  return {
    headwind,
    tailwind,
    crosswind: Math.abs(components.crosswind),
  };
}

function chooseRunway(windDir, windSpeed) {
  if (!Number.isFinite(windDir) || !Number.isFinite(windSpeed) || windSpeed < 3) {
    return {
      runway: "11",
      heading: RWY_11,
      components: { headwind: 0, crosswind: 0 },
      calm: true,
    };
  }

  const rwy11 = windComponents(RWY_11, windDir, windSpeed);
  const rwy29 = windComponents(RWY_29, windDir, windSpeed);
  const use11 = rwy11.headwind >= rwy29.headwind;

  return {
    runway: use11 ? "11" : "29",
    heading: use11 ? RWY_11 : RWY_29,
    components: use11 ? rwy11 : rwy29,
    calm: false,
  };
}

function chooseBestRunway(runways, windDir, windSpeed, fallbackRunway = runways[0]) {
  if (!Number.isFinite(windDir) || !Number.isFinite(windSpeed) || windSpeed < 3) {
    return {
      ...fallbackRunway,
      components: { headwind: 0, crosswind: 0 },
      calm: true,
    };
  }

  return runways
    .map((runway) => ({
      ...runway,
      components: windComponents(runway.heading, windDir, windSpeed),
      calm: false,
    }))
    .sort((a, b) => b.components.headwind - a.components.headwind)[0];
}

function estimatedRunwaysFromWind(windDir) {
  const primary = Math.max(1, Math.min(36, Math.round(normalizeDegrees(windDir || 0) / 10) || 36));
  const reciprocal = primary > 18 ? primary - 18 : primary + 18;
  const format = (value) => String(value).padStart(2, "0");
  return [
    { runway: format(primary), heading: primary * 10 },
    { runway: format(reciprocal), heading: reciprocal * 10 },
  ];
}

function getAirportRunways(airport, windDir) {
  const known = KNOWN_RUNWAYS[airport.icao];
  if (known) return known;
  const fromDb = state.runways?.[airport.icao];
  return fromDb?.length ? fromDb : estimatedRunwaysFromWind(windDir);
}

function pressureAltitude(qnhHpa) {
  const qnh = Number.isFinite(qnhHpa) ? qnhHpa : 1013;
  return REGGIO_FIELD_ELEV_FT + (1013 - qnh) * 30;
}

function densityAltitude(tempC, qnhHpa) {
  const pa = pressureAltitude(qnhHpa);
  const isaTemp = 15 - 2 * (REGGIO_FIELD_ELEV_FT / 1000);
  return {
    pa,
    isaTemp,
    da: pa + 120 * ((Number.isFinite(tempC) ? tempC : 15) - isaTemp),
  };
}

function calculateSafetyAltitude({ tempC, qnhHpa, windDir, windSpeed, runwayHeading }) {
  const baseSafety = currentAircraft().baseSafetyFt;
  const { pa, isaTemp, da } = densityAltitude(tempC, qnhHpa);
  const daDiff = da - REGGIO_FIELD_ELEV_FT;
  const daFactorSafety = 1 + 0.10 * (daDiff / 1000);
  const weightFactorSafety = 1;
  const components = Number.isFinite(windDir) && Number.isFinite(windSpeed)
    ? windComponents(runwayHeading, windDir, windSpeed)
    : { headwind: 0, crosswind: 0 };

  let windFactorSafety;
  if (components.headwind < 0) {
    windFactorSafety = 1 + 0.10 * ((-components.headwind) / 10);
  } else {
    windFactorSafety = Math.max(0.8, 1 - 0.05 * (components.headwind / 10));
  }

  const raw = baseSafety * daFactorSafety * windFactorSafety * weightFactorSafety;
  const rounded = Math.round(raw / 10) * 10;
  const selected = Math.max(MIN_SAFETY_ALT_FT, rounded);

  return {
    pa,
    isaTemp,
    da,
    headwind: components.headwind,
    crosswind: components.crosswind,
    rounded,
    selected,
    daFactorSafety,
    windFactorSafety,
  };
}

function calculateTakeoffDistance({ tempC, qnhHpa, windDir, windSpeed, runwayHeading }) {
  const aircraft = currentAircraft();
  const { da } = densityAltitude(tempC, qnhHpa);
  const daDiff = da - REGGIO_FIELD_ELEV_FT;
  const daFactorDist = 1 + 0.12 * (daDiff / 1000);
  const weightFactorDist = 1;
  const components = Number.isFinite(windDir) && Number.isFinite(windSpeed)
    ? windComponents(runwayHeading, windDir, windSpeed)
    : { headwind: 0, crosswind: 0 };

  let windFactorDist;
  if (components.headwind < 0) {
    windFactorDist = 1 + 0.05 * ((-components.headwind) / 5);
  } else {
    windFactorDist = Math.max(0.7, 1 - 0.05 * (components.headwind / 5));
  }

  const factor = daFactorDist * windFactorDist * weightFactorDist;

  return {
    groundRollFt: Math.round(aircraft.baseTakeoffRollFt * factor),
    fiftyFtDistanceFt: Math.round(aircraft.baseTakeoff50Ft * factor),
    daFactorDist,
    windFactorDist,
  };
}

function calculateLandingDistance({ tempC, qnhHpa, fieldElevFt, windDir, windSpeed, runwayHeading }) {
  const aircraft = currentAircraft();
  const { da } = densityAltitudeForField(tempC, qnhHpa, fieldElevFt);
  const daFactor = Math.max(0.85, 1 + 0.025 * (da / 1000));
  const components = Number.isFinite(windDir) && Number.isFinite(windSpeed)
    ? windComponents(runwayHeading, windDir, windSpeed)
    : { headwind: 0, crosswind: 0 };

  let windFactor;
  if (components.headwind < 0) {
    windFactor = 1 + 0.10 * ((-components.headwind) / 2);
  } else {
    windFactor = Math.max(0.65, 1 - 0.10 * (components.headwind / 5));
  }

  const factor = daFactor * windFactor;
  return {
    groundRollFt: Math.round(aircraft.baseLandingRollFt * factor),
    fiftyFtDistanceFt: Math.round(aircraft.baseLanding50Ft * factor),
    da,
    components,
  };
}

function densityAltitudeForField(tempC, qnhHpa, fieldElevFt) {
  const qnh = Number.isFinite(qnhHpa) ? qnhHpa : 1013;
  const elev = Number.isFinite(fieldElevFt) ? fieldElevFt : 0;
  const pa = elev + (1013 - qnh) * 30;
  const isaTemp = 15 - 2 * (elev / 1000);
  return {
    pa,
    isaTemp,
    da: pa + 120 * ((Number.isFinite(tempC) ? tempC : 15) - isaTemp),
  };
}

function estimateQnhFromSurfacePressure(surfacePressureHpa, elevFt) {
  if (!Number.isFinite(surfacePressureHpa)) return null;
  const elevM = (Number.isFinite(elevFt) ? elevFt : 0) * FT_TO_M;
  return Math.round(surfacePressureHpa / Math.pow(1 - (elevM / 44330), 5.255));
}

function extractTemp(rawText) {
  const match = rawText?.match(/\s(M?\d{2})\/M?\d{2}\s/);
  if (!match) return null;
  return match[1].startsWith("M")
    ? -Number(match[1].slice(1))
    : Number(match[1]);
}

function extractQnh(rawText) {
  const qnh = rawText?.match(/\bQ(\d{4})\b/);
  if (qnh) return Number(qnh[1]);
  const altimeter = rawText?.match(/\bA(\d{4})\b/);
  if (!altimeter) return null;
  const inches = Number(`${altimeter[1].slice(0, 2)}.${altimeter[1].slice(2)}`);
  return Math.round(inches * 33.8639);
}

function formatAge(dateString) {
  if (!dateString) return "--";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function calculateSunset(date, lat, lon, zenith = 90.833) {
  const n = dayOfYear(date);
  const lngHour = lon / 15;
  const t = n + ((18 - lngHour) / 24);
  const meanAnomaly = (0.9856 * t) - 3.289;
  let trueLongitude = meanAnomaly + (1.916 * Math.sin(degToRad(meanAnomaly))) + (0.020 * Math.sin(2 * degToRad(meanAnomaly))) + 282.634;
  trueLongitude = normalizeDegrees(trueLongitude);

  let rightAscension = Math.atan(0.91764 * Math.tan(degToRad(trueLongitude))) * 180 / Math.PI;
  rightAscension = normalizeDegrees(rightAscension);
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
  rightAscension /= 15;

  const sinDeclination = 0.39782 * Math.sin(degToRad(trueLongitude));
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHour = (Math.cos(degToRad(zenith)) - (sinDeclination * Math.sin(degToRad(lat)))) / (cosDeclination * Math.cos(degToRad(lat)));

  if (cosHour < -1 || cosHour > 1) return null;

  const hourAngle = Math.acos(cosHour) * 180 / Math.PI / 15;
  const localMeanTime = hourAngle + rightAscension - (0.06571 * t) - 6.622;
  const utcHour = (localMeanTime - lngHour + 24) % 24;
  const sunset = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0));
  sunset.setUTCMinutes(Math.round(utcHour * 60));
  return sunset;
}

function formatLocalTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSunset() {
  const sunset = calculateSunset(new Date(), LIDE.lat, LIDE.lon);
  if (!sunset) {
    el("sunsetValue").textContent = "--:--";
    el("sunsetDetail").textContent = "Sunset unavailable";
    return;
  }

  const civilEnd = new Date(sunset.getTime() + 30 * 60000);
  const nightEnd = new Date(sunset.getTime() + 60 * 60000);
  el("sunsetValue").textContent = formatLocalTime(sunset);
  el("sunsetDetail").textContent = `+30 ${formatLocalTime(civilEnd)} | +60 ${formatLocalTime(nightEnd)}`;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    return await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchOpenApiText(url) {
  try {
    return await fetchText(url);
  } catch (directError) {
    const proxied = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
    try {
      return await fetchText(proxied);
    } catch (proxyError) {
      throw new Error(`Direct and fallback fetch failed: ${directError.message}; ${proxyError.message}`);
    }
  }
}

function parseAirportsCsv(csv) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.shift()?.split(",") || [];
  const idx = {
    icao: header.indexOf("icao"),
    name: header.indexOf("name"),
    lat: header.indexOf("lat"),
    lon: header.indexOf("lon"),
    elev: header.indexOf("elev_ft"),
  };

  return lines.reduce((db, line) => {
    const cols = line.split(",");
    const icao = cols[idx.icao]?.toUpperCase();
    if (!icao) return db;
    db[icao] = {
      icao,
      name: (cols[idx.name] || icao).replaceAll("_", " "),
      lat: Number(cols[idx.lat]),
      lon: Number(cols[idx.lon]),
      elevFt: Number(cols[idx.elev]),
    };
    return db;
  }, {
    LIDE: { ...LIDE, elevFt: REGGIO_FIELD_ELEV_FT },
    LIMP: { ...LIMP, elevFt: 161 },
  });
}

function csvLineToCells(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function parseRunwayNumber(ident) {
  const match = ident?.match(/^(\d{1,2})/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 1 || value > 36) return null;
  return value;
}

function reciprocalHeading(heading) {
  return normalizeDegrees(heading + 180);
}

function headingFromIdent(ident) {
  const runwayNumber = parseRunwayNumber(ident);
  if (!runwayNumber) return null;
  return runwayNumber === 36 ? 360 : runwayNumber * 10;
}

function buildRunwayEnd(ident, heading, lengthM) {
  if (!ident || /^H/i.test(ident)) return null;
  const fallbackHeading = headingFromIdent(ident);
  const finalHeading = Number.isFinite(heading) ? heading : fallbackHeading;
  if (!Number.isFinite(finalHeading)) return null;
  return {
    runway: ident,
    heading: normalizeDegrees(finalHeading),
    lengthM,
  };
}

function parseRunwaysCsv(csv) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = csvLineToCells(lines.shift() || "");
  const idx = {
    airport: header.indexOf("airport_ident"),
    lengthFt: header.indexOf("length_ft"),
    closed: header.indexOf("closed"),
    leIdent: header.indexOf("le_ident"),
    leHeading: header.indexOf("le_heading_degT"),
    heIdent: header.indexOf("he_ident"),
    heHeading: header.indexOf("he_heading_degT"),
  };
  const runways = {};

  lines.forEach((line) => {
    const cols = csvLineToCells(line);
    const airport = cols[idx.airport]?.toUpperCase();
    if (!airport || cols[idx.closed] === "1") return;
    const lengthFt = Number(cols[idx.lengthFt]);
    if (!Number.isFinite(lengthFt) || lengthFt <= 0) return;
    const lengthM = Math.round(lengthFt * FT_TO_M);
    const leHeading = Number(cols[idx.leHeading]);
    const heHeading = Number(cols[idx.heHeading]);
    const le = buildRunwayEnd(cols[idx.leIdent], leHeading, lengthM);
    const he = buildRunwayEnd(cols[idx.heIdent], heHeading, lengthM);
    const pair = [le, he].filter(Boolean);
    if (pair.length < 2) return;

    if (!runways[airport]) runways[airport] = [];
    runways[airport].push(...pair);
  });

  Object.entries(KNOWN_RUNWAYS).forEach(([icao, runwayList]) => {
    runways[icao] = runwayList;
  });

  return runways;
}

async function loadAirports() {
  if (state.airports) return state.airports;
  try {
    const csv = await fetchText("airports_it.csv");
    state.airports = parseAirportsCsv(csv);
  } catch (error) {
    console.warn("Airport database unavailable, using built-in LIDE/LIMP fallback.", error);
    state.airports = parseAirportsCsv("icao,name,lat,lon,elev_ft\n");
  }
  return state.airports;
}

async function loadRunways() {
  if (state.runways) return state.runways;
  try {
    const csv = await fetchText("runways_it.csv");
    state.runways = parseRunwaysCsv(csv);
  } catch (error) {
    console.warn("Runway database unavailable, using known/fallback runways.", error);
    state.runways = parseRunwaysCsv("airport_ident,length_ft,closed,le_ident,le_heading_degT,he_ident,he_heading_degT\n");
  }
  return state.runways;
}

async function loadPointWeather(airport) {
  const params = new URLSearchParams({
    latitude: airport.lat,
    longitude: airport.lon,
    current: "temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure",
    wind_speed_unit: "kn",
    timezone: "Europe/Rome",
  });
  const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const current = data.current || {};
  const surfacePressure = Number(current.surface_pressure);
  return {
    tempC: Number(current.temperature_2m),
    windDir: Number(current.wind_direction_10m),
    windSpeed: Number(current.wind_speed_10m),
    qnhHpa: estimateQnhFromSurfacePressure(surfacePressure, airport.elevFt),
    time: current.time,
  };
}

async function loadMetarTaf() {
  const metarUrl = "https://aviationweather.gov/api/data/metar?ids=LIMP&format=raw&hours=4";
  const tafUrl = "https://aviationweather.gov/api/data/taf?ids=LIMP&format=raw";
  const [metarData, tafData] = await Promise.all([fetchOpenApiText(metarUrl), fetchOpenApiText(tafUrl)]);
  const metarLines = metarData.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tafText = tafData.trim();

  state.metar = { raw: metarLines[0] || "" };
  state.taf = { raw: tafText };

  el("metarText").textContent = state.metar.raw || "No METAR received.";
  el("tafText").textContent = state.taf.raw || "No TAF received.";
  el("metarAge").textContent = "AviationWeather";
  el("tafAge").textContent = "AviationWeather";
}

async function loadSurfaceWind() {
  if (WINDY_POINT_FORECAST_KEY.trim()) {
    try {
      await loadWindySurfaceWind();
      return;
    } catch (error) {
      console.warn("Windy forecast unavailable, using Open-Meteo fallback.", error);
    }
  }

  const params = new URLSearchParams({
    latitude: LIDE.lat,
    longitude: LIDE.lon,
    current: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "kn",
    timezone: "Europe/Rome",
  });

  const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const current = data.current || {};
  state.surfaceWind = {
    dir: Number(current.wind_direction_10m),
    to: normalizeDegrees(Number(current.wind_direction_10m) + 180),
    speed: Number(current.wind_speed_10m),
    time: current.time,
    source: "Open-Meteo",
  };
}

async function loadWindySurfaceWind() {
  const response = await fetchWithTimeout("https://api.windy.com/api/point-forecast/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat: LIDE.lat,
      lon: LIDE.lon,
      model: "iconEu",
      parameters: ["wind"],
      levels: ["surface"],
      key: WINDY_POINT_FORECAST_KEY.trim(),
    }),
  });

  if (!response.ok) throw new Error(`Windy HTTP ${response.status}`);

  const data = await response.json();
  const timestamps = data.ts || [];
  const windU = data["wind_u-surface"] || [];
  const windV = data["wind_v-surface"] || [];
  const now = Date.now();
  let selectedIndex = 0;

  for (let i = 1; i < timestamps.length; i += 1) {
    if (Math.abs(timestamps[i] - now) < Math.abs(timestamps[selectedIndex] - now)) {
      selectedIndex = i;
    }
  }

  const u = Number(windU[selectedIndex]);
  const v = Number(windV[selectedIndex]);
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    throw new Error("Windy response did not include surface wind vector.");
  }

  const direction = windVectorToDirection(u, v);
  state.surfaceWind = {
    dir: direction.from,
    to: direction.to,
    speed: msToKt(Math.hypot(u, v)),
    time: timestamps[selectedIndex] ? new Date(timestamps[selectedIndex]).toLocaleString() : "now",
    source: "Windy ICON-EU",
  };
}

function setSvgNumber(elm, active) {
  elm.classList.toggle("is-active", active);
}

function formatComponents(components) {
  const split = splitWindComponents(components);
  return {
    hwc: `${split.headwind.toFixed(1)} kt`,
    twc: `${split.tailwind.toFixed(1)} kt`,
    xwc: `${split.crosswind.toFixed(1)} kt`,
  };
}

function updateComponentRows(components) {
  const formatted = formatComponents(components);
  el("hwcValue").textContent = `HWC ${formatted.hwc}`;
  el("twcValue").textContent = `TWC ${formatted.twc}`;
  el("xwcValue").textContent = `XWC ${formatted.xwc}`;
}

function updateTakeoffMarkers(runway, takeoff) {
  const startX = runway.runway === "29" ? 650 : 110;
  const endX = runway.runway === "29" ? 110 : 650;
  const runwayPx = Math.abs(endX - startX);
  const direction = endX > startX ? 1 : -1;
  const groundM = Math.round(takeoff.groundRollFt * FT_TO_M);
  const fiftyM = Math.round(takeoff.fiftyFtDistanceFt * FT_TO_M);
  const groundX = startX + direction * Math.min(runwayPx, (groundM / LIDE_RUNWAY_LENGTH_M) * runwayPx);
  const fiftyX = startX + direction * Math.min(runwayPx, (fiftyM / LIDE_RUNWAY_LENGTH_M) * runwayPx);
  const climbY = 104;

  const groundMarker = el("groundRollMarker");
  const fiftyMarker = el("fiftyFtMarker");
  const groundLabel = el("groundRollSvgLabel");
  const fiftyLabel = el("fiftyFtSvgLabel");
  const climbLine = el("climbLine");
  const airplane = el("airplaneIcon");

  groundMarker.setAttribute("x1", groundX);
  groundMarker.setAttribute("x2", groundX);
  fiftyMarker.setAttribute("x1", fiftyX);
  fiftyMarker.setAttribute("x2", fiftyX);
  groundLabel.setAttribute("x", groundX);
  fiftyLabel.setAttribute("x", fiftyX);
  groundLabel.textContent = `GR ${groundM} m`;
  fiftyLabel.textContent = `50 ft ${fiftyM} m`;
  climbLine.setAttribute("x1", groundX);
  climbLine.setAttribute("y1", 150);
  climbLine.setAttribute("x2", fiftyX);
  climbLine.setAttribute("y2", climbY);
  airplane.setAttribute("transform", `translate(${groundX} 150) rotate(${direction === 1 ? 0 : 180})`);
}

function updateRunwaySvg(runway, takeoff) {
  const rwy11 = el("svgRwy11");
  const rwy29 = el("svgRwy29");
  setSvgNumber(rwy11, !runway.calm && runway.runway === "11");
  setSvgNumber(rwy29, !runway.calm && runway.runway === "29");

  updateTakeoffMarkers(runway, takeoff);
  updateComponentRows(runway.components);
}

function updateWindArrow(windDir) {
  const vector = el("windVector");
  const label = el("windSvgLabel");
  const windSpeed = state.surfaceWind?.speed;
  if (!Number.isFinite(windDir)) {
    vector.style.opacity = "0.2";
    label.textContent = "--- / -- kt";
    return;
  }

  const blowingTo = Number.isFinite(state.surfaceWind?.to)
    ? state.surfaceWind.to
    : normalizeDegrees(windDir + 180);
  vector.style.opacity = Number.isFinite(windSpeed) && windSpeed < 3 ? "0.42" : "1";
  vector.style.transform = `rotate(${blowingTo - 180}deg)`;
  label.textContent = Number.isFinite(windSpeed)
    ? `${Math.round(windDir).toString().padStart(3, "0")} / ${Math.round(windSpeed)} kt`
    : `${Math.round(windDir).toString().padStart(3, "0")} / -- kt`;
}

function initAircraftUi() {
  state.aircraft = getSelectedAircraft();
  document.title = `${state.aircraft.label} Briefing`;
  el("pageTitle").textContent = `LIDE Wx - ${state.aircraft.label}`;
  el("pageSubhead").textContent = state.aircraft.pageSubhead;
  el("aircraftChip").textContent = state.aircraft.label;
  const airportPanelLabel = document.querySelector(".airport-tool .panel-header span");
  if (airportPanelLabel) airportPanelLabel.textContent = `${state.aircraft.label} MTOW ${state.aircraft.mtowLb} lb`;
}

function renderBriefing() {
  const aircraft = currentAircraft();
  const metarRaw = state.metar?.raw || "";
  const tempC = extractTemp(metarRaw);
  const qnhHpa = extractQnh(metarRaw);
  const windDir = state.surfaceWind?.dir;
  const windSpeed = state.surfaceWind?.speed;
  const runway = chooseRunway(windDir, windSpeed);
  const safety = calculateSafetyAltitude({
    tempC,
    qnhHpa,
    windDir,
    windSpeed,
    runwayHeading: runway.heading,
  });
  const takeoff = calculateTakeoffDistance({
    tempC,
    qnhHpa,
    windDir,
    windSpeed,
    runwayHeading: runway.heading,
  });

  if (Number.isFinite(windDir) && Number.isFinite(windSpeed)) {
    el("windValue").textContent = `${Math.round(windDir).toString().padStart(3, "0")}/${Math.round(windSpeed)} kt`;
    el("windDetail").textContent = `${state.surfaceWind?.source || "Wind"} at LIDE, ${state.surfaceWind?.time || "now"}`;
  } else {
    el("windValue").textContent = "--";
    el("windDetail").textContent = "Surface wind unavailable";
  }
  el("qnhValue").textContent = Number.isFinite(qnhHpa) ? `QNH ${qnhHpa}` : "QNH --";

  el("runwayValue").textContent = runway.runway;
  el("runwayDetail").textContent = runway.calm
    ? "Preferred RWY 11 for wind below 3 kt"
    : `RWY ${runway.runway} gives the best headwind component`;

  el("safetyValue").textContent = `${safety.rounded} ft`;
  el("safetyDetail").textContent = safety.rounded < MIN_SAFETY_ALT_FT
    ? `Calculated below minimum. Use minimum ${MIN_SAFETY_ALT_FT} ft.`
    : `Use calculated value. Minimum is ${MIN_SAFETY_ALT_FT} ft.`;

  el("groundRollValue").textContent = `${Math.round(takeoff.groundRollFt * FT_TO_M)} m`;
  el("groundRollDetail").textContent = `${takeoff.groundRollFt} ft. Base ${aircraft.baseTakeoffRollFt} ft, corrected for DA and wind`;
  el("fiftyFtValue").textContent = `${Math.round(takeoff.fiftyFtDistanceFt * FT_TO_M)} m`;
  el("fiftyFtDetail").textContent = `${takeoff.fiftyFtDistanceFt} ft. Base ${aircraft.baseTakeoff50Ft} ft, corrected for DA and wind`;

  el("runwayAdvice").textContent = runway.calm
    ? "Light wind: preferred RWY 11"
    : `Use RWY ${runway.runway} if traffic and conditions allow`;
  el("componentText").textContent = runway.calm
    ? "Wind is below 3 kt. The display keeps both runway numbers black and uses RWY 11 as the preferred runway."
    : `Headwind ${safety.headwind.toFixed(1)} kt, crosswind ${Math.abs(safety.crosswind).toFixed(1)} kt. Wind angle ${Math.round(angularDifference(runway.heading, windDir))} deg from runway heading.`;

  el("calcText").textContent =
    `${aircraft.label}. MTOW fixed at ${aircraft.mtowLb} lb. Field elevation ${REGGIO_FIELD_ELEV_FT} ft. ` +
    `Temp ${Number.isFinite(tempC) ? tempC : 15} C, QNH ${Number.isFinite(qnhHpa) ? qnhHpa : 1013} hPa. ` +
    `Pressure altitude ${Math.round(safety.pa)} ft, density altitude ${Math.round(safety.da)} ft. ` +
    `Safety altitude uses the selected aircraft profile with a ${aircraft.baseSafetyFt} ft baseline, adjusted for density altitude and headwind/tailwind. ` +
    `Takeoff distance uses ${aircraft.baseTakeoffRollFt} ft ground roll and ${aircraft.baseTakeoff50Ft} ft over 50 ft, corrected for density altitude and wind. ${aircraft.sourceNote}`;

  updateRunwaySvg(runway, takeoff);
  updateWindArrow(windDir);
}

async function calculateAirportLanding() {
  const aircraft = currentAircraft();
  const input = el("airportIcao");
  const icao = (input.value || "").trim().toUpperCase();
  input.value = icao;

  if (!/^[A-Z]{4}$/.test(icao)) {
    el("airportWeatherValue").textContent = "Insert a valid 4-letter ICAO code.";
    return;
  }

  el("airportWeatherValue").textContent = `Loading ${icao} weather...`;
  const [airports] = await Promise.all([loadAirports(), loadRunways()]);
  const airport = airports[icao];

  if (!airport || !Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) {
    el("airportWeatherValue").textContent = `${icao} not found in airports_it.csv.`;
    return;
  }

  const weather = await loadPointWeather(airport);
  const runways = getAirportRunways(airport, weather.windDir);
  const runway = chooseBestRunway(
    runways,
    weather.windDir,
    weather.windSpeed,
    runways[0],
  );
  const landing = calculateLandingDistance({
    tempC: weather.tempC,
    qnhHpa: weather.qnhHpa,
    fieldElevFt: airport.elevFt,
    windDir: weather.windDir,
    windSpeed: weather.windSpeed,
    runwayHeading: runway.heading,
  });
  const formatted = formatComponents(landing.components);
  const landingRollM = Math.round(landing.groundRollFt * FT_TO_M);
  const landing50M = Math.round(landing.fiftyFtDistanceFt * FT_TO_M);

  el("airportRunwayValue").textContent = runway.calm ? `${runway.runway} pref` : runway.runway;
  el("airportLandingRollValue").textContent = `${landingRollM} m`;
  el("airportLanding50Value").textContent = `${landing50M} m`;
  el("airportHwcValue").textContent = `HWC ${formatted.hwc}`;
  el("airportTwcValue").textContent = `TWC ${formatted.twc}`;
  el("airportXwcValue").textContent = `XWC ${formatted.xwc}`;
  el("airportWeatherValue").textContent =
    `${airport.name} (${airport.icao}) elev ${Math.round(airport.elevFt || 0)} ft. ` +
    `T ${Number.isFinite(weather.tempC) ? weather.tempC.toFixed(0) : "--"} C, ` +
    `QNH ${Number.isFinite(weather.qnhHpa) ? weather.qnhHpa : "--"}, ` +
    `wind ${Number.isFinite(weather.windDir) ? Math.round(weather.windDir).toString().padStart(3, "0") : "---"}/` +
    `${Number.isFinite(weather.windSpeed) ? Math.round(weather.windSpeed) : "--"} kt. ` +
    `Landing estimate uses ${aircraft.label} MTOW ${aircraft.mtowLb} lb, base ${aircraft.baseLandingRollFt} ft roll / ${aircraft.baseLanding50Ft} ft over 50 ft.`;
}

async function loadAirportReports() {
  const input = el("reportsIcao");
  const icao = (input.value || "").trim().toUpperCase();
  input.value = icao;

  if (!/^[A-Z]{4}$/.test(icao)) {
    el("airportReportsStatus").textContent = "Use a valid 4-letter ICAO.";
    return;
  }

  el("airportReportsStatus").textContent = `Loading ${icao} reports...`;
  const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=raw&hours=4`;
  const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${icao}&format=raw`;

  const [metarResult, tafResult] = await Promise.allSettled([
    fetchOpenApiText(metarUrl),
    fetchOpenApiText(tafUrl),
  ]);

  const metarText = metarResult.status === "fulfilled"
    ? metarResult.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || "No METAR received."
    : "METAR unavailable.";
  const tafText = tafResult.status === "fulfilled"
    ? tafResult.value.trim() || "No TAF received."
    : "TAF unavailable.";

  el("airportMetarTitle").textContent = `METAR ${icao}`;
  el("airportTafTitle").textContent = `TAF ${icao}`;
  el("airportMetarText").textContent = metarText;
  el("airportTafText").textContent = tafText;
  el("airportMetarAge").textContent = "AviationWeather";
  el("airportTafAge").textContent = "AviationWeather";
  el("airportReportsStatus").textContent = `Loaded ${icao} reports`;
}

function refreshSwllFrame() {
  const frame = el("swllFrame");
  const url = new URL("https://www.meteoam.it/it/swll");
  url.searchParams.set("refresh", Date.now().toString());
  frame.src = url.toString();
}

async function refreshBriefing() {
  el("refreshStatus").textContent = "Updating...";
  const results = await Promise.allSettled([loadMetarTaf(), loadSurfaceWind()]);
  const failed = results.filter((result) => result.status === "rejected");

  if (!state.metar) {
    el("metarText").textContent = "METAR unavailable from the open AviationWeather.gov API.";
  }

  if (!state.taf) {
    el("tafText").textContent = "TAF unavailable from the open AviationWeather.gov API.";
  }

  renderBriefing();
  renderSunset();
  refreshSwllFrame();

  if (failed.length) {
    el("refreshStatus").textContent = "Updated with fallback data";
    failed.forEach((result) => console.error(result.reason));
  } else {
    el("refreshStatus").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
}

initAircraftUi();
updateClock();
renderSunset();
refreshBriefing();
loadAirportReports().catch((error) => {
  console.error(error);
  el("airportReportsStatus").textContent = "Unable to load airport reports.";
});
el("airportCalcButton").addEventListener("click", () => {
  calculateAirportLanding().catch((error) => {
    console.error(error);
    el("airportWeatherValue").textContent = "Unable to load airport weather for this ICAO.";
  });
});
el("airportIcao").addEventListener("keydown", (event) => {
  if (event.key === "Enter") el("airportCalcButton").click();
});
el("loadReportsButton").addEventListener("click", () => {
  loadAirportReports().catch((error) => {
    console.error(error);
    el("airportReportsStatus").textContent = "Unable to load airport reports.";
  });
});
el("reportsIcao").addEventListener("keydown", (event) => {
  if (event.key === "Enter") el("loadReportsButton").click();
});
setInterval(updateClock, 1000);
setInterval(refreshBriefing, 30 * 60 * 1000);
