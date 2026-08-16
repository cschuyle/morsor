-- Named groups ("aliases") of troves, managed via the Trove Groups admin screen. Ports the
-- morsr-cli local YAML "trove-aliases" concept into DB-backed, shared, editable config.
CREATE TABLE trove_groups (
    id VARCHAR(512) PRIMARY KEY,
    name VARCHAR(512) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Name uniqueness enforced in application code (case-insensitive), same rationale as
-- dynamic_troves: no portable expression index across H2/Postgres.

CREATE TABLE trove_group_members (
    group_id VARCHAR(512) NOT NULL,
    trove_id VARCHAR(512) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, trove_id),
    CONSTRAINT fk_trove_group_members_group
        FOREIGN KEY (group_id) REFERENCES trove_groups (id) ON DELETE CASCADE
);
