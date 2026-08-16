-- "File-linked" terminology was renamed to "dir-linked" (matches the trove picker's
-- dir-linked filter toggle). Rename the table in place; columns are unchanged.
ALTER TABLE trove_file_links RENAME TO trove_dir_links;
