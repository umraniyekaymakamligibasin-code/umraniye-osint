-- Stop routing services first. Keeps original news, institution cases and audit.
DROP TRIGGER IF EXISTS cit_source_insert;
DROP TRIGGER IF EXISTS cit_source_update;
DROP TRIGGER IF EXISTS cit_source_delete;
DROP TABLE IF EXISTS cit_case_links;
DROP TABLE IF EXISTS cit_delivery_jobs;
DROP TABLE IF EXISTS cit_delivery_meta;
