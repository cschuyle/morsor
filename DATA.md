# Data Representation

The data consists of a collection of troves. A trove is simply a collection of items. So, the data is a list of lists.

Three formats of data are supported:

- items

This is the simplest. Just a list of strings.

- movies

Designed to capture a subset of the data as you might find at IMDB or TMDB.

- little-prince

This is a specialized format that I use for my collection of translations of the book "Le Petit Prince" by Antoine de St.-Exupéry. It's a superset of data you would expect to find for a book.

_Fun Fact_: This is what [Le Petit Prince International](https://lepetitprince.international) uses to exhibit my Little Prince collection.

## Canned data

See `resources/data` for examples.

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

`BUCKET/private/$trove_id.json` and `BUCKET/private/$trove_id.json` are the same format as the examples in `resources/data`



