package com.example.morsor.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Background poller that compares trove manifest timestamps to a baseline and marks the
 * {@code trove_staleness} DB row when any trove has changed. Polling is paused once a
 * stale state is detected and resumes only after {@link #resume()} is called (i.e. after
 * a successful manual reload).
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

    /** True when a change has been detected; polling is a no-op until resume() is called. */
    private final AtomicBoolean paused = new AtomicBoolean(false);

    /** Last known snapshot of (troveId → change token). */
    private final Map<String, String> lastKnownTimestamps = new ConcurrentHashMap<>();

    public TrovePollerService(SearchDataService searchDataService,
                               TroveStalenessRepository stalenessRepository) {
        this.searchDataService = searchDataService;
        this.stalenessRepository = stalenessRepository;
    }

    @Scheduled(fixedDelayString = "${moocho.poll.interval-ms:10000}")
    public void poll() {
        if (!pollEnabled || paused.get()) {
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
            if (!changed.isEmpty()) {
                log.info("TrovePollerService: detected changes in troves: {}; marking stale and pausing", changed);
                stalenessRepository.markStale(changed);
                paused.set(true);
            }
        } catch (Exception e) {
            log.warn("TrovePollerService: poll tick failed: {}", e.getMessage());
        }
    }

    /**
     * Called after a successful reload to clear the paused state and update the baseline
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
        paused.set(false);
        log.info("TrovePollerService: resumed polling");
    }
}
