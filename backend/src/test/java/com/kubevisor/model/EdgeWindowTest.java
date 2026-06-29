package com.kubevisor.model;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class EdgeWindowTest {

    private static final double EPS = 0.001;

    private static Instant sec(long second) {
        return Instant.ofEpochSecond(second);
    }

    @Test
    void freshEdge_allMetricsAreZero() {
        Edge edge = new Edge("src", "dst", "HTTP");

        assertEquals(0.0, edge.getRequestsPerSecond(), EPS);
        assertEquals(0.0, edge.getAverageLatencyMs(), EPS);
        assertEquals(0.0, edge.getErrorRate(), EPS);
        assertEquals(0.0, edge.getMaxLatencyMs(), EPS);
        assertEquals(0L, edge.getErrorCount());
    }

    @Test
    void reportsTheLastCompletedSecond() {
        Edge edge = new Edge("src", "dst", "HTTP");
        // Two requests in event-second 1000.
        edge.recordRequest(sec(1000), 100.0, false);
        edge.recordRequest(sec(1000), 200.0, true);
        // A later second arrives, completing second 1000 (it becomes "previous").
        edge.recordRequest(sec(1001), 50.0, false);

        Instant read = sec(1001); // within the hold window
        assertEquals(2.0, edge.getRequestsPerSecond(read), EPS);
        assertEquals(150.0, edge.getAverageLatencyMs(read), EPS);
        assertEquals(0.5, edge.getErrorRate(read), EPS);
        assertEquals(200.0, edge.getMaxLatencyMs(read), EPS);
        assertEquals(1L, edge.getErrorCount());
    }

    @Test
    void requestsPerSecond_isAPlainCountNotAnAverage() {
        Edge edge = new Edge("src", "dst", "HTTP");
        for (int i = 0; i < 10; i++) {
            edge.recordRequest(sec(500), 20.0, false);
        }
        edge.recordRequest(sec(501), 20.0, false); // completes second 500

        assertEquals(10.0, edge.getRequestsPerSecond(sec(501)), EPS);
    }

    @Test
    void batchedArrivalsAreSpreadByEventTime() {
        // 30 spans delivered together but carrying three different event-seconds,
        // representing a steady 10 req/s. The reported rate must be ~10, NOT 30 —
        // this is the regression guard for the batch-arrival flicker/spike.
        Edge edge = new Edge("src", "dst", "HTTP");
        for (long second = 7000; second <= 7002; second++) {
            for (int i = 0; i < 10; i++) {
                edge.recordRequest(sec(second), 10.0, false);
            }
        }
        // Latest is 7002; the completed second reported is 7001 with 10 requests.
        assertEquals(10.0, edge.getRequestsPerSecond(sec(7002)), EPS);
    }

    @Test
    void holdsLastValueBetweenExportBatches() {
        Edge edge = new Edge("src", "dst", "HTTP");
        edge.recordRequest(sec(2000), 10.0, false);
        edge.recordRequest(sec(2000), 10.0, false);
        edge.recordRequest(sec(2000), 10.0, false);
        edge.recordRequest(sec(2001), 10.0, false); // completes second 2000

        // The reported value holds steady across several read ticks while no new
        // batch arrives — it does not blink to zero between batches.
        assertEquals(3.0, edge.getRequestsPerSecond(sec(2001)), EPS);
        assertEquals(3.0, edge.getRequestsPerSecond(sec(2005)), EPS);
        assertEquals(3.0, edge.getRequestsPerSecond(sec(2009)), EPS);
    }

    @Test
    void metricsDecayToZeroWhenTrafficStops() {
        Edge edge = new Edge("src", "dst", "HTTP");
        edge.recordRequest(sec(3000), 10.0, false);
        edge.recordRequest(sec(3001), 10.0, false); // latest second = 3001

        // Reading more than the hold window past the newest traffic → zero.
        Instant later = sec(3001 + 11);
        assertEquals(0.0, edge.getRequestsPerSecond(later), EPS);
        assertEquals(0.0, edge.getAverageLatencyMs(later), EPS);
        assertEquals(0.0, edge.getErrorRate(later), EPS);
        assertEquals(0.0, edge.getMaxLatencyMs(later), EPS);
    }

    @Test
    void customHoldSecondsControlsHowSoonLoadDecays() {
        Edge edge = new Edge("src", "dst", "HTTP");
        edge.recordRequest(sec(5000), 10.0, false);
        edge.recordRequest(sec(5001), 10.0, false); // latest second = 5001

        // A short 3s hold: still lit 3s after the newest traffic, zero just past it.
        assertEquals(1.0, edge.getRequestsPerSecond(sec(5004), 3), EPS);
        assertEquals(0.0, edge.getRequestsPerSecond(sec(5005), 3), EPS);

        // A longer 20s hold keeps the same value lit well beyond the default window.
        assertEquals(1.0, edge.getRequestsPerSecond(sec(5001 + 15), 20), EPS);
    }

    @Test
    void maxLatencyMs_returnsMaxWithinTheReportedSecond() {
        Edge edge = new Edge("src", "dst", "HTTP");
        edge.recordRequest(sec(4000), 50.0, false);
        edge.recordRequest(sec(4000), 300.0, false);
        edge.recordRequest(sec(4000), 10.0, false);
        edge.recordRequest(sec(4001), 1.0, false); // completes second 4000

        assertEquals(300.0, edge.getMaxLatencyMs(sec(4001)), EPS);
    }

    @Test
    void lifetimeErrorCounter_increasesMonotonicallyAcrossSeconds() {
        Edge edge = new Edge("src", "dst", "HTTP");
        for (int i = 0; i < 10; i++) {
            edge.recordRequest(sec(5000 + i), 10.0, i % 3 == 0);
        }
        // errors at i = 0, 3, 6, 9 → 4 errors
        assertEquals(4L, edge.getErrorCount());
    }

    @Test
    void errorRate_isPerSecondNotLifetime() {
        Edge edge = new Edge("src", "dst", "HTTP");
        edge.recordRequest(sec(6000), 10.0, true);
        edge.recordRequest(sec(6000), 10.0, false);
        edge.recordRequest(sec(6000), 10.0, true);
        edge.recordRequest(sec(6000), 10.0, false);
        edge.recordRequest(sec(6001), 10.0, false); // completes second 6000

        assertEquals(0.5, edge.getErrorRate(sec(6001)), EPS);
        assertEquals(2L, edge.getErrorCount());
    }

    @Test
    void touch_doesNotAffectMetrics() {
        Edge edge = new Edge("src", "dst", "HTTP");
        edge.touch();

        assertEquals(0.0, edge.getRequestsPerSecond(), EPS);
    }
}
