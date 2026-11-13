-- Run once with a role allowed to install PostGIS before POSTGIS_ENABLED=true.
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE listing ADD COLUMN IF NOT EXISTS approx_location geography(Point,4326)
 GENERATED ALWAYS AS (CASE WHEN longitude IS NULL OR latitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography END) STORED;
CREATE INDEX IF NOT EXISTS listing_approx_location ON listing USING gist(approx_location);
