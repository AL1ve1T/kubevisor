package com.kubeflow.api;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.GraphSnapshot;
import com.kubeflow.persistence.SnapshotPersistenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@RestController
@RequestMapping("/api")
@Tag(name = "Graph", description = "Live service topology graph")
public class GraphController {

    private final GraphStateManager graphStateManager;
    private final GraphUpdatePublisher graphUpdatePublisher;
    private final SnapshotPersistenceService snapshotPersistenceService;

    public GraphController(GraphStateManager graphStateManager,
            GraphUpdatePublisher graphUpdatePublisher,
            SnapshotPersistenceService snapshotPersistenceService) {
        this.graphStateManager = graphStateManager;
        this.graphUpdatePublisher = graphUpdatePublisher;
        this.snapshotPersistenceService = snapshotPersistenceService;
    }

    @Operation(summary = "Get current graph snapshot", description = "Returns all nodes, edges, and their rolling metrics")
    @ApiResponse(responseCode = "200", description = "Current topology graph", content = @Content(schema = @Schema(implementation = GraphSnapshot.class)))
    @GetMapping(value = "/graph", produces = MediaType.APPLICATION_JSON_VALUE)
    public GraphSnapshot getSnapshot() {
        return graphStateManager.buildSnapshot();
    }

    @Operation(summary = "Get historical graph snapshots", description = "Returns persisted snapshots within the given time range (up to 24 hours)")
    @ApiResponse(responseCode = "200", description = "List of historical topology snapshots", content = @Content(schema = @Schema(implementation = GraphSnapshot.class)))
    @GetMapping(value = "/graph/history", produces = MediaType.APPLICATION_JSON_VALUE)
    public List<GraphSnapshot> getHistory(
            @Parameter(description = "Start of time range (ISO-8601). Defaults to 1 hour ago.") @RequestParam(required = false) Instant from,
            @Parameter(description = "End of time range (ISO-8601). Defaults to now.") @RequestParam(required = false) Instant to) {
        Instant end = to != null ? to : Instant.now();
        Instant start = from != null ? from : end.minus(1, ChronoUnit.HOURS);
        return snapshotPersistenceService.getHistory(start, end);
    }

    @Operation(summary = "Stream live graph updates via SSE", description = "Server-Sent Events stream emitted once per second. Each event is named 'graph-update' and carries a GraphSnapshot JSON payload.")
    @ApiResponse(responseCode = "200", description = "SSE stream of GraphSnapshot events", content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE))
    @GetMapping(value = "/graph/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamUpdates() {
        return graphUpdatePublisher.subscribe();
    }
}
