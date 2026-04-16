package com.kubeflow.ingestion;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/v1")
@Tag(name = "Ingestion", description = "OTLP/HTTP trace ingestion")
public class OtlpTraceIngestionController {

    private static final Logger log = LoggerFactory.getLogger(OtlpTraceIngestionController.class);

    private final IngestionPipeline ingestionPipeline;
    private final ObjectMapper objectMapper;

    public OtlpTraceIngestionController(IngestionPipeline ingestionPipeline,
            ObjectMapper objectMapper) {
        this.ingestionPipeline = ingestionPipeline;
        this.objectMapper = objectMapper;
    }

    @Operation(summary = "Receive OTLP trace payload", description = "Accepts an OTLP/HTTP JSON export request. Spans are parsed, normalized into topology events, and aggregated into the live graph.")
    @ApiResponse(responseCode = "200", description = "Payload accepted")
    @PostMapping(value = "/traces", consumes = {
            MediaType.APPLICATION_JSON_VALUE,
            "application/x-protobuf",
            MediaType.APPLICATION_OCTET_STREAM_VALUE
    })
    public ResponseEntity<Void> receiveTraces(HttpServletRequest request,
            @RequestBody(required = false) byte[] rawBody) {
        Map<String, Object> payload;
        try {
            payload = parsePayload(request, rawBody);
        } catch (IOException e) {
            log.warn("Failed to parse OTLP traces payload", e);
            return ResponseEntity.badRequest().build();
        }

        log.debug("Received OTLP trace payload");
        ingestionPipeline.process(payload);
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
