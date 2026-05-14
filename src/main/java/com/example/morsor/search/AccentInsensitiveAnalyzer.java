package com.example.morsor.search;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.Tokenizer;
import org.apache.lucene.analysis.core.LowerCaseFilter;
import org.apache.lucene.analysis.miscellaneous.ASCIIFoldingFilter;
import org.apache.lucene.analysis.miscellaneous.WordDelimiterGraphFilter;
import org.apache.lucene.analysis.pattern.PatternReplaceCharFilter;
import org.apache.lucene.analysis.standard.StandardTokenizer;

import java.io.Reader;
import java.util.regex.Pattern;

/**
 * Analyzer that normalizes text for accent-insensitive matching (e.g. "Léon" and "Leon" match).
 * Pipeline: StandardTokenizer → LowerCaseFilter → ASCIIFoldingFilter.
 */
public final class AccentInsensitiveAnalyzer extends Analyzer {

    private static final Pattern APOSTROPHE_PATTERN = Pattern.compile("['\u2019]");

    @Override
    protected Reader initReader(String fieldName, Reader reader) {
        // Normalize apostrophes so contractions index consistently (e.g. "Wayne's" -> "Waynes").
        return new PatternReplaceCharFilter(APOSTROPHE_PATTERN, "", reader);
    }

    @Override
    protected TokenStreamComponents createComponents(String fieldName) {
        Tokenizer source = new StandardTokenizer();
        TokenStream stream = new LowerCaseFilter(source);
        stream = new WordDelimiterGraphFilter(
                stream,
                WordDelimiterGraphFilter.GENERATE_WORD_PARTS
                        | WordDelimiterGraphFilter.SPLIT_ON_NUMERICS
                        | WordDelimiterGraphFilter.GENERATE_NUMBER_PARTS,
                null
        );
        stream = new ASCIIFoldingFilter(stream);
        return new TokenStreamComponents(source, stream);
    }
}
