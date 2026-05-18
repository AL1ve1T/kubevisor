package com.kubeflow.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.Node;
import com.kubeflow.model.PodPhase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PodStatusScraperTest {

    private GraphStateManager manager;
    private PodStatusScraper scraper;

    @BeforeEach
    void setUp() {
        manager = new GraphStateManager(new KubeflowProperties());
        scraper = new PodStatusScraper(manager, new ObjectMapper(), new KubeflowProperties());
    }

    // -------------------------------------------------------------------------
    // classifyPod
    // -------------------------------------------------------------------------

    @Test
    void classifyPod_returnsRunning_whenReadyConditionTrue() {
        Map<String, Object> status = Map.of(
                "phase", "Running",
                "conditions", java.util.List.of(
                        Map.of("type", "Ready", "status", "True")),
                "containerStatuses", java.util.List.of(
                        Map.of("ready", true, "restartCount", 0, "state", Map.of())));

        assertEquals(PodPhase.RUNNING, scraper.classifyPod(status));
    }

    @Test
    void classifyPod_returnsCrashLoop_whenContainerWaitingCrashLoopBackOff() {
        Map<String, Object> status = Map.of(
                "phase", "Running",
                "conditions", java.util.List.of(
                        Map.of("type", "Ready", "status", "False")),
                "containerStatuses", java.util.List.of(
                        Map.of("ready", false, "restartCount", 5,
                                "state", Map.of("waiting", Map.of("reason", "CrashLoopBackOff")))));

        assertEquals(PodPhase.CRASH_LOOP, scraper.classifyPod(status));
    }

    @Test
    void classifyPod_returnsCrashLoop_whenContainerTerminatedOOMKilled() {
        Map<String, Object> status = Map.of(
                "phase", "Running",
                "conditions", java.util.List.of(
                        Map.of("type", "Ready", "status", "False")),
                "containerStatuses", java.util.List.of(
                        Map.of("ready", false, "restartCount", 2,
                                "state", Map.of("terminated", Map.of("reason", "OOMKilled")))));

        assertEquals(PodPhase.CRASH_LOOP, scraper.classifyPod(status));
    }

    @Test
    void classifyPod_returnsNotReady_whenRunningButReadyFalse() {
        Map<String, Object> status = Map.of(
                "phase", "Running",
                "conditions", java.util.List.of(
                        Map.of("type", "Ready", "status", "False")),
                "containerStatuses", java.util.List.of(
                        Map.of("ready", false, "restartCount", 0, "state", Map.of())));

        assertEquals(PodPhase.NOT_READY, scraper.classifyPod(status));
    }

    @Test
    void classifyPod_returnsPending_whenPhaseIsPending() {
        Map<String, Object> status = Map.of(
                "phase", "Pending",
                "conditions", java.util.List.of(),
                "containerStatuses", java.util.List.of());

        assertEquals(PodPhase.PENDING, scraper.classifyPod(status));
    }

    @Test
    void classifyPod_returnsFailed_whenPhaseIsFailed() {
        Map<String, Object> status = Map.of(
                "phase", "Failed",
                "conditions", java.util.List.of(),
                "containerStatuses", java.util.List.of());

        assertEquals(PodPhase.FAILED, scraper.classifyPod(status));
    }

    // -------------------------------------------------------------------------
    // sumRestarts
    // -------------------------------------------------------------------------

    @Test
    void sumRestarts_sumsAcrossAllContainers() {
        Map<String, Object> status = Map.of(
                "containerStatuses", java.util.List.of(
                        Map.of("restartCount", 3, "state", Map.of()),
                        Map.of("restartCount", 7, "state", Map.of())));

        assertEquals(10, scraper.sumRestarts(status));
    }

    @Test
    void sumRestarts_returnsZero_whenNoContainerStatuses() {
        Map<String, Object> status = Map.of("containerStatuses", java.util.List.of());
        assertEquals(0, scraper.sumRestarts(status));
    }

    // -------------------------------------------------------------------------
    // processPodList — integration through the full parse → GraphStateManager path
    // -------------------------------------------------------------------------

    @Test
    void processPodList_updatesNodeWithCrashLoopPhase() throws Exception {
        String podListJson = """
                {
                  "items": [
                    {
                      "metadata": { "name": "order-service-abc12-xyz99", "labels": { "app": "order-service" } },
                      "status": {
                        "phase": "Running",
                        "conditions": [{ "type": "Ready", "status": "False" }],
                        "containerStatuses": [{
                          "ready": false,
                          "restartCount": 17,
                          "state": { "waiting": { "reason": "CrashLoopBackOff" } }
                        }]
                      }
                    }
                  ]
                }
                """;

        scraper.processPodList("default", podListJson);

        Node node = manager.getNodes().get("order-service");
        assertNotNull(node, "order-service node should have been created");
        assertEquals(PodPhase.CRASH_LOOP, node.getPodPhase());
        assertEquals(17, node.getRestartCount());
    }

    @Test
    void processPodList_updatesNodeWithRunningPhase() throws Exception {
        String podListJson = """
                {
                  "items": [
                    {
                      "metadata": { "name": "auth-service-abc12-xyz01", "labels": { "app": "auth-service" } },
                      "status": {
                        "phase": "Running",
                        "conditions": [{ "type": "Ready", "status": "True" }],
                        "containerStatuses": [{ "ready": true, "restartCount": 1, "state": {} }]
                      }
                    }
                  ]
                }
                """;

        scraper.processPodList("default", podListJson);

        Node node = manager.getNodes().get("auth-service");
        assertNotNull(node);
        assertEquals(PodPhase.RUNNING, node.getPodPhase());
        assertEquals(1, node.getRestartCount());
    }

    @Test
    void processPodList_reportWorstCaseAcrossReplicas() throws Exception {
        // Two replicas of the same deployment: one running, one in crash loop.
        String podListJson = """
                {
                  "items": [
                    {
                      "metadata": { "name": "ticket-service-abc12-rep01", "labels": { "app": "ticket-service" } },
                      "status": {
                        "phase": "Running",
                        "conditions": [{ "type": "Ready", "status": "True" }],
                        "containerStatuses": [{ "ready": true, "restartCount": 0, "state": {} }]
                      }
                    },
                    {
                      "metadata": { "name": "ticket-service-abc12-rep02", "labels": { "app": "ticket-service" } },
                      "status": {
                        "phase": "Running",
                        "conditions": [{ "type": "Ready", "status": "False" }],
                        "containerStatuses": [{
                          "ready": false,
                          "restartCount": 4,
                          "state": { "waiting": { "reason": "CrashLoopBackOff" } }
                        }]
                      }
                    }
                  ]
                }
                """;

        scraper.processPodList("default", podListJson);

        Node node = manager.getNodes().get("ticket-service");
        assertNotNull(node);
        assertEquals(PodPhase.CRASH_LOOP, node.getPodPhase(), "worst-case phase should win");
        assertEquals(4, node.getRestartCount());
    }
}
