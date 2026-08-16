-- "Local roots" terminology was renamed to "file-linked" (matches the trove picker's
-- file-linked filter toggle). Rename the table in place; columns are unchanged.
ALTER TABLE trove_local_roots RENAME TO trove_file_links;
