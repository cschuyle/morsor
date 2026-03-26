package com.example.morsor;

import com.example.morsor.search.CollectionToSearchResultMapper;
import com.example.morsor.search.SearchResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;

import java.io.InputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CollectionToSearchResultMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void mapsCollectionJsonToSearchResults() throws Exception {
        try (InputStream in = new FileSystemResource("fixtures/data/little-prince.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
            assertThat(results).hasSize(1561);
            assertThat(results.get(0).trove()).isEqualTo("Little Prince");
            assertThat(results.get(0).troveId()).isEqualTo("little-prince");
            assertThat(results.get(0).title()).isEqualTo("Princi i Vogël - The Little Prince in Albanian");
            assertThat(results.get(0).id()).isEqualTo("little-prince-0");
            assertThat(results.get(1).id()).isEqualTo("PP-4277");
            assertThat(results.get(1).title()).isEqualTo("The Little Prince, in Ancient Greek");
        }
    }

    @Test
    void mapsTitlesFormatToSearchResults() throws Exception {
        String json = """
            {
              "titles": [
                "An Introduction to Machine Learning with Web Data",
                "Effective Data Visualization",
                "Introduction to Big Data"
              ],
              "id": "synology-bu-courses",
              "name": "Synology-BU: Courses",
              "shortName": "BU Courses (Video)"
            }
            """;
        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
        assertThat(results).hasSize(3);
        assertThat(results.get(0).trove()).isEqualTo("BU Courses (Video)");
        assertThat(results.get(0).troveId()).isEqualTo("synology-bu-courses");
        assertThat(results.get(0).title()).isEqualTo("An Introduction to Machine Learning with Web Data");
        assertThat(results.get(0).id()).isEqualTo("synology-bu-courses-0");
        assertThat(results.get(0).snippet()).isEqualTo("An Introduction to Machine Learning with Web Data");
        assertThat(results.get(1).title()).isEqualTo("Effective Data Visualization");
        assertThat(results.get(1).id()).isEqualTo("synology-bu-courses-1");
        assertThat(results.get(2).title()).isEqualTo("Introduction to Big Data");
        assertThat(results.get(2).id()).isEqualTo("synology-bu-courses-2");
    }

    @Test
    void mapsScreeningListFormatToSearchResults() throws Exception {
        try (InputStream in = new FileSystemResource("fixtures/data/screening-list.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
            assertThat(results).hasSize(8);
            assertThat(results.get(0).troveId()).isEqualTo("screening-list");
            assertThat(results.get(0).trove()).isEqualTo("Screenings");
            assertThat(results.get(0).title()).isEqualTo("Chicago");
            assertThat(results.get(0).snippet()).isEqualTo("Rob Marshall · 2002");
            assertThat(results.get(0).id()).isEqualTo("screening-list-0");
            assertThat(results.get(1).title()).isEqualTo("The Player");
            assertThat(results.get(1).snippet()).isEqualTo("Robert Altman · 1992");
        }
    }

    @Test
    void mapsLittlePrinceItemUrlToSearchResult() throws Exception {
        String json = """
            {
              "id": "test-trove",
              "name": "Test Trove",
              "shortName": "Test",
              "items": [
                {
                  "littlePrinceItem": {
                    "title": "Item with URL",
                    "smallImageUrl": "https://example.com/small.jpg",
                    "largeImageUrl": "https://example.com/large.jpg",
                    "itemUrl": "https://example.com/item-page"
                  }
                },
                {
                  "littlePrinceItem": {
                    "acquired-from": "Example Bookshop",
                    "amsoft-link": "http://example.com/amsoft",
                    "asin": "B092MP17YM",
                    "at-link": "http://example.com/at",
                    "author": "Antoine de Saint-Exupéry",
                    "cat-link": "http://example.com/cat",
                    "comments": [
                      "Sample comment"
                    ],
                    "customer-rating": "4.9",
                    "date-added": "2019-07-04",
                    "date-published": "2002",
                    "description": "Sample description",
                    "display-title": "The Little Prince, in Ancient Greek",
                    "duration": "1 hr and 46 mins",
                    "editor": "Miroslav Vučič",
                    "enhanced-typesetting": "Enabled",
                    "file-size": "2055 KB",
                    "files": [
                      "https://example.com/sample.pdf"
                    ],
                    "format": "paperback",
                    "fragmenti-link": "https://example.com/fragmenti",
                    "illustrator": "Antoine de Saint-Exupéry",
                    "initial-printing-year": "1951",
                    "isbn": "9780957138742",
                    "isbn10": "0-9571387-4-2",
                    "isbn13": "978-0-9571387-4-2",
                    "language": "Ancient Greek",
                    "language-dialect-of": "Greek",
                    "language-spoke-in": "Athens",
                    "language-spoken-in": "Greece",
                    "language-synonyms": "Ancient Greek, Classical Greek",
                    "language2": "Greek",
                    "largeImageUrl": "https://example.com/large2.jpg",
                    "largeImageUrl2": "https://example.com/large2-alt.jpg",
                    "lpid": "PP-4277",
                    "narrator": "Zbigniew Brzezinsky",
                    "notes": [
                      "Sample note"
                    ],
                    "number-reviews": "366",
                    "original-publication-date": "1977",
                    "original-title": "Le petit prince",
                    "owned": "true",
                    "oytuneris-link": "https://example.com/oytuneris",
                    "pages": "96",
                    "pdf": "https://example.com/sample.pdf",
                    "print-length": "96 pages",
                    "printed-by": "Example Printers",
                    "publication-country": "UK",
                    "publication-date": "Oct. 8, 2019",
                    "publication-location": "St. Andrews",
                    "published-in": "Example Series",
                    "publisher": "Juan Coderch",
                    "publisher-series": "Little Prince Collection",
                    "quantity": 1,
                    "release-date": "04-06-23",
                    "script": "Greek",
                    "script-family": "Greek",
                    "search-words": "to basileidion ancient greek",
                    "simultaneous-device-usage": "Unlimited",
                    "smallImageUrl": "https://example.com/s2.jpg",
                    "smallImageUrl2": "https://example.com/s2-alt.jpg",
                    "sticky-notes": "On Kindle Scribe",
                    "subTitle": "Der kleine Prinz – Ancient Greek",
                    "supervisor": "Toshiro Tsumagari",
                    "tags": [
                      "language isolate*",
                      "dead language"
                    ],
                    "text-to-speech": "Enabled",
                    "tintenfassId": "81",
                    "title": "Item with the kitchen sink thrown in",
                    "titleInternal": "To Basileidion",
                    "translation-title": "Τὸ βασιλείδιον",
                    "translation-title-transliterated": "To Basileidion",
                    "translator": "Juan Coderch",
                    "word-wise": "Not Enabled",
                    "x-ray": "Not Enabled",
                    "year": "2017"
                  }
                },
                {
                  "movie": {
                    "title": "A Movie",
                    "year": "2020",
                    "itemUrl": "https://example.com/movie"
                  }
                }
              ]
            }
            """;
        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
        assertThat(results).hasSize(3);
        assertThat(results.get(0).itemType()).isEqualTo("littlePrinceItem");
        assertThat(results.get(0).itemUrl()).isEqualTo("https://example.com/item-page");
        assertThat(results.get(1).itemType()).isEqualTo("littlePrinceItem");
        assertThat(results.get(1).itemUrl()).isNull();
        assertThat(results.get(2).itemType()).isEqualTo("movie");
        assertThat(results.get(2).itemUrl()).isNull();
        assertThat(results.get(0).littlePrinceItemExtra()).isNull();
        assertThat(results.get(1).littlePrinceItemExtra()).isNotNull();
        assertThat(results.get(1).littlePrinceItemExtra()).containsEntry("author", "Antoine de Saint-Exupéry");
        assertThat(results.get(2).littlePrinceItemExtra()).isNull();

        // rawSourceItem: JSON items get pretty-printed multi-line JSON
        assertThat(results.get(0).rawSourceItem()).contains("littlePrinceItem");
        assertThat(results.get(0).rawSourceItem()).contains("\n");
        assertThat(results.get(0).rawSourceItem()).contains("Item with URL");

        SearchResult kitchenSink = results.get(1);

// fields mapped directly onto SearchResult
        assertThat(kitchenSink.files()).containsExactly("https://example.com/sample.pdf");
        assertThat(kitchenSink.hasThumbnail()).isTrue();
        assertThat(kitchenSink.id()).isEqualTo("PP-4277");
        assertThat(kitchenSink.itemType()).isEqualTo("littlePrinceItem");
        assertThat(kitchenSink.itemUrl()).isNull();
        assertThat(kitchenSink.largeImageUrl()).isEqualTo("https://example.com/large2.jpg");
        assertThat(kitchenSink.rawSourceItem()).contains("littlePrinceItem");
        assertThat(kitchenSink.snippet()).isEqualTo("Ancient Greek · Antoine de Saint-Exupéry · 2017 · to basileidion ancient greek");
        assertThat(kitchenSink.thumbnailUrl()).isEqualTo("https://example.com/s2.jpg");
        assertThat(kitchenSink.title()).isEqualTo("The Little Prince, in Ancient Greek");
        assertThat(kitchenSink.trove()).isEqualTo("Test");
        assertThat(kitchenSink.troveId()).isEqualTo("test-trove");

        // all fields preserved in rawSourceItem
        JsonNode kitchenSinkRaw = objectMapper.readTree(kitchenSink.rawSourceItem()).get("littlePrinceItem");
        assertThat(kitchenSinkRaw).isNotNull();

        assertThat(kitchenSinkRaw.get("acquired-from").asText()).isEqualTo("Example Bookshop");
        assertThat(kitchenSinkRaw.get("amsoft-link").asText()).isEqualTo("http://example.com/amsoft");
        assertThat(kitchenSinkRaw.get("asin").asText()).isEqualTo("B092MP17YM");
        assertThat(kitchenSinkRaw.get("at-link").asText()).isEqualTo("http://example.com/at");
        assertThat(kitchenSinkRaw.get("author").asText()).isEqualTo("Antoine de Saint-Exupéry");
        assertThat(kitchenSinkRaw.get("cat-link").asText()).isEqualTo("http://example.com/cat");
        assertThat(kitchenSinkRaw.get("comments").isArray()).isTrue();
        assertThat(kitchenSinkRaw.get("comments").get(0).asText()).isEqualTo("Sample comment");
        assertThat(kitchenSinkRaw.get("customer-rating").asText()).isEqualTo("4.9");
        assertThat(kitchenSinkRaw.get("date-added").asText()).isEqualTo("2019-07-04");
        assertThat(kitchenSinkRaw.get("date-published").asText()).isEqualTo("2002");
        assertThat(kitchenSinkRaw.get("description").asText()).isEqualTo("Sample description");
        assertThat(kitchenSinkRaw.get("display-title").asText()).isEqualTo("The Little Prince, in Ancient Greek");
        assertThat(kitchenSinkRaw.get("duration").asText()).isEqualTo("1 hr and 46 mins");
        assertThat(kitchenSinkRaw.get("editor").asText()).isEqualTo("Miroslav Vučič");
        assertThat(kitchenSinkRaw.get("enhanced-typesetting").asText()).isEqualTo("Enabled");
        assertThat(kitchenSinkRaw.get("file-size").asText()).isEqualTo("2055 KB");
        assertThat(kitchenSinkRaw.get("files").isArray()).isTrue();
        assertThat(kitchenSinkRaw.get("files").get(0).asText()).isEqualTo("https://example.com/sample.pdf");
        assertThat(kitchenSinkRaw.get("format").asText()).isEqualTo("paperback");
        assertThat(kitchenSinkRaw.get("fragmenti-link").asText()).isEqualTo("https://example.com/fragmenti");
        assertThat(kitchenSinkRaw.get("illustrator").asText()).isEqualTo("Antoine de Saint-Exupéry");
        assertThat(kitchenSinkRaw.get("initial-printing-year").asText()).isEqualTo("1951");
        assertThat(kitchenSinkRaw.get("isbn").asText()).isEqualTo("9780957138742");
        assertThat(kitchenSinkRaw.get("isbn10").asText()).isEqualTo("0-9571387-4-2");
        assertThat(kitchenSinkRaw.get("isbn13").asText()).isEqualTo("978-0-9571387-4-2");
        assertThat(kitchenSinkRaw.get("language").asText()).isEqualTo("Ancient Greek");
        assertThat(kitchenSinkRaw.get("language-dialect-of").asText()).isEqualTo("Greek");
        assertThat(kitchenSinkRaw.get("language-spoke-in").asText()).isEqualTo("Athens");
        assertThat(kitchenSinkRaw.get("language-spoken-in").asText()).isEqualTo("Greece");
        assertThat(kitchenSinkRaw.get("language-synonyms").asText()).isEqualTo("Ancient Greek, Classical Greek");
        assertThat(kitchenSinkRaw.get("language2").asText()).isEqualTo("Greek");
        assertThat(kitchenSinkRaw.get("largeImageUrl").asText()).isEqualTo("https://example.com/large2.jpg");
        assertThat(kitchenSinkRaw.get("largeImageUrl2").asText()).isEqualTo("https://example.com/large2-alt.jpg");
        assertThat(kitchenSinkRaw.get("lpid").asText()).isEqualTo("PP-4277");
        assertThat(kitchenSinkRaw.get("narrator").asText()).isEqualTo("Zbigniew Brzezinsky");
        assertThat(kitchenSinkRaw.get("notes").isArray()).isTrue();
        assertThat(kitchenSinkRaw.get("notes").get(0).asText()).isEqualTo("Sample note");
        assertThat(kitchenSinkRaw.get("number-reviews").asText()).isEqualTo("366");
        assertThat(kitchenSinkRaw.get("original-publication-date").asText()).isEqualTo("1977");
        assertThat(kitchenSinkRaw.get("original-title").asText()).isEqualTo("Le petit prince");
        assertThat(kitchenSinkRaw.get("owned").asText()).isEqualTo("true");
        assertThat(kitchenSinkRaw.get("oytuneris-link").asText()).isEqualTo("https://example.com/oytuneris");
        assertThat(kitchenSinkRaw.get("pages").asText()).isEqualTo("96");
        assertThat(kitchenSinkRaw.get("pdf").asText()).isEqualTo("https://example.com/sample.pdf");
        assertThat(kitchenSinkRaw.get("print-length").asText()).isEqualTo("96 pages");
        assertThat(kitchenSinkRaw.get("printed-by").asText()).isEqualTo("Example Printers");
        assertThat(kitchenSinkRaw.get("publication-country").asText()).isEqualTo("UK");
        assertThat(kitchenSinkRaw.get("publication-date").asText()).isEqualTo("Oct. 8, 2019");
        assertThat(kitchenSinkRaw.get("publication-location").asText()).isEqualTo("St. Andrews");
        assertThat(kitchenSinkRaw.get("published-in").asText()).isEqualTo("Example Series");
        assertThat(kitchenSinkRaw.get("publisher").asText()).isEqualTo("Juan Coderch");
        assertThat(kitchenSinkRaw.get("publisher-series").asText()).isEqualTo("Little Prince Collection");
        assertThat(kitchenSinkRaw.get("quantity").asInt()).isEqualTo(1);
        assertThat(kitchenSinkRaw.get("release-date").asText()).isEqualTo("04-06-23");
        assertThat(kitchenSinkRaw.get("script").asText()).isEqualTo("Greek");
        assertThat(kitchenSinkRaw.get("script-family").asText()).isEqualTo("Greek");
        assertThat(kitchenSinkRaw.get("search-words").asText()).isEqualTo("to basileidion ancient greek");
        assertThat(kitchenSinkRaw.get("simultaneous-device-usage").asText()).isEqualTo("Unlimited");
        assertThat(kitchenSinkRaw.get("smallImageUrl").asText()).isEqualTo("https://example.com/s2.jpg");
        assertThat(kitchenSinkRaw.get("smallImageUrl2").asText()).isEqualTo("https://example.com/s2-alt.jpg");
        assertThat(kitchenSinkRaw.get("sticky-notes").asText()).isEqualTo("On Kindle Scribe");
        assertThat(kitchenSinkRaw.get("subTitle").asText()).isEqualTo("Der kleine Prinz – Ancient Greek");
        assertThat(kitchenSinkRaw.get("supervisor").asText()).isEqualTo("Toshiro Tsumagari");
        assertThat(kitchenSinkRaw.get("tags").isArray()).isTrue();
        assertThat(kitchenSinkRaw.get("tags").get(0).asText()).isEqualTo("language isolate*");
        assertThat(kitchenSinkRaw.get("tags").get(1).asText()).isEqualTo("dead language");
        assertThat(kitchenSinkRaw.get("text-to-speech").asText()).isEqualTo("Enabled");
        assertThat(kitchenSinkRaw.get("tintenfassId").asText()).isEqualTo("81");
        assertThat(kitchenSinkRaw.get("title").asText()).isEqualTo("Item with the kitchen sink thrown in");
        assertThat(kitchenSinkRaw.get("titleInternal").asText()).isEqualTo("To Basileidion");
        assertThat(kitchenSinkRaw.get("translation-title").asText()).isEqualTo("Τὸ βασιλείδιον");
        assertThat(kitchenSinkRaw.get("translation-title-transliterated").asText()).isEqualTo("To Basileidion");
        assertThat(kitchenSinkRaw.get("translator").asText()).isEqualTo("Juan Coderch");
        assertThat(kitchenSinkRaw.get("word-wise").asText()).isEqualTo("Not Enabled");
        assertThat(kitchenSinkRaw.get("x-ray").asText()).isEqualTo("Not Enabled");
        assertThat(kitchenSinkRaw.get("year").asText()).isEqualTo("2017");
    }

    @Test
    void mapsDomainItemsToDomainSearchResults() throws Exception {
        String json = """
            {
              "id": "namecheap",
              "name": "Namecheap domains",
              "shortName": "Namecheap",
              "items": [
                {
                  "domain": {
                    "domain-name": "example.com",
                    "punycode-domain-name": "example.com",
                    "title": "example.com",
                    "expiration-date": "2026-12-31",
                    "auto-renew": "true"
                  }
                }
              ]
            }
            """;

        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).trove()).isEqualTo("Namecheap");
        assertThat(results.get(0).troveId()).isEqualTo("namecheap");
        assertThat(results.get(0).title()).isEqualTo("example.com");
        assertThat(results.get(0).itemType()).isEqualTo("domain");
        assertThat(results.get(0).itemUrl()).isNull();
        assertThat(results.get(0).thumbnailUrl()).isNull();
        assertThat(results.get(0).hasThumbnail()).isFalse();
        assertThat(results.get(0).domainName()).isEqualTo("example.com");
        assertThat(results.get(0).punycodeDomainName()).isEqualTo("example.com");
        assertThat(results.get(0).expirationDate()).isEqualTo("2026-12-31");
        assertThat(results.get(0).autoRenew()).isTrue();
        assertThat(results.get(0).littlePrinceItemExtra()).isNull();
    }

    @Test
    void rawSourceItemForTitlesIsTheTitleString() throws Exception {
        String json = """
            {"id": "t", "titles": ["Title A", "Title B"]}
            """;
        JsonNode root = objectMapper.readTree(json);
        List<SearchResult> results = CollectionToSearchResultMapper.mapRootToSearchResults(root);
        assertThat(results).hasSize(2);
        assertThat(results.get(0).rawSourceItem()).isEqualTo("Title A");
        assertThat(results.get(1).rawSourceItem()).isEqualTo("Title B");
    }
}
