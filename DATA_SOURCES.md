# Data sources and licences

NagarNetra ships with no data about any particular place. Everything below is either an official national dataset imported by a script, or fetched live for the point a citizen reports from. Citizen reports, photos and locations are never stored in this repository.

| Source | What we use it for | How | Licence |
|---|---|---|---|
| [Local Government Directory (LGD)](https://lgdirectory.gov.in/), via the daily Parquet exports at [ramseraph.github.io/opendata/lgd](https://ramseraph.github.io/opendata/lgd/) | Official names, codes and types of every state, district, sub-district, block and local body (urban, panchayat, traditional) | `npm run import:lgd`, checksum-verified; the date of each file is stored in the `data_sources` table | [Government Open Data Licence – India](https://data.gov.in/government-open-data-license-india) |
| [OpenStreetMap](https://www.openstreetmap.org/) via Overpass and Nominatim | Administrative boundaries containing a point, the nearest road and its class/reference, nearby schools, hospitals and government offices | Live queries, cached per ~100 m cell | © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright) |
| [Wikidata](https://www.wikidata.org/) | Official websites and types of local bodies | Live SPARQL queries | CC0 |
| [Open-Meteo](https://open-meteo.com/) | Rain forecast for the next 48 hours | Live API | CC BY 4.0 |
| Google Gemini | Understanding photos and voice notes, comparing before/after photos | API calls | Google API terms |

Cached data derived from OpenStreetMap (boundaries, roads, offices) stays under the ODbL if it is ever published.
