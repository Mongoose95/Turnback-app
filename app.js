const LIMP = { id: "LIMP", name: "Parma", lat: 44.8245, lon: 10.2964 };
const LIDE = { id: "LIDE", name: "Reggio Emilia", lat: 44.698, lon: 10.665 };
const WINDY_POINT_FORECAST_KEY = "";
const REGGIO_FIELD_ELEV_FT = 152;
const MTOW_LB = 2300;
const MIN_SAFETY_ALT_FT = 900;
const RWY_11 = 109;
const RWY_29 = 289;
const BASE_GROUND_ROLL_FT = 835;
const BASE_50_FT_DISTANCE_FT = 1475;
const FT_TO_M = 0.3048;

const state = {
  surfaceWind: null,
  metar: null,
  taf: null,
};

const el = (id) => document.getElementById(id);

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
  const baseSafety = 900;
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
    groundRollFt: Math.round(BASE_GROUND_ROLL_FT * factor),
    fiftyFtDistanceFt: Math.round(BASE_50_FT_DISTANCE_FT * factor),
    daFactorDist,
    windFactorDist,
  };
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

function updateRunwaySvg(runway) {
  const rwy11 = el("svgRwy11");
  const rwy29 = el("svgRwy29");
  rwy11.classList.remove("is-active");
  rwy29.classList.remove("is-active");

  if (runway.calm) return;
  if (runway.runway === "11") rwy11.classList.add("is-active");
  if (runway.runway === "29") rwy29.classList.add("is-active");
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

function renderBriefing() {
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
  el("groundRollDetail").textContent = `${takeoff.groundRollFt} ft. Base ${BASE_GROUND_ROLL_FT} ft, corrected for DA and wind`;
  el("fiftyFtValue").textContent = `${Math.round(takeoff.fiftyFtDistanceFt * FT_TO_M)} m`;
  el("fiftyFtDetail").textContent = `${takeoff.fiftyFtDistanceFt} ft. Base ${BASE_50_FT_DISTANCE_FT} ft, corrected for DA and wind`;

  el("runwayAdvice").textContent = runway.calm
    ? "Light wind: preferred RWY 11"
    : `Use RWY ${runway.runway} if traffic and conditions allow`;
  el("componentText").textContent = runway.calm
    ? "Wind is below 3 kt. The display keeps both runway numbers black and uses RWY 11 as the preferred runway."
    : `Headwind ${safety.headwind.toFixed(1)} kt, crosswind ${Math.abs(safety.crosswind).toFixed(1)} kt. Wind angle ${Math.round(angularDifference(runway.heading, windDir))} deg from runway heading.`;

  el("calcText").textContent =
    `MTOW fixed at ${MTOW_LB} lb. Field elevation ${REGGIO_FIELD_ELEV_FT} ft. ` +
    `Temp ${Number.isFinite(tempC) ? tempC : 15} C, QNH ${Number.isFinite(qnhHpa) ? qnhHpa : 1013} hPa. ` +
    `Pressure altitude ${Math.round(safety.pa)} ft, density altitude ${Math.round(safety.da)} ft. ` +
    `Safety altitude formula follows the previous app: base 900 ft adjusted for density altitude and headwind/tailwind, then never below 900 ft. ` +
    `Takeoff distance uses the previous app base values: ${BASE_GROUND_ROLL_FT} ft ground roll and ${BASE_50_FT_DISTANCE_FT} ft over 50 ft, corrected for density altitude and wind.`;

  updateRunwaySvg(runway);
  updateWindArrow(windDir);
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

updateClock();
renderSunset();
refreshBriefing();
setInterval(updateClock, 1000);
setInterval(refreshBriefing, 30 * 60 * 1000);
