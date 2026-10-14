CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE catalog_revisions(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),source text NOT NULL,row_count integer NOT NULL,manifest jsonb NOT NULL);
CREATE TABLE catalog_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),revision text NOT NULL REFERENCES catalog_revisions(id));
CREATE TABLE places(
 revision text NOT NULL REFERENCES catalog_revisions(id),city text NOT NULL,mode text NOT NULL,id text NOT NULL,
 name text NOT NULL,category text,priority integer NOT NULL DEFAULT 1,location geography(Point,4326) NOT NULL,facts jsonb NOT NULL,search_text text NOT NULL,
 PRIMARY KEY(revision,city,mode,id),CHECK(city IN ('spb','kurgan','phuket')),CHECK(mode IN ('direct','scenic','food','photo'))
);
CREATE INDEX places_location ON places USING gist(location);
CREATE INDEX places_geometry ON places USING gist((location::geometry));
CREATE INDEX places_scope ON places(revision,city,mode);
CREATE INDEX places_search ON places USING gin(search_text gin_trgm_ops);
CREATE TABLE import_jobs(id uuid PRIMARY KEY,revision text,source text NOT NULL,status text NOT NULL CHECK(status IN ('staging','published','failed')),checkpoint integer NOT NULL DEFAULT 0,error_code text,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
CREATE TABLE media_objects(source_path text PRIMARY KEY,object_key text NOT NULL,sha256 text NOT NULL,size_bytes bigint NOT NULL,uploaded_at timestamptz NOT NULL DEFAULT now());
