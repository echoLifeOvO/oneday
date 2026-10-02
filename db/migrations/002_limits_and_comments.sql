-- Keep historical migrations immutable. Invalid existing data stops this
-- migration explicitly; it never truncates or deletes user writing.
ALTER TABLE diaries DROP CONSTRAINT diaries_body_check;
ALTER TABLE diaries ADD CONSTRAINT diaries_body_check CHECK (char_length(body) <= 200 AND char_length(btrim(body)) > 0);
ALTER TABLE comments DROP CONSTRAINT comments_body_check;
ALTER TABLE comments ADD CONSTRAINT comments_body_check CHECK (char_length(body) <= 200 AND char_length(btrim(body)) > 0);

-- numeric(p,2) silently rounds 1.234 before CHECK. Unconstrained numeric plus
-- this CHECK rejects extra fractional digits instead of rounding them away.
ALTER TABLE diaries ALTER COLUMN cost TYPE numeric;
ALTER TABLE diaries ADD CONSTRAINT diaries_cost_precision CHECK (cost = trunc(cost, 2) AND cost::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE diaries ADD CONSTRAINT diaries_timezone_length CHECK (char_length(time_zone) BETWEEN 1 AND 80);
ALTER TABLE comments ADD COLUMN request_hash text;
ALTER TABLE comments ADD CONSTRAINT comments_request_hash_length CHECK (request_hash IS NULL OR char_length(request_hash) = 64);
CREATE INDEX comments_diary_newest ON comments (diary_id, created_at DESC, id DESC) WHERE hidden_at IS NULL;

CREATE FUNCTION valid_place_metadata(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE key text; cap integer;
BEGIN
  IF jsonb_typeof(p) <> 'object' OR octet_length(p::text) > 4096 THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p)) > 11 THEN RETURN false; END IF;
  IF p - ARRAY['id','name','englishName','region','country','countryCode','center','bounds','aliases','sourceShapeId','origin'] <> '{}'::jsonb THEN RETURN false; END IF;
  FOR key, cap IN SELECT * FROM (VALUES ('id',100),('name',200),('englishName',200),('region',500),('country',100),('countryCode',3),('aliases',500),('sourceShapeId',200)) AS caps(k,n) LOOP
    IF jsonb_typeof(p->key) IS DISTINCT FROM 'string' OR char_length(p->>key) > cap THEN RETURN false; END IF;
  END LOOP;
  IF p->>'id' !~ '^[a-zA-Z0-9_-]{1,100}$' OR char_length(p->>'name') = 0 OR p->>'countryCode' !~ '^[A-Z]{2,3}$' THEN RETURN false; END IF;
  IF p ? 'origin' AND p->>'origin' IS DISTINCT FROM 'photon' THEN RETURN false; END IF;
  IF jsonb_typeof(p->'center') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'center') <> 2
    OR jsonb_typeof(p->'bounds') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'bounds') <> 4 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements((p->'center') || (p->'bounds')) v WHERE jsonb_typeof(v) <> 'number') THEN RETURN false; END IF;
  RETURN (p->'center'->>0)::numeric BETWEEN -180 AND 180 AND (p->'center'->>1)::numeric BETWEEN -85 AND 85
    AND (p->'bounds'->>0)::numeric BETWEEN -180 AND (p->'center'->>0)::numeric
    AND (p->'bounds'->>2)::numeric BETWEEN (p->'center'->>0)::numeric AND 180
    AND (p->'bounds'->>1)::numeric BETWEEN -90 AND (p->'center'->>1)::numeric
    AND (p->'bounds'->>3)::numeric BETWEEN (p->'center'->>1)::numeric AND 90;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
ALTER TABLE places ADD CONSTRAINT places_metadata_bounds CHECK (valid_place_metadata(metadata) AND metadata->>'id' = id);
