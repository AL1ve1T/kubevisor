package com.kubetopo.support;

import org.apache.catalina.connector.Connector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.stereotype.Component;

/**
 * Exposes the OTLP/HTTP ingestion endpoints (/v1/traces, /v1/metrics) on a
 * dedicated, configurable port (default 4318 — the OTLP/HTTP standard port),
 * separate from the graph API / management port ({@code server.port}, default
 * 8080).
 *
 * <p>
 * This decouples the backend from any particular telemetry source: an
 * OpenTelemetry Collector running in <em>any</em> Kubernetes cluster can export
 * to the backend using its conventional {@code <host>:4318} OTLP/HTTP endpoint,
 * rather than being wired to the application port. The graph API consumed by
 * the
 * frontend stays on {@code server.port}.
 *
 * <p>
 * The additional Tomcat connector shares the servlet context, so the same
 * endpoints remain reachable on the main port too; the dedicated port simply
 * makes the backend a drop-in OTLP/HTTP receiver. Set
 * {@code kubetopo.otlp.http-port} to {@code 0} or to the same value as
 * {@code server.port} to disable the extra connector.
 */
@Component
public class OtlpConnectorConfig implements WebServerFactoryCustomizer<TomcatServletWebServerFactory> {

    private static final Logger log = LoggerFactory.getLogger(OtlpConnectorConfig.class);

    private final int otlpPort;
    private final int serverPort;

    public OtlpConnectorConfig(KubetopoProperties properties,
            @Value("${server.port:8080}") int serverPort) {
        this.otlpPort = properties.getOtlp().getHttpPort();
        this.serverPort = serverPort;
    }

    @Override
    public void customize(TomcatServletWebServerFactory factory) {
        if (otlpPort <= 0 || otlpPort == serverPort) {
            log.info("OTLP/HTTP ingestion served on the main server port {}", serverPort);
            return;
        }

        Connector connector = new Connector(TomcatServletWebServerFactory.DEFAULT_PROTOCOL);
        connector.setPort(otlpPort);
        factory.addAdditionalTomcatConnectors(connector);
        log.info("OTLP/HTTP ingestion connector listening on port {} (graph API on {})", otlpPort, serverPort);
    }
}
