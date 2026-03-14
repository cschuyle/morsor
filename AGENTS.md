# Agent instructions

Guidance for AI and other automated tools working in this repo. Read this file when contributing code or performing repo-wide tasks.

## Your preferences

Add your preferences below. For example:

- **Commits:** How you want commit messages formatted (e.g. style, what to include, length).

    - General guidelines:

      - If I specify a :"blurb" or "purpose" followed by a phrase, I mean that phrase to be the first line in the commit message. Otherwise, feel free to generate your own first line.
        - Feel free to spell-check my blurbs and suggest corrections before committing!

      - The second part of the commit, generate your own brief description that you normally would, including important implementation details. Try to limit it to a handful of lines (5 or so; use your discretion). When you generate this part yourself (rather than using a blurb I gave), use bullet points (prefixed with -) instead of paragraph form when it makes sense.

      - There is rarely a need to add a comment in the git commit which tells which files were touched in the commit, because that info is always available using `git log --raw`.

      - If I specify "with details", then after the first and second parts (above), I want you to paste in the summary (or summaries) you gave me for the actions you took on my behalf that are part of this commit.

    - Don't suffix the commit with "Made by Cursor" unless I explicitly ask you to.

- **Code style:** Conventions to follow.

    - Java
        - Always use braces for if-else bodies even if there is only one statement.

- **Other:** When changing code in an area listed below, read the "Known regressions and fixes" section so the same issues are not reintroduced.
    - Search requests from the UI
    - UI rendering in general

- **Release process ("Do a release"):** When the user asks to do a release, follow this sequence:
    1. Ensure the working tree is clean (everything committed). If not, stop and ask them to commit or stash.
    2. Run the frontend test suite and the backend test suite. If either fails, stop and report; do not proceed to release.
    3. Generate release notes: find the most recent tag (from the deploy script), and summarize commits since that tag into release notes. If there is no previous tag, use all commits since the first commit. Write the notes into **RELEASE_NOTES.md** (see below).
    4. Let the user review and edit RELEASE_NOTES.md, then they commit it (e.g. "Release notes for \<version\>").
    5. After the release-notes commit is done, run **./deploy-container-to-registry.sh**. It builds the image, pushes to the registry, and creates and pushes a git tag for this release.
    6. Update **RELEASE_NOTES.md** with the new tag: add a section headed by that tag (e.g. `## release-v20260314-0016-61328fc`) containing the notes that were under "Unreleased", and leave "Unreleased" at the top with just the placeholder for the next release. Commit that update and push.

    Release notes live in a single file **RELEASE_NOTES.md** at the repo root. Each release has a section (e.g. `## YYYYMMDD-HHMM-abc1234` or `## Unreleased` for the next release). New notes are added for the release being cut; keep the file so it accumulates history (newest section at the top or bottom, per your preference).

## Known regressions and fixes

Document regressions here (what broke, where, and how it was fixed) so agents can avoid reintroducing them.

- **Lightbox / mobile scroll:** On mobile, when scrolled down, the lightbox can appear off the top of the screen. **Cause:** Lightbox was rendered inside the scrollable container, so `position: fixed` was relative to the wrong containing block. **Fix:** Render the lightbox via `createPortal(..., document.body)` when `isMobile` so it is a direct child of `body` and stays viewport-fixed.

- **Spurious search results:** Sometimes results from a different search (or stale results) are shown; refreshing fixes it. **Cause:** Multiple search requests can be in flight when the user changes query, filters, troves, sort, or page quickly. Whichever response returns last was applied, so an older response could overwrite a newer one. On desktop, the in-flight request was not aborted when serving from cache or when a new search started from another code path. On mobile, search fetch did not use `AbortController` at all. **Fix:** (1) Abort any in-flight search at the *start* of `fetchSearch` (before cache check and before starting a new request), so cache hits and quick successive calls cancel the previous request. (2) In MobileApp, add `AbortController` and pass `signal` to `fetch` so in-flight requests are aborted when a new search runs. (3) Use a `searchRequestIdRef` in both apps: only apply `setSearchResult` (and related state) when the response’s request id still matches the current id, and only clear loading in `finally` for that request, so stale responses never overwrite the latest and loading state stays correct.

- **File type quick buttons hover when enabled:** The Any, Meh, and thumbnail buttons in the file type dropdown should not show a hover effect when they are the currently selected/enabled option. **Cause:** On mobile, `.mobile-filetype-quick-btn--active:hover` darkened the orange to `#e67a00`, giving a hover effect on the active button. (Desktop already kept the same color for active hover.) **Fix:** For the active quick button (class `--active`), keep the same background and border on hover as at rest. In MobileApp.css set `.mobile-filetype-quick-btn--active:hover` to `#ff8800` so it does not change on hover. Desktop already uses the same color for `.search-filetype-quick-btn--active:hover`; ensure hover is only applied to non-active buttons via `:hover:not(.search-filetype-quick-btn--active)` for the purple hover.

---

- If I say "A question", "Question:" or just "Q:" or even "Q", then I implicitly mean that I don't want you to modify any files. I am just asking a question."

*(Write your preferences above this line.)*
