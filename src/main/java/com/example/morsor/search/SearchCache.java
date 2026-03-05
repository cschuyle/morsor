package com.example.morsor.search;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-side cache for search/duplicates/uniques full result sets.
 * Key = query params (no page/size). Value = full list. Pagination = slice the cached list.
 * TTL and max memory are configurable via moocho.cache.ttl-minutes and moocho.cache.max-bytes.
 */
@Component
public class SearchCache {

    /** Rough estimate per item (search result, duplicate row, or unique result) for memory cap. */
    private static final long ESTIMATED_BYTES_PER_ITEM = 1024;

    private final long ttlMs;
    private final long maxBytes;
    private final ConcurrentHashMap<String, Entry<?>> cache = new ConcurrentHashMap<>();
    private long totalBytes;

    public SearchCache(
            @Value("${moocho.cache.ttl-minutes:720}") int ttlMinutes,
            @Value("${moocho.cache.max-bytes:1073741824}") long maxBytes) {
        this.ttlMs = (long) ttlMinutes * 60 * 1000;
        this.maxBytes = maxBytes > 0 ? maxBytes : 1073741824L;
    }

    /**
     * @return result with data and whether it was cached (false if cache memory limit would be exceeded)
     */
    public <T> CacheResult<T> getOrCompute(String key, java.util.function.Supplier<List<T>> supplier) {
        long now = System.currentTimeMillis();
        Entry<?> entry = cache.get(key);
        if (entry != null && now < entry.expiryAt) {
            @SuppressWarnings("unchecked")
            List<T> data = (List<T>) entry.data;
            return new CacheResult<>(data, true);
        }
        List<T> data = supplier.get();
        long estimatedBytes = estimateSize(data);
        synchronized (this) {
            evictExpired(now);
            if (totalBytes + estimatedBytes > this.maxBytes) {
                return new CacheResult<>(data, false);
            }
            cache.put(key, new Entry<>(data, now + ttlMs, estimatedBytes));
            totalBytes += estimatedBytes;
        }
        return new CacheResult<>(data, true);
    }

    private void evictExpired(long now) {
        cache.entrySet().removeIf(e -> {
            Entry<?> ent = e.getValue();
            if (now >= ent.expiryAt) {
                totalBytes -= ent.estimatedBytes;
                return true;
            }
            return false;
        });
    }

    private static long estimateSize(List<?> list) {
        if (list == null) return 0;
        return (long) list.size() * ESTIMATED_BYTES_PER_ITEM;
    }

    /** Snapshot of cache size for status/health. */
    public record CacheStats(int entryCount, long estimatedBytes) {}

    public CacheStats getStats() {
        synchronized (this) {
            return new CacheStats(cache.size(), totalBytes);
        }
    }

    /** Remove all entries from the cache. */
    public void clear() {
        synchronized (this) {
            cache.clear();
            totalBytes = 0;
        }
    }

    public record CacheResult<T>(List<T> data, boolean cached) {}

    private static class Entry<T> {
        final List<T> data;
        final long expiryAt;
        final long estimatedBytes;

        Entry(List<T> data, long expiryAt, long estimatedBytes) {
            this.data = data;
            this.expiryAt = expiryAt;
            this.estimatedBytes = estimatedBytes;
        }
    }
}
