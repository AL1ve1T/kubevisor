package com.kubeflow.normalization;

import com.kubeflow.model.InteractionEvent;
import com.kubeflow.model.NodeType;
import com.kubeflow.parsing.ParsedSpan;
import com.kubeflow.topology.PodIpResolver;
import com.kubeflow.topology.TopologyResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Converts ParsedSpan objects into normalized InteractionEvent objects.
 * Client spans produce edges from source to resolved target.
 * Server spans produce edges from inferred caller to the receiving service.
 */
@Component
public class SpanNormalizer {

    private static final Logger log = LoggerFactory.getLogger(SpanNormalizer.class);

    private final TopologyResolver topologyResolver;
    private final PodIpResolver podIpResolver;

    public SpanNormalizer(TopologyResolver topologyResolver, PodIpResolver podIpResolver) {
        this.topologyResolver = topologyResolver;
        this.podIpResolver = podIpResolver;
    }

    public InteractionEvent normalize(ParsedSpan span) {
        if (span.isClientSpan()) {
            return normalizeClientSpan(span);
        }
        if (span.isServerSpan()) {
            return normalizeServerSpan(span);
        }
        return null;
    }

    private InteractionEvent normalizeClientSpan(ParsedSpan span) {
        TopologyResolver.ResolvedTarget target = topologyResolver.resolveTarget(span);
        if (target == null) {
            log.debug("Could not resolve target for client span: traceId={}, spanId={}", span.traceId(), span.spanId());
            return null;
        }

        return new InteractionEvent(
                span.traceId(),
                span.spanId(),
                span.serviceName(),
                span.serviceNamespace(),
                target.serviceName(),
                target.namespace(),
                target.nodeType(),
                resolveProtocol(span),
                span.durationMs(),
                span.isError(),
                span.startInstant());
    }

    private InteractionEvent normalizeServerSpan(ParsedSpan span) {
        String caller = resolveCallerService(span);
        if (caller == null) {
            return null;
        }

        return new InteractionEvent(
                span.traceId(),
                span.spanId(),
                caller,
                null,
                span.serviceName(),
                span.serviceNamespace(),
                NodeType.SERVICE,
                resolveProtocol(span),
                span.durationMs(),
                span.isError(),
                span.startInstant());
    }

    private String resolveCallerService(ParsedSpan span) {
        // Check for explicit caller service attributes
        String peerService = span.attributes().get("peer.service");
        if (peerService != null)
            return peerService;

        String clientName = span.attributes().get("client.service.name");
        if (clientName != null)
            return clientName;

        // Resolve caller from client.address (pod IP) via learned mappings
        String clientAddress = span.attributes().get("client.address");
        if (clientAddress != null) {
            String resolved = podIpResolver.resolve(clientAddress);
            if (resolved != null)
                return resolved;
            log.debug("Could not resolve client.address={} to a service name", clientAddress);
        }

        return null;
    }

    private String resolveProtocol(ParsedSpan span) {
        String dbSystem = span.attributes().get("db.system");
        if (dbSystem == null)
            dbSystem = span.attributes().get("db.system.name");
        if (dbSystem != null)
            return dbSystem;

        String rpcSystem = span.attributes().get("rpc.system");
        if (rpcSystem != null)
            return rpcSystem;

        String httpMethod = span.attributes().get("http.method");
        if (httpMethod == null)
            httpMethod = span.attributes().get("http.request.method");
        if (httpMethod != null)
            return "HTTP";

        return "unknown";
    }
}
