package com.example.morsor.search;

import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.ByteBuffersDirectory;
import org.apache.lucene.store.Directory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for prefix search and fuzzy matching using Lucene indexing.
 * Uses the same analyzer and field layout as SearchDataService (e.g. for compare-tabs similar-item matching).
 */
class PrefixSearchTest {

    private static final String CONTENT_FIELD = "content";
    private static final String TROVE_ID_FIELD = "troveId";
    private static final String IDX_FIELD = "idx";

    private AccentInsensitiveAnalyzer analyzer;
    private Directory directory;
    private IndexSearcher searcher;

    @BeforeEach
    void setUp() throws IOException {
        analyzer = new AccentInsensitiveAnalyzer();
        directory = new ByteBuffersDirectory();
        IndexWriterConfig config = new IndexWriterConfig(analyzer);
        config.setOpenMode(IndexWriterConfig.OpenMode.CREATE);
        try (IndexWriter writer = new IndexWriter(directory, config)) {
            addDoc(writer, 0, "test-trove", "Последний день лета");
            addDoc(writer, 1, "test-trove", "Other title");
            addDoc(writer, 2, "test-trove", "Послушать музыку");
            addDoc(writer, 3, "test-trove", "Совсем другое");
            writer.commit();
        }
        searcher = new IndexSearcher(DirectoryReader.open(directory));
    }

    private void addDoc(IndexWriter writer, int idx, String troveId, String content) throws IOException {
        Document doc = new Document();
        doc.add(new TextField(CONTENT_FIELD, content, Field.Store.NO));
        doc.add(new StringField(TROVE_ID_FIELD, troveId, Field.Store.NO));
        doc.add(new StoredField(IDX_FIELD, idx));
        writer.addDocument(doc);
    }

    @Test
    void prefixTermMatchesIndexedTermsWithThatPrefix() throws IOException {
        Query query = SearchQueryBuilder.buildQuery("Посл*", analyzer, CONTENT_FIELD);
        assertThat(query).isNotNull();

        TopDocs topDocs = searcher.search(query, 10);
        assertThat(topDocs.totalHits.value).isEqualTo(2);

        List<Integer> hitIndices = new java.util.ArrayList<>();
        for (int i = 0; i < topDocs.scoreDocs.length; i++) {
            int docId = topDocs.scoreDocs[i].doc;
            int idx = searcher.storedFields().document(docId).getField(IDX_FIELD).numericValue().intValue();
            hitIndices.add(idx);
        }
        assertThat(hitIndices).containsExactlyInAnyOrder(0, 2);
    }

    @Test
    void parseQueryTermsRecognizesPrefixTerms() {
        List<SearchQueryBuilder.QueryTerm> terms = SearchQueryBuilder.parseQueryTerms("Посл* word");
        assertThat(terms).hasSize(2);
        assertThat(terms.get(0).text()).isEqualTo("Посл");
        assertThat(terms.get(0).prefix()).isTrue();
        assertThat(terms.get(1).text()).isEqualTo("word");
        assertThat(terms.get(1).prefix()).isFalse();
    }

    @Test
    void nonPrefixTermUsesFuzzyMatch() throws IOException {
        Query query = SearchQueryBuilder.buildQuery("Other", analyzer, CONTENT_FIELD);
        assertThat(query).isNotNull();
        TopDocs topDocs = searcher.search(query, 10);
        assertThat(topDocs.totalHits.value).isGreaterThanOrEqualTo(1);
    }

    @Test
    void fuzzyQueryMatchesMinorSpellingDifferenceLikeDoolittleVsDolittle() throws IOException {
        Directory dir = new ByteBuffersDirectory();
        IndexWriterConfig config = new IndexWriterConfig(analyzer);
        config.setOpenMode(IndexWriterConfig.OpenMode.CREATE);
        try (IndexWriter writer = new IndexWriter(dir, config)) {
            addDoc(writer, 0, "trove-a", "Dr Doolittle");
            addDoc(writer, 1, "trove-b", "Other title");
            writer.commit();
        }
        IndexSearcher search = new IndexSearcher(DirectoryReader.open(dir));

        Query query = SearchQueryBuilder.buildQuery("Dr Dolittle", analyzer, CONTENT_FIELD);
        assertThat(query).isNotNull();

        TopDocs topDocs = search.search(query, 10);
        assertThat(topDocs.totalHits.value).isEqualTo(1);
        int hitDocId = topDocs.scoreDocs[0].doc;
        int idx = search.storedFields().document(hitDocId).getField(IDX_FIELD).numericValue().intValue();
        assertThat(idx).isEqualTo(0);
    }
}
