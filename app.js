const LIMP = { id: "LIMP", name: "Parma", lat: 44.8245, lon: 10.2964 };
const LIDE = { id: "LIDE", name: "Reggio Emilia", lat: 44.698833, lon: 10.665 };
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
    loading: {
      emptyWeightLb: 1518.46,
      emptyMomentInLb: 60050,
      fuelArmIn: 47.8,
      maxFuelGal: 40,
      fuelBurnArmIn: 47.8,
      frontSeatArmIn: 37,
      rearSeatArmIn: 73,
      includeFrontPassenger: true,
      includeRearPassengers: true,
      includeBaggage: false,
      reference: "From the uploaded C172M loading sheet for I-CLLO.",
    },
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
    loading: {
      emptyWeightLb: 1122.85,
      emptyMomentInLb: 36000,
      oilWeightLb: 11,
      oilMomentInLb: -100,
      fuelArmIn: 42.2,
      maxFuelGal: 22.5,
      fuelBurnArmIn: 42.2,
      frontSeatArmIn: 39,
      baggage1ArmIn: 64,
      baggage2ArmIn: 84,
      baggage1MaxLb: 120,
      baggage2MaxLb: 40,
      includeFrontPassenger: true,
      includeRearPassengers: false,
      includeBaggage: true,
      reference: "From the uploaded C150L loading sheet for I-MRVE.",
    },
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
    loading: {
      emptyWeightLb: 1285,
      emptyMomentInLb: 17308,
      fuelArmIn: 26.04,
      maxFuelGal: 20,
      fuelBurnArmIn: 26.04,
      frontSeatArmIn: 15.92,
      rearSeatArmIn: 44.74,
      includeFrontPassenger: false,
      includeRearPassengers: true,
      includeBaggage: false,
      reference: "Using the sample airplane loading data from the uploaded 8KCAB POH.",
    },
  },
  fr172j: {
    id: "fr172j",
    label: "Reims Rocket FR172J",
    pageTitle: "LIDE Wx",
    pageSubhead: "FR172J performance profile active with the same live weather and airport tools.",
    mtowLb: 2551,
    baseSafetyFt: 1000,
    baseTakeoffRollFt: 741,
    baseTakeoff50Ft: 1230,
    baseLandingRollFt: 620,
    baseLanding50Ft: 1270,
    sourceNote: "From the uploaded FR172J Reims Rocket flight manual: takeoff and landing performance at 1157 kg, sea level, standard conditions, hard surface.",
    loading: {
      emptyWeightLb: 1494.07,
      emptyMomentInLb: 55636.34,
      oilWeightLb: 18.74,
      oilMomentInLb: -433.98,
      fuelArmIn: 48.11,
      maxFuelGal: 46,
      fuelBurnArmIn: 48.11,
      frontSeatArmIn: 37.02,
      rearSeatArmIn: 72.77,
      baggage1ArmIn: 108,
      baggage1MaxLb: 200,
      includeFrontPassenger: true,
      includeRearPassengers: true,
      includeBaggage: true,
      reference: "Using the sample loading problem and loading arrangement from the uploaded FR172J flight manual. Replace with the aircraft-specific weighing sheet when available.",
    },
  },
};
const LIDE_RUNWAY_LENGTH_M = 1210;
const FT_TO_M = 0.3048;
const WEIGHT_DATA_KEY = "lide_wx_weight_data_v1";
const WIND_CACHE_KEY = "lide_wx_surface_wind_v1";
const WIND_CACHE_TTL_MS = 30 * 60 * 1000;

const state = {
  aircraft: null,
  loadData: null,
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

function currentLoadingProfile() {
  return currentAircraft().loading || {};
}

function readStoredLoads() {
  try {
    return JSON.parse(window.sessionStorage.getItem(WEIGHT_DATA_KEY) || "{}");
  } catch (error) {
    console.warn("Unable to read stored load data", error);
    return {};
  }
}

function storeLoadData(aircraftId, data) {
  const existing = readStoredLoads();
  existing[aircraftId] = data;
  window.sessionStorage.setItem(WEIGHT_DATA_KEY, JSON.stringify(existing));
}

function getStoredLoadData(aircraftId) {
  return readStoredLoads()[aircraftId] || null;
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(max, Math.max(min, numeric));
}

function poundsFromGallons(gallons) {
  return clampNumber(gallons) * 6;
}

function momentFrom(weightLb, armIn) {
  if (!Number.isFinite(weightLb) || !Number.isFinite(armIn)) return 0;
  return weightLb * armIn;
}

function defaultLoadInputs(profile) {
  return {
    pilotLb: 77,
    frontPassengerLb: profile.loading?.includeFrontPassenger ? 0 : 0,
    rearPassengersLb: profile.loading?.includeRearPassengers ? 0 : 0,
    baggage1Lb: profile.loading?.includeBaggage ? 0 : 0,
    baggage2Lb: profile.loading?.includeBaggage ? 0 : 0,
    fuelTakeoffGal: profile.loading?.maxFuelGal || 0,
    fuelLandingGal: Math.min(10, profile.loading?.maxFuelGal || 0),
  };
}

function buildLoadData(profile, inputs) {
  const loading = profile.loading || {};
  const safeInputs = {
    pilotLb: clampNumber(inputs.pilotLb),
    frontPassengerLb: clampNumber(inputs.frontPassengerLb),
    rearPassengersLb: clampNumber(inputs.rearPassengersLb),
    baggage1Lb: clampNumber(inputs.baggage1Lb, 0, loading.baggage1MaxLb || Number.POSITIVE_INFINITY),
    baggage2Lb: clampNumber(inputs.baggage2Lb, 0, loading.baggage2MaxLb || Number.POSITIVE_INFINITY),
    fuelTakeoffGal: clampNumber(inputs.fuelTakeoffGal, 0, loading.maxFuelGal || Number.POSITIVE_INFINITY),
    fuelLandingGal: clampNumber(inputs.fuelLandingGal, 0, loading.maxFuelGal || Number.POSITIVE_INFINITY),
  };
  safeInputs.fuelLandingGal = Math.min(safeInputs.fuelLandingGal, safeInputs.fuelTakeoffGal);

  const fuelTakeoffLb = poundsFromGallons(safeInputs.fuelTakeoffGal);
  const fuelLandingLb = poundsFromGallons(safeInputs.fuelLandingGal);
  const fixedWeight = clampNumber(loading.emptyWeightLb) + clampNumber(loading.oilWeightLb);
  const fixedMoment = clampNumber(loading.emptyMomentInLb) + clampNumber(loading.oilMomentInLb, -100000, 100000);

  const peopleTakeoffWeight = safeInputs.pilotLb + safeInputs.frontPassengerLb + safeInputs.rearPassengersLb + safeInputs.baggage1Lb + safeInputs.baggage2Lb;
  const takeoffMoment =
    fixedMoment +
    momentFrom(safeInputs.pilotLb, loading.frontSeatArmIn) +
    momentFrom(safeInputs.frontPassengerLb, loading.frontSeatArmIn) +
    momentFrom(safeInputs.rearPassengersLb, loading.rearSeatArmIn) +
    momentFrom(safeInputs.baggage1Lb, loading.baggage1ArmIn) +
    momentFrom(safeInputs.baggage2Lb, loading.baggage2ArmIn) +
    momentFrom(fuelTakeoffLb, loading.fuelArmIn);
  const landingMoment =
    fixedMoment +
    momentFrom(safeInputs.pilotLb, loading.frontSeatArmIn) +
    momentFrom(safeInputs.frontPassengerLb, loading.frontSeatArmIn) +
    momentFrom(safeInputs.rearPassengersLb, loading.rearSeatArmIn) +
    momentFrom(safeInputs.baggage1Lb, loading.baggage1ArmIn) +
    momentFrom(safeInputs.baggage2Lb, loading.baggage2ArmIn) +
    momentFrom(fuelLandingLb, loading.fuelBurnArmIn || loading.fuelArmIn);
  const takeoffWeightLb = fixedWeight + peopleTakeoffWeight + fuelTakeoffLb;
  const landingWeightLb = fixedWeight + peopleTakeoffWeight + fuelLandingLb;

  return {
    inputs: safeInputs,
    takeoffWeightLb,
    landingWeightLb,
    takeoffMomentInLb: takeoffMoment,
    landingMomentInLb: landingMoment,
    takeoffCgIn: takeoffWeightLb > 0 ? takeoffMoment / takeoffWeightLb : null,
    landingCgIn: landingWeightLb > 0 ? landingMoment / landingWeightLb : null,
    fuelBurnLb: fuelTakeoffLb - fuelLandingLb,
    overMtow: takeoffWeightLb > profile.mtowLb,
    loadingNote: loading.reference || "",
  };
}

function ensureLoadData() {
  if (state.loadData) return state.loadData;
  const profile = currentAircraft();
  const stored = getStoredLoadData(profile.id);
  state.loadData = buildLoadData(profile, stored?.inputs || defaultLoadInputs(profile));
  return state.loadData;
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

function angularDifference(a, b) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return diff > 180 ? 360 - diff : diff;
}

function readWindCache() {
  try {
    const raw = window.localStorage.getItem(WIND_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || typeof cached !== "object") return null;
    if (!Number.isFinite(cached.cachedAt)) return null;
    if (Date.now() - cached.cachedAt > WIND_CACHE_TTL_MS) return null;
    if (!cached.data || typeof cached.data !== "object") return null;
    return cached.data;
  } catch (error) {
    console.warn("Unable to read cached wind", error);
    return null;
  }
}

function writeWindCache(data) {
  try {
    window.localStorage.setItem(WIND_CACHE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      data,
    }));
  } catch (error) {
    console.warn("Unable to cache wind", error);
  }
}

function weightedWindAverage(directions, speeds) {
  let u = 0;
  let v = 0;
  let total = 0;

  directions.forEach((direction, index) => {
    const speed = speeds[index];
    if (!Number.isFinite(direction) || !Number.isFinite(speed) || speed <= 0) return;
    const radians = degToRad(direction);
    u += Math.sin(radians) * speed;
    v += Math.cos(radians) * speed;
    total += speed;
  });

  if (total === 0) return null;
  return {
    direction: normalizeDegrees(Math.atan2(u, v) * 180 / Math.PI),
    speed: total / directions.filter((_, index) => Number.isFinite(speeds[index]) && speeds[index] > 0).length,
  };
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
  const aircraft = currentAircraft();
  const load = ensureLoadData();
  const baseSafety = aircraft.baseSafetyFt;
  const { pa, isaTemp, da } = densityAltitude(tempC, qnhHpa);
  const daDiff = da - REGGIO_FIELD_ELEV_FT;
  const daFactorSafety = 1 + 0.10 * (daDiff / 1000);
  const weightRatio = clampNumber(load.takeoffWeightLb, 1) / aircraft.mtowLb;
  const weightFactorSafety = Math.max(0.82, 0.86 + (0.14 * weightRatio));
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
  const load = ensureLoadData();
  const { da } = densityAltitude(tempC, qnhHpa);
  const daDiff = da - REGGIO_FIELD_ELEV_FT;
  const daFactorDist = 1 + 0.12 * (daDiff / 1000);
  const weightRatio = clampNumber(load.takeoffWeightLb, 1) / aircraft.mtowLb;
  const weightFactorDist = Math.max(0.6, Math.pow(weightRatio, 1.7));
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
  const load = ensureLoadData();
  const { da } = densityAltitudeForField(tempC, qnhHpa, fieldElevFt);
  const daFactor = Math.max(0.85, 1 + 0.025 * (da / 1000));
  const weightRatio = clampNumber(load.landingWeightLb, 1) / aircraft.mtowLb;
  const components = Number.isFinite(windDir) && Number.isFinite(windSpeed)
    ? windComponents(runwayHeading, windDir, windSpeed)
    : { headwind: 0, crosswind: 0 };

  let windFactor;
  if (components.headwind < 0) {
    windFactor = 1 + 0.10 * ((-components.headwind) / 2);
  } else {
    windFactor = Math.max(0.65, 1 - 0.10 * (components.headwind / 5));
  }

  const weightFactor = Math.max(0.65, Math.pow(weightRatio, 1.7));
  const factor = daFactor * windFactor * weightFactor;
  return {
    groundRollFt: Math.round(aircraft.baseLandingRollFt * factor),
    fiftyFtDistanceFt: Math.round(aircraft.baseLanding50Ft * factor),
    da,
    components,
    weightFactor,
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

function unwrapJinaProxyText(text) {
  const marker = "Markdown Content:";
  const idx = text.indexOf(marker);
  if (idx < 0) return text.trim();
  return text.slice(idx + marker.length).trim();
}

async function fetchOpenApiText(url) {
  try {
    return await fetchText(url);
  } catch (directError) {
    const proxied = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
    try {
      const proxiedText = await fetchText(proxied);
      return unwrapJinaProxyText(proxiedText);
    } catch (proxyError) {
      throw new Error(`Direct and fallback fetch failed: ${directError.message}; ${proxyError.message}`);
    }
  }
}

function firstNonEmptyLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}

function formatAviationReport(rawText, reportType, icao) {
  const cleanText = (rawText || "").trim();
  if (cleanText) return cleanText;
  return reportType === "METAR"
    ? `No ${reportType} published for ${icao}.`
    : `No ${reportType} available for ${icao}.`;
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
  state.metar = { raw: firstNonEmptyLine(metarData) };
  state.taf = { raw: tafData.trim() };

  el("metarText").textContent = formatAviationReport(state.metar.raw, "METAR", "LIMP");
  el("tafText").textContent = formatAviationReport(state.taf.raw, "TAF", "LIMP");
  el("metarAge").textContent = "AviationWeather";
  el("tafAge").textContent = "AviationWeather";
}

async function loadSurfaceWind() {
  const cachedWind = readWindCache();
  if (cachedWind) {
    state.surfaceWind = cachedWind;
    return;
  }

  const params = new URLSearchParams({
    latitude: LIDE.lat,
    longitude: LIDE.lon,
    current: "wind_speed_10m,wind_direction_10m",
    hourly: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "kn",
    timezone: "Europe/Rome",
    forecast_days: "1",
  });

  const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const current = data.current || {};
  const hourly = data.hourly || {};
  const currentHour = current.time;
  let stableWind = null;

  if (Array.isArray(hourly.time)) {
    const hourIndex = hourly.time.findIndex((time) => time === currentHour);
    if (hourIndex >= 0) {
      const indices = [Math.max(0, hourIndex - 1), hourIndex, Math.min(hourly.time.length - 1, hourIndex + 1)];
      stableWind = weightedWindAverage(
        indices.map((index) => Number(hourly.wind_direction_10m?.[index])),
        indices.map((index) => Number(hourly.wind_speed_10m?.[index])),
      );
    }
  }

  const speed = Number.isFinite(stableWind?.speed) ? stableWind.speed : Number(current.wind_speed_10m);
  const direction = Number.isFinite(stableWind?.direction) ? stableWind.direction : Number(current.wind_direction_10m);
  const variable = Number.isFinite(speed) && speed < 4;
  state.surfaceWind = {
    dir: variable ? null : direction,
    to: variable ? null : normalizeDegrees(direction + 180),
    speed,
    variable,
    rawDirection: direction,
    time: current.time,
    source: "Open-Meteo hourly",
  };
  writeWindCache(state.surfaceWind);
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
  vector.style.opacity = state.surfaceWind?.variable ? "0.2" : "1";
  vector.style.transform = `rotate(${blowingTo - 180}deg)`;
  label.textContent = state.surfaceWind?.variable
    ? `VRB / ${Math.round(windSpeed || 0)} kt`
    : Number.isFinite(windSpeed)
    ? `${Math.round(windDir).toString().padStart(3, "0")} / ${Math.round(windSpeed)} kt`
    : `${Math.round(windDir).toString().padStart(3, "0")} / -- kt`;
}

function initAircraftUi() {
  state.aircraft = getSelectedAircraft();
  state.loadData = null;
  ensureLoadData();
  document.title = `${state.aircraft.label} Briefing`;
  el("pageTitle").textContent = `LIDE Wx - ${state.aircraft.label}`;
  el("pageSubhead").textContent = state.aircraft.pageSubhead;
  el("aircraftChip").textContent = state.aircraft.label;
  const airportPanelLabel = document.querySelector(".airport-tool .panel-header span");
  if (airportPanelLabel) airportPanelLabel.textContent = `${state.aircraft.label} MTOW ${state.aircraft.mtowLb} lb`;
}

function setWeightFieldValue(id, value) {
  const field = el(id);
  if (field) field.value = Number.isFinite(value) ? String(value) : "0";
}

function toggleWeightRow(id, visible) {
  const row = el(id);
  if (row) row.hidden = !visible;
}

function hasPositiveLimit(value) {
  return Number.isFinite(value) && value > 0;
}

function readWeightInputsFromPage() {
  return {
    pilotLb: clampNumber(el("pilotLb")?.value),
    frontPassengerLb: clampNumber(el("frontPassengerLb")?.value),
    rearPassengersLb: clampNumber(el("rearPassengersLb")?.value),
    baggage1Lb: clampNumber(el("baggage1Lb")?.value),
    baggage2Lb: clampNumber(el("baggage2Lb")?.value),
    fuelTakeoffGal: clampNumber(el("fuelTakeoffGal")?.value),
    fuelLandingGal: clampNumber(el("fuelLandingGal")?.value),
  };
}

function writeWeightInputsToPage(inputs) {
  setWeightFieldValue("pilotLb", inputs.pilotLb);
  setWeightFieldValue("frontPassengerLb", inputs.frontPassengerLb);
  setWeightFieldValue("rearPassengersLb", inputs.rearPassengersLb);
  setWeightFieldValue("baggage1Lb", inputs.baggage1Lb);
  setWeightFieldValue("baggage2Lb", inputs.baggage2Lb);
  setWeightFieldValue("fuelTakeoffGal", inputs.fuelTakeoffGal);
  setWeightFieldValue("fuelLandingGal", inputs.fuelLandingGal);
}

function fitInputsToMtow(profile, inputs) {
  const loading = profile.loading || {};
  const safeInputs = {
    ...defaultLoadInputs(profile),
    ...inputs,
  };
  const fixedWeight = clampNumber(loading.emptyWeightLb) + clampNumber(loading.oilWeightLb);
  const payloadWeight =
    clampNumber(safeInputs.pilotLb) +
    clampNumber(safeInputs.frontPassengerLb) +
    clampNumber(safeInputs.rearPassengersLb) +
    clampNumber(safeInputs.baggage1Lb, 0, loading.baggage1MaxLb || Number.POSITIVE_INFINITY) +
    clampNumber(safeInputs.baggage2Lb, 0, loading.baggage2MaxLb || Number.POSITIVE_INFINITY);
  const availableFuelLb = Math.max(0, profile.mtowLb - fixedWeight - payloadWeight);
  const maxFuelGal = clampNumber(loading.maxFuelGal);
  const targetFuelGal = Math.min(maxFuelGal, availableFuelLb / 6);
  const existingBurnGal = Math.max(0, clampNumber(safeInputs.fuelTakeoffGal) - clampNumber(safeInputs.fuelLandingGal));

  return {
    pilotLb: clampNumber(safeInputs.pilotLb),
    frontPassengerLb: clampNumber(safeInputs.frontPassengerLb),
    rearPassengersLb: clampNumber(safeInputs.rearPassengersLb),
    baggage1Lb: clampNumber(safeInputs.baggage1Lb, 0, loading.baggage1MaxLb || Number.POSITIVE_INFINITY),
    baggage2Lb: clampNumber(safeInputs.baggage2Lb, 0, loading.baggage2MaxLb || Number.POSITIVE_INFINITY),
    fuelTakeoffGal: Number(targetFuelGal.toFixed(1)),
    fuelLandingGal: Number(Math.max(0, targetFuelGal - existingBurnGal).toFixed(1)),
  };
}

function updateWeightSummary(load) {
  el("weightTakeoffValue").textContent = `${Math.round(load.takeoffWeightLb)} lb`;
  el("weightLandingValue").textContent = `${Math.round(load.landingWeightLb)} lb`;
  el("weightTakeoffCgValue").textContent = Number.isFinite(load.takeoffCgIn) ? `${load.takeoffCgIn.toFixed(2)} in` : "--";
  el("weightLandingCgValue").textContent = Number.isFinite(load.landingCgIn) ? `${load.landingCgIn.toFixed(2)} in` : "--";
  el("weightFuelBurnValue").textContent = `${Math.round(load.fuelBurnLb)} lb`;
  el("weightStatus").textContent = load.overMtow
    ? `Above MTOW. Reduce load before using the briefing calculations. ${load.loadingNote}`
    : `Ready for briefing. ${load.loadingNote}`;
}

function initWeightPage() {
  state.aircraft = getSelectedAircraft();
  state.loadData = null;
  const aircraft = currentAircraft();
  const profile = currentLoadingProfile();
  const stored = getStoredLoadData(aircraft.id);
  const initialInputs = stored?.inputs || defaultLoadInputs(aircraft);
  const weightLink = el("weightContinue");
  const mtowButton = el("weightMtowButton");

  document.title = `${aircraft.label} Weight of Today`;
  el("weightPageTitle").textContent = `${aircraft.label} - Weight of Today`;
  el("weightPageSubhead").textContent = `Use the real load for today, then open the same LIDE briefing with performance adjusted for this aircraft and this weight.`;
  el("weightAircraftChip").textContent = `${aircraft.label} / MTOW ${aircraft.mtowLb} lb`;
  el("weightReference").textContent = profile.reference || aircraft.sourceNote;

  toggleWeightRow("frontPassengerRow", profile.includeFrontPassenger);
  toggleWeightRow("rearPassengersRow", profile.includeRearPassengers);
  toggleWeightRow("baggage1Row", profile.includeBaggage && hasPositiveLimit(profile.baggage1MaxLb || 1));
  toggleWeightRow("baggage2Row", profile.includeBaggage && hasPositiveLimit(profile.baggage2MaxLb));

  writeWeightInputsToPage(initialInputs);

  const recalc = () => {
    const load = buildLoadData(aircraft, readWeightInputsFromPage());
    state.loadData = load;
    updateWeightSummary(load);
    return load;
  };

  recalc();
  document.querySelectorAll(".weight-form input").forEach((input) => {
    input.addEventListener("input", recalc);
  });

  mtowButton.addEventListener("click", () => {
    const mtowInputs = fitInputsToMtow(aircraft, readWeightInputsFromPage());
    writeWeightInputsToPage(mtowInputs);
    const load = recalc();
    el("weightStatus").textContent = load.overMtow
      ? `Payload alone is above MTOW, so fuel was reduced to minimum possible. ${load.loadingNote}`
      : `Fuel adjusted automatically to bring ${aircraft.label} to MTOW. ${load.loadingNote}`;
  });

  weightLink.addEventListener("click", (event) => {
    event.preventDefault();
    const load = recalc();
    storeLoadData(aircraft.id, load);
    window.location.href = `briefing.html?aircraft=${encodeURIComponent(aircraft.id)}`;
  });
}

function renderBriefing() {
  const aircraft = currentAircraft();
  const load = ensureLoadData();
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

  if (state.surfaceWind?.variable && Number.isFinite(windSpeed)) {
    el("windValue").textContent = `VRB/${Math.round(windSpeed)} kt`;
    el("windDetail").textContent = `${state.surfaceWind?.source || "Wind"} at LIDE, ${state.surfaceWind?.time || "now"} - light and variable`;
  } else if (Number.isFinite(windDir) && Number.isFinite(windSpeed)) {
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
  el("groundRollDetail").textContent = `${takeoff.groundRollFt} ft. Base ${aircraft.baseTakeoffRollFt} ft, corrected for weight, DA, and wind`;
  el("fiftyFtValue").textContent = `${Math.round(takeoff.fiftyFtDistanceFt * FT_TO_M)} m`;
  el("fiftyFtDetail").textContent = `${takeoff.fiftyFtDistanceFt} ft. Base ${aircraft.baseTakeoff50Ft} ft, corrected for weight, DA, and wind`;

  el("runwayAdvice").textContent = runway.calm
    ? "Light wind: preferred RWY 11"
    : `Use RWY ${runway.runway} if traffic and conditions allow`;
  el("componentText").textContent = runway.calm
    ? "Wind is below 3 kt. The display keeps both runway numbers black and uses RWY 11 as the preferred runway."
    : `Headwind ${safety.headwind.toFixed(1)} kt, crosswind ${Math.abs(safety.crosswind).toFixed(1)} kt. Wind angle ${Math.round(angularDifference(runway.heading, windDir))} deg from runway heading.`;

  el("calcText").textContent =
    `${aircraft.label}. Takeoff weight ${Math.round(load.takeoffWeightLb)} lb, landing weight ${Math.round(load.landingWeightLb)} lb, fuel burn ${Math.round(load.fuelBurnLb)} lb. ` +
    `Field elevation ${REGGIO_FIELD_ELEV_FT} ft. ` +
    `Temp ${Number.isFinite(tempC) ? tempC : 15} C, QNH ${Number.isFinite(qnhHpa) ? qnhHpa : 1013} hPa. ` +
    `Pressure altitude ${Math.round(safety.pa)} ft, density altitude ${Math.round(safety.da)} ft. ` +
    `Safety altitude uses the selected aircraft profile with a ${aircraft.baseSafetyFt} ft baseline, adjusted for weight, density altitude, and headwind/tailwind. ` +
    `Takeoff distance uses ${aircraft.baseTakeoffRollFt} ft ground roll and ${aircraft.baseTakeoff50Ft} ft over 50 ft, corrected for weight, density altitude, and wind. ` +
    `Takeoff CG ${Number.isFinite(load.takeoffCgIn) ? load.takeoffCgIn.toFixed(2) : "--"} in, landing CG ${Number.isFinite(load.landingCgIn) ? load.landingCgIn.toFixed(2) : "--"} in. ${aircraft.sourceNote}`;
  const airportPanelLabel = document.querySelector(".airport-tool .panel-header span");
  if (airportPanelLabel) airportPanelLabel.textContent = `${aircraft.label} / T/O ${Math.round(load.takeoffWeightLb)} lb / LDG ${Math.round(load.landingWeightLb)} lb`;

  updateRunwaySvg(runway, takeoff);
  updateWindArrow(windDir);
}

async function calculateAirportLanding() {
  const aircraft = currentAircraft();
  const load = ensureLoadData();
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
    `Landing estimate uses ${aircraft.label} landing weight ${Math.round(load.landingWeightLb)} lb, base ${aircraft.baseLandingRollFt} ft roll / ${aircraft.baseLanding50Ft} ft over 50 ft.`;
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
    ? formatAviationReport(firstNonEmptyLine(metarResult.value), "METAR", icao)
    : "METAR unavailable.";
  const tafText = tafResult.status === "fulfilled"
    ? formatAviationReport(tafResult.value, "TAF", icao)
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

if (el("weightPageTitle")) {
  initWeightPage();
} else if (el("pageTitle")) {
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
}
