# Daily LIDE Briefing

A simple static GitHub Pages website for an always-on daily aviation briefing.

It shows:

- surface wind at LIDE coordinates
- LIMP METAR and TAF
- suggested RWY 11/29 from the wind component
- safety altitude at 2300 lb MTOW with a 900 ft AGL minimum
- ground roll and 50 ft obstacle distance in meters
- runway diagram with takeoff markers and wind components
- ICAO-based landing calculator for C172M MTOW
- a direct MeteoAM SWLL Italy link

## Deploy on GitHub Pages

Upload these files to the root of the repository:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `airports_it.csv`
- `runways_it.csv`

Then enable GitHub Pages from the repository settings.

## Data sources

- METAR/TAF: open AviationWeather.gov API
- Surface wind: Windy Point Forecast when `WINDY_POINT_FORECAST_KEY` is configured in `app.js`; Open-Meteo fallback when no key is set
- ICAO airport coordinates: `airports_it.csv`
- Runway data: `runways_it.csv`, with local overrides for known corrections such as LILI `07/25`
- SWLL Italy: MeteoAM, embedded when the official site allows it

## Windy setup

Windy Point Forecast requires a Point Forecast API key. Add it in `app.js`:

```js
const WINDY_POINT_FORECAST_KEY = "your_key_here";
```

The app requests surface wind for `44.698, 10.665`, corresponding to `N44deg41'52.8" E010deg39'54.0"`. Windy rounds point forecast coordinates to 2 decimals internally.

This is an educational briefing aid only. Always verify with official aviation weather, NOTAMs, runway procedures, and the aircraft POH/AFM.
