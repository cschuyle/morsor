-- Dynamic trove ids are normalized names (slugs), which may exceed the old UUID-sized column.
DROP TABLE dynamic_trove_items;
DROP TABLE dynamic_troves;

CREATE TABLE dynamic_troves (
    id VARCHAR(512) PRIMARY KEY,
    name VARCHAR(512) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dynamic_trove_items (
    trove_id VARCHAR(512) NOT NULL,
    title VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (trove_id, title),
    CONSTRAINT fk_dynamic_trove_items_trove
        FOREIGN KEY (trove_id) REFERENCES dynamic_troves (id) ON DELETE CASCADE
);
