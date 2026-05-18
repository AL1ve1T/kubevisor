package com.kubeflow.api;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.GraphSnapshot;
import com.kubeflow.persistence.SnapshotPersistenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
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

    @Operation(summary = "Get current graph snapshots", description = "Returns the live topology as an array of per-namespace GraphSnapshot objects. Each node carries CPU/memory utilization; each edge carries RPS, latency, error rate, and a `loadLevel` derived from the target node's resource pressure.")
    @ApiResponse(responseCode = "200", description = "Current topology graph — one GraphSnapshot per namespace", content = @Content(array = @ArraySchema(schema = @Schema(implementation = GraphSnapshot.class))))
    @GetMapping(value = "/graph", produces = MediaType.APPLICATION_JSON_VALUE)
    public List<GraphSnapshot> getSnapshots(
            @Parameter(description = "Filter to a specific namespace. Omit to receive all namespaces.") @RequestParam(required = false) String namespace) {
        if (namespace != null) {
            return List.of(graphStateManager.buildSnapshot(namespace));
        }
        return graphStateManager.buildSnapshots();
    }

    @Operation(summary = "Get historical graph snapshots", description = "Returns persisted snapshots within the requested time range (rolling 24-hour retention). Useful for replaying topology changes or debugging transient spikes.")
    @ApiResponse(responseCode = "200", description = "List of historical topology snapshots ordered by capture time", content = @Content(array = @ArraySchema(schema = @Schema(implementation = GraphSnapshot.class))))
    @GetMapping(value = "/graph/history", produces = MediaType.APPLICATION_JSON_VALUE)
    public List<GraphSnapshot> getHistory(
            @Parameter(description = "Start of time range (ISO-8601). Defaults to 1 hour ago.") @RequestParam(required = false) Instant from,
            @Parameter(description = "End of time range (ISO-8601). Defaults to now.") @RequestParam(required = false) Instant to,
            @Parameter(description = "Filter to a specific namespace.") @RequestParam(required = false) String namespace) {
        Instant end = to != null ? to : Instant.now();
        Instant start = from != null ? from : end.minus(1, ChronoUnit.HOURS);
        if (namespace != null) {
            return snapshotPersistenceService.getHistory(start, end, namespace);
        }
        return snapshotPersistenceService.getHistory(start, end);
    }

    @Operation(summary = "Stream live graph updates via SSE", description = "Server-Sent Events stream that pushes a `graph-update` event whenever the topology or metrics change. **Connect once; the server pushes updates automatically.** The initial event is sent immediately on connect and contains the full current graph state. Subsequent events are emitted after every ingestion batch that changes the graph. Each event `data` field is a JSON array of `GraphSnapshot` — one object per namespace.")
    @ApiResponse(responseCode = "200", description = "SSE stream. Each event: `event: graph-update\\ndata: GraphSnapshot[]`", content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE, schema = @Schema(implementation = GraphSnapshot.class)))
    @GetMapping(value = "/graph/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamUpdates() {
        return graphUpdatePublisher.subscribe();
    }
}
