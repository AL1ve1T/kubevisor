package com.kubeflow.ingestion;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.zip.GZIPInputStream;

@RestController
@RequestMapping("/v1")
@Tag(name = "Ingestion", description = "OTLP/HTTP metrics ingestion")
public class OtlpMetricsIngestionController {

    private static final Logger log = LoggerFactory.getLogger(OtlpMetricsIngestionController.class);

    private final NetworkFlowProcessor networkFlowProcessor;
    private final ObjectMapper objectMapper;

    public OtlpMetricsIngestionController(NetworkFlowProcessor networkFlowProcessor,
            ObjectMapper objectMapper) {
        this.networkFlowProcessor = networkFlowProcessor;
        this.objectMapper = objectMapper;
    }

    @Operation(summary = "Receive OTLP metrics payload", description = "Accepts OTLP/HTTP metrics. Network flow metrics from Beyla are processed into topology edges.")
    @ApiResponse(responseCode = "200", description = "Payload accepted")
    @PostMapping(value = "/metrics", consumes = {
            MediaType.APPLICATION_JSON_VALUE,
            "application/x-protobuf",
            MediaType.APPLICATION_OCTET_STREAM_VALUE
    })
    public ResponseEntity<Void> receiveMetrics(HttpServletRequest request,
            @RequestBody(required = false) byte[] rawBody) {
        Map<String, Object> payload;
        try {
            payload = parsePayload(request, rawBody);
        } catch (IOException e) {
            log.warn("Failed to parse OTLP metrics payload", e);
            return ResponseEntity.badRequest().build();
        }

        log.debug("Received OTLP metrics payload");
        networkFlowProcessor.processMetrics(payload);
        return ResponseEntity.ok().build();
    }

    private Map<String, Object> parsePayload(HttpServletRequest request, byte[] rawBody) throws IOException {
        InputStream inputStream = rawBody != null
                ? new ByteArrayInputStream(rawBody)
                : request.getInputStream();
        String contentEncoding = request.getHeader("Content-Encoding");
        if (contentEncoding != null && contentEncoding.toLowerCase().contains("gzip")) {
            inputStream = new GZIPInputStream(inputStream);
        }
        return objectMapper.readValue(inputStream, new TypeReference<>() {
        });
    }
}
