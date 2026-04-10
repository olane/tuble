# Data sources

## Generated files

All generated data files are built by a single script. Download the footfall CSV then run:

```bash
curl -o footfall.csv 'https://crowding.data.tfl.gov.uk/Network%20Demand/StationFootfall_2025_2026%20.csv'
npm run build-data footfall.csv
```

This generates:

- **tube-graph.json** — station topology (id, name, zone, lines) and adjacency edges
- **lines.json** — line names and colours
- **station-metadata.json** — lat/lon coordinates and borough for each station
- **ridership.json** — average daily entry+exit tap counts per station (2025-2026)

## Manually maintained

- **station-codes.json** — 3-letter station codes sourced from the TfL published station abbreviations list, supplemented with codes for Elizabeth line stations. Source: https://content.tfl.gov.uk/station-abbreviations.pdf

## Licensing

Licensed under TfL Open Data terms. Required attribution (included in the app footer):
- "Powered by TfL Open Data"
- "Contains OS data (c) Crown copyright and database rights 2016 and Geomni UK Map data (c) and database rights [2019]"
