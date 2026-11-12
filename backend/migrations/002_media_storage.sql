-- NULL means a legacy local upload. Each cloud upload retains its own location
-- so changing AWS affects new uploads without rewriting existing listing URLs.
ALTER TABLE media ADD COLUMN storage jsonb;
