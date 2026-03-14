package com.example.morsor.search;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class FileTypeCountsTest {

    private static SearchResult result(String id, List<String> files, String itemUrl) {
        return new SearchResult(
                id, null, null, null, null,
                false, null, null,
                files != null ? files : List.of(),
                null, itemUrl, null);
    }

    private static SearchResultWithScore withScore(SearchResult result) {
        return new SearchResultWithScore(result, null);
    }

    @Test
    void emptyResultsReturnsEmptyCounts() {
        Map<String, Long> counts = FileTypeCounts.countPerFileType(List.of());
        assertThat(counts).isEmpty();
    }

    @Test
    void singlePdfCountsAsOne() {
        SearchResult r = result("1", List.of("https://example.com/doc.pdf"), null);
        Map<String, Long> counts = FileTypeCounts.countPerFileType(List.of(withScore(r)));
        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("PDF", 1L));
    }

    @Test
    void singleLinkCountsAsOne() {
        SearchResult r = result("1", List.of(), "https://example.com/page");
        Map<String, Long> counts = FileTypeCounts.countPerFileType(List.of(withScore(r)));
        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("Link", 1L));
    }

    @Test
    void itemWithPdfAndJpgCountedInBoth() {
        SearchResult r = result("1", List.of("https://a.com/f.pdf", "https://b.com/img.jpg"), null);
        Map<String, Long> counts = FileTypeCounts.countPerFileType(List.of(withScore(r)));
        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("PDF", 1L, "JPG", 1L));
    }

    @Test
    void twoItemsSameTypeCountsTwo() {
        SearchResult r1 = result("1", List.of("https://a.com/a.pdf"), null);
        SearchResult r2 = result("2", List.of("https://b.com/b.pdf"), null);
        Map<String, Long> counts = FileTypeCounts.countPerFileType(List.of(withScore(r1), withScore(r2)));
        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("PDF", 2L));
    }

    @Test
    void extensionExtractedAfterQueryString() {
        SearchResult r = result("1", List.of("https://example.com/file.pdf?token=abc"), null);
        Map<String, Long> counts = FileTypeCounts.countPerFileType(List.of(withScore(r)));
        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("PDF", 1L));
    }

    @Test
    void linkAndPdfInTwoItemsCountedCorrectly() {
        SearchResult linkOnly = result("1", List.of(), "https://example.com");
        SearchResult pdfOnly = result("2", List.of("https://example.com/d.pdf"), null);
        SearchResult both = result("3", List.of("https://example.com/x.pdf"), "https://other.com");
        Map<String, Long> counts = FileTypeCounts.countPerFileType(
                List.of(withScore(linkOnly), withScore(pdfOnly), withScore(both)));
        assertThat(counts.get("Link")).isEqualTo(2L);  // linkOnly, both
        assertThat(counts.get("PDF")).isEqualTo(2L);   // pdfOnly, both
        assertThat(counts).containsOnlyKeys("Link", "PDF");
    }

    @Test
    void mixedTypesPreserveOrderAndCounts() {
        SearchResult r1 = result("1", List.of("a.pdf"), null);
        SearchResult r2 = result("2", List.of("b.jpg", "c.png"), null);
        SearchResult r3 = result("3", List.of("d.pdf"), null);
        Map<String, Long> counts = FileTypeCounts.countPerFileType(
                List.of(withScore(r1), withScore(r2), withScore(r3)));
        assertThat(counts).containsEntry("PDF", 2L);
        assertThat(counts).containsEntry("JPG", 1L);
        assertThat(counts).containsEntry("PNG", 1L);
        assertThat(counts).hasSize(3);
    }
}
