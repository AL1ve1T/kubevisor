package com.kubeflow.topology;

import com.kubeflow.model.NodeType;
import com.kubeflow.parsing.ParsedSpan;
import org.springframework.stereotype.Component;

/**
 * Resolves the target node for a given span based on span attributes.
 * Determines whether the target is a service, database, or external dependency.
 */
@Component
public class TopologyResolver {

    public record ResolvedTarget(
            String serviceName,
            String namespace,
            NodeType nodeType) {
    }

    public ResolvedTarget resolveTarget(ParsedSpan span) {
        // Check for database calls
        ResolvedTarget dbTarget = resolveDatabase(span);
        if (dbTarget != null)
            return dbTarget;

        // Check for HTTP/RPC calls to other services
        ResolvedTarget serviceTarget = resolveService(span);
        if (serviceTarget != null)
            return serviceTarget;

        // Fall back to span name as target
        if (span.spanName() != null && !span.spanName().isBlank()) {
            return new ResolvedTarget(span.spanName(), null, NodeType.EXTERNAL);
        }

        return null;
    }

    private ResolvedTarget resolveDatabase(ParsedSpan span) {
        String dbSystem = span.attributes().get("db.system");
        if (dbSystem == null)
            dbSystem = span.attributes().get("db.system.name");
        if (dbSystem == null)
            return null;

        String dbName = span.attributes().get("db.name");
        if (dbName == null)
            dbName = span.attributes().get("db.namespace");
        String targetName = dbName != null ? dbName : dbSystem;

        return new ResolvedTarget(targetName, null, NodeType.DATABASE);
    }

    private ResolvedTarget resolveService(ParsedSpan span) {
        // peer.service is the canonical way to identify the target service
        String peerService = span.attributes().get("peer.service");
        if (peerService != null) {
            return new ResolvedTarget(peerService, null, NodeType.SERVICE);
        }

        // Try server address or net.peer.name
        String serverAddress = span.attributes().get("server.address");
        if (serverAddress == null)
            serverAddress = span.attributes().get("net.peer.name");
        if (serverAddress == null)
            serverAddress = span.attributes().get("http.host");

        if (serverAddress != null) {
            // Strip port if present
            String serviceName = serverAddress.contains(":") ? serverAddress.substring(0, serverAddress.indexOf(':'))
                    : serverAddress;
            return new ResolvedTarget(serviceName, null, NodeType.SERVICE);
        }

        // Try URL-based resolution
        String url = span.attributes().get("http.url");
        if (url == null)
            url = span.attributes().get("url.full");
        if (url != null) {
            String host = extractHostFromUrl(url);
            if (host != null) {
                return new ResolvedTarget(host, null, NodeType.EXTERNAL);
            }
        }

        return null;
    }

    private String extractHostFromUrl(String url) {
        try {
            // Simple host extraction: skip scheme, extract host before port/path
            int schemeEnd = url.indexOf("://");
            if (schemeEnd < 0)
                return null;
            String rest = url.substring(schemeEnd + 3);
            int pathStart = rest.indexOf('/');
            String hostPort = pathStart >= 0 ? rest.substring(0, pathStart) : rest;
            int portStart = hostPort.indexOf(':');
            return portStart >= 0 ? hostPort.substring(0, portStart) : hostPort;
        } catch (Exception e) {
            return null;
        }
    }
}
