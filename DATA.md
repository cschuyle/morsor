# Data Representation

The data consists of a collection of troves. A trove is simply a collection of items. So, the data is a list of lists.

Three formats of data are supported:
## items

This is the simplest. Just a list of strings.

## movies

Designed to capture a subset of the data as you might find at IMDB or TMDB.

## little-prince

This is a specialized format that I use for my collection of translations of the book "Le Petit Prince" by Antoine de St.-Exupéry. It's a superset of data you would expect to find for a book.

_Fun Fact_: This is I use on my [Le Petit Prince International](https://lepetitprince.international) site to exhibit my Little Prince collection.

## Canned data

See [fixtures/data](./fixtures/data) for examples.

## Language codes reference trove

Subtitle language codes on video items (e.g. `de`, `eng`) can be translated to human-readable names via a dedicated reference trove.

### Trove format

```json
{
  "id": "iso639-languages",
  "name": "ISO 639 Language Codes",
  "shortName": "Languages",
  "items": [
    {
      "languageCode": {
        "code": "de",
        "title": "German",
        "aliases": ["deu", "ger"]
      }
    }
  ]
}
```

- **`code`** — primary lookup key (typically ISO 639-1)
- **`title`** — English display name (required by the item mapper)
- **`aliases`** — optional ISO 639-2/3-letter variants

Source data for regeneration lives in [fixtures/data/iso639-source.tsv](./fixtures/data/iso639-source.tsv). Run:

```bash
python3 scripts/generate-language-trove.py
```

### Configuration

| Property | Env var | Default |
|----------|---------|---------|
| `moocho.language.trove.id` | `MOOCHO_LANGUAGE_TROVE_ID` | `iso639-languages` |
| `moocho.reference.trove.ids` | `MOOCHO_REFERENCE_TROVE_IDS` | `iso639-languages` |

Reference troves are always loaded (even when excluded) and hidden from the trove picker. A bundled copy ships at `classpath:reference/iso639-languages.json` and is loaded automatically when the trove is missing from the main data source (e.g. S3 manifest). Video items gain a computed extra field **`subtitles(display)`** with resolved names; raw **`subtitles`** codes are unchanged for filtering (`COUNT(subtitles):3`). The **`subtitles:`** filter accepts a code or display name fragment when the term is at least three characters (e.g. `subtitles:russ` matches `Russian`, `subtitles:arab` matches `Arabic` and `Mozarabic`). Shorter terms use exact code/name matching only (e.g. `subtitles:ru` matches `rus` via the lookup table, not substring).

## Local directories (browser only)

Video troves can include per-file metadata with a relative {@code source} path (e.g. {@code Disc 1/movie.mkv}). In the trove sidebar, open **Local directories** and use **Choose folder…** for each trove. The browser stores a read-only folder handle in IndexedDB (not a path string the server can read).

**Why not typed paths or {@code file://} links?** Web pages cannot open {@code file://} URLs (browsers block them as a sandbox escape). Typed absolute paths in localStorage do not grant the page permission to read those files.

**How file links work:** After you connect a folder once, expanded list rows show clickable filenames. A click reads the file through the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) and opens a blob URL in a new tab (video can stream there). The morsor server is not involved.

Supported browsers include Chromium (Chrome, Edge, Opera) and recent Safari. You may need to re-approve folder access after a restart if the browser prompts again.

## AWS S3

`BUCKET/troves`

```
{ 
    "troves": [
        { "id": "trove-id", "bucketPrefix": "public"|"private" },
        ...
    ]
}
```

`BUCKET/private/$trove_id.json` and `BUCKET/private/$trove_id.json` are the same format as the examples in [fixtures/data](./fixtures/data)



