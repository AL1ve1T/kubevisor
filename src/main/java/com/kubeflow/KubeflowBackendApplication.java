package com.kubeflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class KubeflowBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(KubeflowBackendApplication.class, args);
    }
}
