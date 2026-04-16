package com.kubeflow.ingestion;

import com.kubeflow.aggregation.GraphStateManager;
import com.kubeflow.model.InteractionEvent;
import com.kubeflow.normalization.SpanNormalizer;
import com.kubeflow.parsing.ParsedSpan;
import com.kubeflow.parsing.SpanParser;
import com.kubeflow.topology.PodIpResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Orchestrates the ingestion pipeline: parse -> normalize -> aggregate.
 */
@Component
public class IngestionPipeline {

    private static final Logger log = LoggerFactory.getLogger(IngestionPipeline.class);

    private final SpanParser spanParser;
    private final SpanNormalizer spanNormalizer;
    private final GraphStateManager graphStateManager;
    private final PodIpResolver podIpResolver;

    public IngestionPipeline(SpanParser spanParser,
            SpanNormalizer spanNormalizer,
            GraphStateManager graphStateManager,
            PodIpResolver podIpResolver) {
        this.spanParser = spanParser;
        this.spanNormalizer = spanNormalizer;
        this.graphStateManager = graphStateManager;
        this.podIpResolver = podIpResolver;
    }

    public void process(Map<String, Object> otlpPayload) {
        List<ParsedSpan> spans = spanParser.parseSpans(otlpPayload);
        log.debug("Parsed {} spans from OTLP payload", spans.size());

        for (ParsedSpan span : spans) {
            // Learn pod IP -> service name mapping from resource attributes
            String podIp = span.resourceAttributes().get("k8s.pod.ip");
            if (podIp != null && span.serviceName() != null) {
                podIpResolver.register(podIp, span.serviceName());
            }

            // Every span registers its service as a node
            graphStateManager.registerNode(span.serviceName(), span.serviceNamespace());

            // Normalize to discover topology direction (works for client and server spans)
            InteractionEvent event = spanNormalizer.normalize(span);
            if (event != null) {
                // First pass: build skeleton (nodes + empty edge)
                graphStateManager.registerEdge(event);
                // Second pass: fill in traffic metrics
                graphStateManager.recordTraffic(event);
            }
        }
    }
}
