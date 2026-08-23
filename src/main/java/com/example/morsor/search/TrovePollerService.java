package com.example.morsor.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Background poller that compares trove manifest timestamps to a baseline and marks the
 * {@code trove_staleness} DB row with the cumulative set of troves that have changed since
 * the baseline was last captured. The baseline (and the cumulative set) only resets when
 * {@link #resume()} is called (i.e. after a successful manual reload), so changes that occur
 * after the first one is detected keep getting folded into the same stale record.
 */
@Service
public class TrovePollerService {

    private static final Logger log = LoggerFactory.getLogger(TrovePollerService.class);

    private final SearchDataService searchDataService;
    private final TroveStalenessRepository stalenessRepository;

    @Value("${moocho.poll.enabled:true}")
    private boolean pollEnabled;

    /** True after first tick where baseline has been captured; avoids false-positives on startup. */
    private final AtomicBoolean baselineInitialized = new AtomicBoolean(false);

    /** Last known snapshot of (troveId → change token). */
    private final Map<String, String> lastKnownTimestamps = new ConcurrentHashMap<>();

    /** Trove ids most recently written to the stale record; avoids redundant DB writes when nothing new changed. */
    private volatile Set<String> lastAnnounced = Set.of();

    public TrovePollerService(SearchDataService searchDataService,
                               TroveStalenessRepository stalenessRepository) {
        this.searchDataService = searchDataService;
        this.stalenessRepository = stalenessRepository;
    }

    @Scheduled(fixedDelayString = "${moocho.poll.interval-ms:10000}")
    public void poll() {
        if (!pollEnabled) {
            return;
        }
        try {
            Map<String, String> current = searchDataService.readTroveManifestTimestamps();
            if (current.isEmpty()) {
                return;
            }
            if (!baselineInitialized.getAndSet(true)) {
                lastKnownTimestamps.putAll(current);
                log.debug("TrovePollerService: baseline initialized with {} troves", current.size());
                return;
            }
            List<String> changed = new ArrayList<>();
            for (Map.Entry<String, String> entry : current.entrySet()) {
                String prev = lastKnownTimestamps.get(entry.getKey());
                if (!entry.getValue().equals(prev)) {
                    changed.add(entry.getKey());
                }
            }
            // Also detect troves that disappeared from the manifest
            for (String prev : lastKnownTimestamps.keySet()) {
                if (!current.containsKey(prev) && !changed.contains(prev)) {
                    changed.add(prev);
                }
            }
            if (!changed.isEmpty() && !Set.copyOf(changed).equals(lastAnnounced)) {
                log.info("TrovePollerService: detected changes in troves (cumulative): {}", changed);
                stalenessRepository.markStale(changed);
                lastAnnounced = Set.copyOf(changed);
            }
        } catch (Exception e) {
            log.warn("TrovePollerService: poll tick failed: {}", e.getMessage());
        }
    }

    /**
     * Called after a successful reload to reset the baseline and the cumulative changed-set
     * so the new data becomes the reference point for future comparisons.
     */
    public void resume() {
        try {
            Map<String, String> current = searchDataService.readTroveManifestTimestamps();
            if (!current.isEmpty()) {
                lastKnownTimestamps.clear();
                lastKnownTimestamps.putAll(current);
            }
        } catch (Exception e) {
            log.warn("TrovePollerService.resume: could not refresh baseline: {}", e.getMessage());
        }
        lastAnnounced = Set.of();
        log.info("TrovePollerService: resumed polling");
    }
}
