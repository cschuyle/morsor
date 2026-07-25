-- Dynamic trove items are identified by title (not a UUID). Recreate the table
-- with a composite primary key (trove_id, title).
DROP TABLE dynamic_trove_items;

CREATE TABLE dynamic_trove_items (
    trove_id VARCHAR(64) NOT NULL,
    title VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (trove_id, title),
    CONSTRAINT fk_dynamic_trove_items_trove
        FOREIGN KEY (trove_id) REFERENCES dynamic_troves (id) ON DELETE CASCADE
);
