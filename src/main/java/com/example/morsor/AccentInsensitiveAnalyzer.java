package com.example.morsor;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.Tokenizer;
import org.apache.lucene.analysis.core.LowerCaseFilter;
import org.apache.lucene.analysis.miscellaneous.ASCIIFoldingFilter;
import org.apache.lucene.analysis.standard.StandardTokenizer;

/**
 * Analyzer that normalizes text for accent-insensitive matching (e.g. "Léon" and "Leon" match).
 * Pipeline: StandardTokenizer → LowerCaseFilter → ASCIIFoldingFilter.
 */
public final class AccentInsensitiveAnalyzer extends Analyzer {

    @Override
    protected TokenStreamComponents createComponents(String fieldName) {
        Tokenizer source = new StandardTokenizer();
        TokenStream stream = new LowerCaseFilter(source);
        stream = new ASCIIFoldingFilter(stream);
        return new TokenStreamComponents(source, stream);
    }
}
