# Release notes

*(Tag created when deploy runs.)*

## Unreleased

### Extra fields
- Added optional extra-field columns in search list view (desktop and mobile), including URL persistence and toolbar/dropdown UX improvements.
  - Sorting supports `sortBy=extra:<key>`.
  - Missing/blank/whitespace extra values are treated as nonexistent; rows with no extra-field value stay last when sorting by extra fields.

### Lightbox and tooltip improvements
- Tooltip/lightbox improvements:
  - Lightbox shows Extra fields.
  - Linkified URLs in any text.

## release-v20260323-1521-f57df91

### Authentication & sign-in
- Improved behavior when authentication results in an error.
- Improved behavior when accepting autofill (e.g. 1Password and iPhone).

## release-v20260323-1316-4f07b9a

### Search results
- **Filter box color:** “Filter this page” input now uses a pale blue background to distinguish it from the regular search box.

## release-v20260319-1826-b706dd5

### Search results
- **Filter box:** Only show “Filter this page” when there are results.
- **List mode:** Thumbnail now enlarges on hover (up to 60%).
- **Column resizing:** Results list columns (Title, Trove, Score) can be resized by dragging the header edge; double-click resizer resets.

### Compare (duplicates / uniques)
- **Sort over full result:** Duplicates and uniques sort over the entire result set (like the search tab), not just the current page.
- **Thumbnails:** Thumbnails are now shown in duplicate and uniques result tables.
- **Progress:** ETA countdown instead of elapsed time.
- **Back-to-top:** Same back-to-top arrow as search when compare view is scrolled down.

### Desktop
- **View mode toggle:** List and gallery icons inside the view toggle buttons.
- **Trove column:** Show the trove column when no troves are selected (desktop; mobile already did). Hide only when exactly one trove is selected.

## release-v20260314-1856-11dbdce

### Compare (duplicates / uniques)
- **Desktop compare page size:** Fix bug where the page size wasn't being respected.
- **Trove picker:** Improved UI for self-compare and not allowing same trove selection in Primary vs Compare tabs.
- **Compare (Duplicates, Unique) results:** Single-click row opens raw source lightbox.
- **Progress UI:** 
    - Duplicates/uniques progress shows light purple stats, timer.
    - **Timers** for compare tabs.
- **Highlighting for Compares:** Unmatched words in duplicates list; shared words and uniques in uniques view.
- **Cache:** Duplicates and uniques searches cached together for instant complement results.

### Mobile app
- **Page navigator:** Double chevrons (« ») for first/last page

### Desktop
- **Footer:** Added trash and reload icons.

### Reload troves
- Progress popup: Improved visibility and fixed bug where it wouldn't load the initial attempt

### Deploy and tooling
- **deploy-container-to-registry.sh:** Zero-pad HHMM to 4 digits in version string.
- **Release process:** RELEASE_NOTES.md updated with new tag after deploy; AGENTS.md step 6.

## release-v20260314-0016-61328fc

### Media picker
- **Hit counts in media dropdown:** (e.g. PDF (45)) in deep purple, bold.

### Deploy and tooling
- **deploy-container-to-registry.sh:** After a successful image push, create an annotated git tag with the version and push it to origin.
- **AGENTS.md:** Commit message preferences (bullet points for self-generated messages; file-touched lists rarely needed; spell-check blurbs); release process (“Do a release”) and this file (RELEASE_NOTES.md).
- **Java:** Apply brace rule to if-else bodies (always use braces); codebase updated and documented in AGENTS.md.

## release-v20260313-1854-4cb554c

This is the last pushed Docker image prior to starting to track release notes. I created tha tag manually so that I can run the release process with a previous tag.

Maybe if I get bored I'll backfill previous releases.

These are the only ones that we can record easily. Prior these I was just pushing `:latest` and was not using tags.

From earliest to latest:
```
20260310-4784-1191ff3
20260310-7955-3e71a7f
20260311-397-f9f129f
20260311-560-04a7aa2
20260311-775-ba8e0d0
20260311-974-aaca399
20260311-1138-b48825a
20260311-1282-1a498d8
20260311-1419-e48e50b
20260311-1578-af5334c
20260311-0436-d530f23
20260312-1700-798e517
20260312-1808-4f785b9
20260312-2209-fbf18c5
20260313-0110-f794a09
20260313-0132-9555869
20260313-0422-f528958
20260313-1714-b3ac690
20260313-1728-b3ac690
```