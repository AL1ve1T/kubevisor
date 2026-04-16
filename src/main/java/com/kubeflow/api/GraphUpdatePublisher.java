package com.kubeflow.api;

import com.kubeflow.model.GraphSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Manages SSE subscriptions and publishes graph updates to connected clients.
 */
@Component
public class GraphUpdatePublisher {

    private static final Logger log = LoggerFactory.getLogger(GraphUpdatePublisher.class);
    private static final long SSE_TIMEOUT = 300_000L; // 5 minutes

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        log.info("SSE client subscribed. Total clients: {}", emitters.size());
        return emitter;
    }

    public void publishUpdate(GraphSnapshot snapshot) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("graph-update")
                        .data(snapshot));
            } catch (IOException e) {
                emitter.complete();
                emitters.remove(emitter);
            }
        }
    }
}
