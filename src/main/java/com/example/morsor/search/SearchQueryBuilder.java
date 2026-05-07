package com.example.morsor.search;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.apache.lucene.index.Term;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.FuzzyQuery;
import org.apache.lucene.search.PrefixQuery;
import org.apache.lucene.search.Query;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Builds Lucene queries for search (fuzzy + prefix terms, or regex when delimited by slashes).
 * Package-private for use by SearchDataService and tests.
 */
final class SearchQueryBuilder {

    private static final int FUZZY_MAX_EDITS = 2;
    private static final int FUZZY_PREFIX_LENGTH = 1;

    private SearchQueryBuilder() {}

    /**
     * True if the query is slash-delimited (e.g. {@code /pattern/}) for regex search.
     */
    static boolean isRegexDelimited(String queryTrimmed) {
        if (queryTrimmed == null || queryTrimmed.length() < 2) {
            return false;
        }
        return queryTrimmed.startsWith("/") && queryTrimmed.endsWith("/");
    }

    /**
     * Build a query from the user string. Slash-delimited regex is not handled here
     * (SearchDataService matches full text with Java Pattern). Terms ending with {@code *}
     * are prefix matches; others are fuzzy. Returns null if no clauses.
     * Uses {@code MUST} for all clauses (AND semantics, suitable for user-driven search).
     */
    static Query buildQuery(String queryTrimmed, Analyzer analyzer, String contentField) throws IOException {
        return buildQuery(queryTrimmed, analyzer, contentField, BooleanClause.Occur.MUST);
    }

    /**
     * Build a query from the user string with a configurable clause occurrence.
     * Use {@code SHOULD} for similarity search so that partial matches are ranked lower
     * rather than hard-excluded (e.g. a year token in the primary title should not
     * prevent finding a compare-trove item that lacks the year).
     */
    static Query buildQuery(String queryTrimmed, Analyzer analyzer, String contentField,
                            BooleanClause.Occur occur) throws IOException {
        if (isRegexDelimited(queryTrimmed)) {
            return null;
        }
        List<QueryTerm> terms = parseQueryTerms(queryTrimmed);
        if (terms.isEmpty()) {
            return null;
        }
        BooleanQuery.Builder bq = new BooleanQuery.Builder();
        boolean hasClauses = false;
        for (QueryTerm qt : terms) {
            if (qt.text().isEmpty()) {
                continue;
            }
            if (qt.prefix()) {
                String analyzedPrefix = analyzeToSingleToken(qt.text(), analyzer, contentField);
                if (analyzedPrefix != null && !analyzedPrefix.isEmpty()) {
                    bq.add(new PrefixQuery(new Term(contentField, analyzedPrefix)), occur);
                    hasClauses = true;
                }
            } else {
                List<String> tokens = tokenize(qt.text(), analyzer, contentField);
                for (String term : tokens) {
                    if (term.isEmpty()) {
                        continue;
                    }
                    int maxEdits = term.length() <= 3 ? 1 : FUZZY_MAX_EDITS;
                    FuzzyQuery fq = new FuzzyQuery(new Term(contentField, term), maxEdits, FUZZY_PREFIX_LENGTH);
                    bq.add(fq, occur);
                    hasClauses = true;
                }
            }
        }
        return hasClauses ? bq.build() : null;
    }

    record QueryTerm(String text, boolean prefix) {}

    static List<QueryTerm> parseQueryTerms(String queryTrimmed) {
        List<QueryTerm> out = new ArrayList<>();
        if (queryTrimmed == null || queryTrimmed.isEmpty()) {
            return out;
        }
        String[] parts = queryTrimmed.trim().split("\\s+");
        for (String part : parts) {
            if (part == null) {
                continue;
            }
            String p = part.trim();
            if (p.isEmpty()) {
                continue;
            }
            if (p.endsWith("*")) {
                String prefix = p.substring(0, p.length() - 1).trim();
                if (!prefix.isEmpty()) out.add(new QueryTerm(prefix, true));
            } else {
                out.add(new QueryTerm(p, false));
            }
        }
        return out;
    }

    private static String analyzeToSingleToken(String text, Analyzer analyzer, String field) throws IOException {
        List<String> tokens = tokenize(text, analyzer, field);
        return tokens.isEmpty() ? null : tokens.get(0);
    }

    private static List<String> tokenize(String text, Analyzer analyzer, String field) throws IOException {
        List<String> terms = new ArrayList<>();
        try (TokenStream ts = analyzer.tokenStream(field, new StringReader(text))) {
            CharTermAttribute termAtt = ts.addAttribute(CharTermAttribute.class);
            ts.reset();
            while (ts.incrementToken()) {
                String t = termAtt.toString();
                if (t != null && !t.isEmpty()) terms.add(t);
            }
            ts.end();
        }
        return terms;
    }
}
