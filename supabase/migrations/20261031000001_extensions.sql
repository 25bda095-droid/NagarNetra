-- Extensions used by NagarNetra.
-- postgis : geography points, distance queries (duplicate merge, nearby incidents)
-- pg_trgm : fuzzy name matching (OSM names -> official LGD names) and text similarity for duplicates
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
