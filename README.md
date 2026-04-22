# Daily LIDE Briefing

A simple static GitHub Pages website for an always-on daily aviation briefing.

It shows:

- surface wind near Parma
- LIMP METAR and TAF
- suggested RWY 11/29 from the wind component
- safety altitude at 2300 lb MTOW with a 900 ft AGL minimum
- ground roll and 50 ft obstacle distance in meters
- a direct MeteoAM SWLL Italy link

## Deploy on GitHub Pages

Upload these files to the root of the repository:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

Then enable GitHub Pages from the repository settings.

## Data sources

- METAR/TAF: open AviationWeather.gov API
- Surface wind: Open-Meteo
- SWLL Italy: MeteoAM, embedded when the official site allows it

This is an educational briefing aid only. Always verify with official aviation weather, NOTAMs, runway procedures, and the aircraft POH/AFM.
