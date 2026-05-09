package com.example.morsor.search;

import java.util.List;

public record DuplicateMatchRow(SearchResult primary, List<ScoredSearchResult> matches, String rerank) {
	public DuplicateMatchRow(SearchResult primary, List<ScoredSearchResult> matches) {
		this(primary, matches, null);
	}
}
