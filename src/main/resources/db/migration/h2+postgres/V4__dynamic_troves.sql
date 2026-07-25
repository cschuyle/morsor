-- Interactive dynamic troves (titles only), persisted in the app DB instead of S3 JSON.
CREATE TABLE dynamic_troves (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(512) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Name uniqueness across all trove types is enforced in application code when creating
-- dynamic troves (case-insensitive). No DB unique index: H2 does not support expression
-- indexes like LOWER(name) in a form compatible with PostgreSQL.

CREATE TABLE dynamic_trove_items (
    id VARCHAR(64) PRIMARY KEY,
    trove_id VARCHAR(64) NOT NULL,
    title VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dynamic_trove_items_trove
        FOREIGN KEY (trove_id) REFERENCES dynamic_troves (id) ON DELETE CASCADE
);

CREATE INDEX idx_dynamic_trove_items_trove ON dynamic_trove_items (trove_id);
