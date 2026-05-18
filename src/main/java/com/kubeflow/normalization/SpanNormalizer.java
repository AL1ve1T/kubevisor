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
            // Skip infrastructure probes (Kubernetes liveness/readiness checks etc.)
            if (isInfraProbe(span)) {
                return null;
            }
            // Only fall back to "external" for HTTP/gRPC server spans.
            // Non-HTTP spans (postgres connections, raw TCP) have an unknowable caller
            // and are already covered by CLIENT spans from the OTel-instrumented caller.
            if (!isHttpServerSpan(span)) {
                return null;
            }
            caller = "external";
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

    private boolean isHttpServerSpan(ParsedSpan span) {
        // HTTP spans from Spring Boot OTel and Beyla always carry a method attribute
        return span.attributes().containsKey("method")
                || span.attributes().containsKey("http.method")
                || span.attributes().containsKey("rpc.method");
    }

    private boolean isInfraProbe(ParsedSpan span) {
        // Check the uri attribute (Spring Boot sets this to the path template)
        String uri = span.attributes().get("uri");
        if (uri == null)
            uri = span.attributes().get("http.target");
        if (uri == null)
            uri = span.attributes().get("url.path");
        if (uri != null) {
            String lower = uri.toLowerCase();
            if (lower.startsWith("/actuator") || lower.startsWith("/health")
                    || lower.startsWith("/readyz") || lower.startsWith("/livez")) {
                return true;
            }
        }
        // Fall back to span name (e.g. "http get /actuator/health")
        String spanName = span.spanName();
        return spanName != null && spanName.toLowerCase().contains("/actuator");
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
