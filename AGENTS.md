# Agent instructions

Guidance for AI and other automated tools working in this repo. Read this file when contributing code or performing repo-wide tasks.

## Your preferences

Add your preferences below. For example:

- **Commits:** How you want commit messages formatted (e.g. style, what to include, length).

If I specify a :"blurb" or "purpose" followed by a phrase, I mean that phrase to be the first line in the commit message. Otherwise, feel free to generate your own first line.

The second part of the commit, generate your own bried description that you normally would, including important implementation details. Try to limit it to a handful of lines (5 or so; use your discretion).

If I specify "with details", then after the first and second parts (above), I want you to paste in the summary (or summaries) you gave me for the actions you took on my behalf that are part of this commit.

- **Code style:** Conventions to follow.

- **Other:** When changing code in an area listed below, read the "Known regressions and fixes" section so the same issues are not reintroduced.

## Known regressions and fixes

Document regressions here (what broke, where, and how it was fixed) so agents can avoid reintroducing them.

- **Lightbox / mobile scroll:** On mobile, when scrolled down, the lightbox can appear off the top of the screen. **Cause:** Lightbox was rendered inside the scrollable container, so `position: fixed` was relative to the wrong containing block. **Fix:** Render the lightbox via `createPortal(..., document.body)` when `isMobile` so it is a direct child of `body` and stays viewport-fixed.-->

---

*(Write your preferences above this line.)*
