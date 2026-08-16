-- Metadata for per-trove "local directories" (File System Access API folders). This records
-- only THAT a browser has connected a folder for a trove and what it's labeled — the actual
-- FileSystemDirectoryHandle is browser-local (IndexedDB) and cannot be stored server-side.
-- Any browser without a matching IndexedDB entry can see this row but cannot read files.
CREATE TABLE trove_local_roots (
    trove_id VARCHAR(512) PRIMARY KEY,
    folder_label VARCHAR(512) NOT NULL,
    connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
