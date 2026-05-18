package com.kubeflow.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kubeflow.model.GraphSnapshot;
import com.kubeflow.support.KubeflowProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Persists graph snapshots to the database and handles 24-hour retention
 * cleanup.
 */
@Service
public class SnapshotPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(SnapshotPersistenceService.class);

    private final GraphSnapshotRepository repository;
    private final ObjectMapper objectMapper;
    private final KubeflowProperties properties;

    public SnapshotPersistenceService(GraphSnapshotRepository repository,
            ObjectMapper objectMapper,
            KubeflowProperties properties) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public void save(GraphSnapshot snapshot) {
        try {
            String json = objectMapper.writeValueAsString(snapshot);
            repository.save(new GraphSnapshotEntity(snapshot.generatedAt(), snapshot.namespace(), json));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize graph snapshot", e);
        }
    }

    public List<GraphSnapshot> getHistory(Instant from, Instant to) {
        return deserializeEntities(repository.findByCapturedAtBetweenOrderByCapturedAtAsc(from, to));
    }

    public List<GraphSnapshot> getHistory(Instant from, Instant to, String namespace) {
        return deserializeEntities(
                repository.findByNamespaceAndCapturedAtBetweenOrderByCapturedAtAsc(namespace, from, to));
    }

    private List<GraphSnapshot> deserializeEntities(List<GraphSnapshotEntity> entities) {
        return entities.stream()
                .map(entity -> {
                    try {
                        return objectMapper.readValue(entity.getSnapshotJson(), GraphSnapshot.class);
                    } catch (JsonProcessingException e) {
                        log.warn("Failed to deserialize snapshot id={}", entity.getId(), e);
                        return null;
                    }
                })
                .filter(s -> s != null)
                .toList();
    }

    @Transactional
    public int purgeOlderThan(Duration retention) {
        Instant cutoff = Instant.now().minus(retention);
        int deleted = repository.deleteByCapturedAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Purged {} snapshots older than {}", deleted, cutoff);
        }
        return deleted;
    }
}
