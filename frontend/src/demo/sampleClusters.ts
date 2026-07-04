/**
 * Ready-to-render sample clusters. Each is a bundle of *real* Kubernetes
 * manifests — the same YAML you would `kubectl apply -f`. The demo parses them
 * exactly as it would a user's own pasted manifests, so they double as worked
 * examples of the env-based dependency wiring the parser understands.
 */
export interface SampleCluster {
    id: string;
    label: string;
    description: string;
    yaml: string;
}

const TICKETING_YAML = `# Ticketing platform — gateway → order/auth → ticket → postgres/redis
apiVersion: v1
kind: ConfigMap
metadata:
  name: gateway-config
  namespace: ticketing
data:
  UPSTREAM_ORDER_URL: http://order-service:8082
  UPSTREAM_AUTH_URL: http://auth-service:8081
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: ticketing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
        - name: api-gateway
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: gateway-config
          readinessProbe:
            httpGet:
              path: /healthz
              port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
  namespace: ticketing
spec:
  type: LoadBalancer
  selector:
    app: api-gateway
  ports:
    - port: 80
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-config
  namespace: ticketing
data:
  SERVICES_AUTH_URL: http://auth-service:8081
  SERVICES_TICKET_URL: http://ticket-service:8083
  DB_HOST: postgres
  CACHE_HOST: redis
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: ticketing
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: ghcr.io/acme/order-service:1.8.0
          ports:
            - containerPort: 8082
          envFrom:
            - configMapRef:
                name: order-config
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8082
---
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: ticketing
spec:
  selector:
    app: order-service
  ports:
    - port: 8082
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: ticketing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
        - name: auth-service
          image: ghcr.io/acme/auth-service:1.4.2
          ports:
            - containerPort: 8081
          env:
            - name: DB_HOST
              value: postgres
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8081
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: ticketing
spec:
  selector:
    app: auth-service
  ports:
    - port: 8081
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ticket-config
  namespace: ticketing
data:
  DB_HOST: postgres
  CACHE_HOST: redis
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ticket-service
  namespace: ticketing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ticket-service
  template:
    metadata:
      labels:
        app: ticket-service
    spec:
      containers:
        - name: ticket-service
          image: ghcr.io/acme/ticket-service:2.1.0
          ports:
            - containerPort: 8083
          envFrom:
            - configMapRef:
                name: ticket-config
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8083
---
apiVersion: v1
kind: Service
metadata:
  name: ticket-service
  namespace: ticketing
spec:
  selector:
    app: ticket-service
  ports:
    - port: 8083
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: ticketing
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "postgres"]
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: ticketing
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: ticketing
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: ticketing
spec:
  selector:
    app: redis
  ports:
    - port: 6379
`;

const STORE_YAML = `# Online store — storefront → catalog/cart/checkout → payment → postgres/redis/kafka
apiVersion: v1
kind: ConfigMap
metadata:
  name: storefront-config
  namespace: shop
data:
  CATALOG_URL: http://catalog-service:8080
  CART_URL: http://cart-service:8080
  CHECKOUT_URL: http://checkout-service:8080
  USER_URL: http://user-service:8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: shop
spec:
  replicas: 3
  selector:
    matchLabels:
      app: storefront
  template:
    metadata:
      labels:
        app: storefront
    spec:
      containers:
        - name: storefront
          image: ghcr.io/acme/storefront:3.2.0
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: storefront-config
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: storefront
  namespace: shop
spec:
  type: LoadBalancer
  selector:
    app: storefront
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: catalog-config
  namespace: shop
data:
  DATABASE_HOST: postgres
  REDIS_HOST: redis
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: catalog-service
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: catalog-service
  template:
    metadata:
      labels:
        app: catalog-service
    spec:
      containers:
        - name: catalog-service
          image: ghcr.io/acme/catalog-service:2.0.1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: catalog-config
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: catalog-service
  namespace: shop
spec:
  selector:
    app: catalog-service
  ports:
    - port: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cart-service
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cart-service
  template:
    metadata:
      labels:
        app: cart-service
    spec:
      containers:
        - name: cart-service
          image: ghcr.io/acme/cart-service:1.5.0
          ports:
            - containerPort: 8080
          env:
            - name: REDIS_HOST
              value: redis
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: cart-service
  namespace: shop
spec:
  selector:
    app: cart-service
  ports:
    - port: 8080
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-config
  namespace: shop
data:
  CATALOG_URL: http://catalog-service:8080
  PAYMENT_URL: http://payment-service:8080
  DATABASE_HOST: postgres
  KAFKA_BROKERS: kafka:9092
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-service
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-service
  template:
    metadata:
      labels:
        app: checkout-service
    spec:
      containers:
        - name: checkout-service
          image: ghcr.io/acme/checkout-service:2.3.0
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: checkout-config
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-service
  namespace: shop
spec:
  selector:
    app: checkout-service
  ports:
    - port: 8080
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: payment-config
  namespace: shop
data:
  DATABASE_HOST: postgres
  KAFKA_BROKERS: kafka:9092
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      containers:
        - name: payment-service
          image: ghcr.io/acme/payment-service:1.9.4
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: payment-config
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: payment-service
  namespace: shop
spec:
  selector:
    app: payment-service
  ports:
    - port: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
        - name: user-service
          image: ghcr.io/acme/user-service:1.2.0
          ports:
            - containerPort: 8080
          env:
            - name: DATABASE_HOST
              value: postgres
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: shop
spec:
  selector:
    app: user-service
  ports:
    - port: 8080
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: shop
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "postgres"]
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: shop
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: shop
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: shop
spec:
  selector:
    app: redis
  ports:
    - port: 6379
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: shop
spec:
  serviceName: kafka
  replicas: 3
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
        - name: kafka
          image: bitnami/kafka:3.7
          ports:
            - containerPort: 9092
---
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: shop
spec:
  selector:
    app: kafka
  ports:
    - port: 9092
`;

const BOUTIQUE_YAML = `# Online Boutique (Google microservices-demo) — frontend fans out to many services
apiVersion: v1
kind: Service
metadata:
  name: frontend-external
  namespace: boutique
spec:
  type: LoadBalancer
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: boutique
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: server
          image: microservices-demo/frontend:v0.10.5
          ports:
            - containerPort: 8080
          env:
            - name: PRODUCT_CATALOG_SERVICE_ADDR
              value: "productcatalogservice:3550"
            - name: CURRENCY_SERVICE_ADDR
              value: "currencyservice:7000"
            - name: CART_SERVICE_ADDR
              value: "cartservice:7070"
            - name: RECOMMENDATION_SERVICE_ADDR
              value: "recommendationservice:8080"
            - name: SHIPPING_SERVICE_ADDR
              value: "shippingservice:50051"
            - name: CHECKOUT_SERVICE_ADDR
              value: "checkoutservice:5050"
            - name: AD_SERVICE_ADDR
              value: "adservice:9555"
          readinessProbe:
            httpGet:
              path: /_healthz
              port: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkoutservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: checkoutservice
  template:
    metadata:
      labels:
        app: checkoutservice
    spec:
      containers:
        - name: server
          image: microservices-demo/checkoutservice:v0.10.5
          ports:
            - containerPort: 5050
          env:
            - name: PRODUCT_CATALOG_SERVICE_ADDR
              value: "productcatalogservice:3550"
            - name: SHIPPING_SERVICE_ADDR
              value: "shippingservice:50051"
            - name: PAYMENT_SERVICE_ADDR
              value: "paymentservice:50051"
            - name: EMAIL_SERVICE_ADDR
              value: "emailservice:5000"
            - name: CURRENCY_SERVICE_ADDR
              value: "currencyservice:7000"
            - name: CART_SERVICE_ADDR
              value: "cartservice:7070"
          readinessProbe:
            grpc:
              port: 5050
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recommendationservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: recommendationservice
  template:
    metadata:
      labels:
        app: recommendationservice
    spec:
      containers:
        - name: server
          image: microservices-demo/recommendationservice:v0.10.5
          ports:
            - containerPort: 8080
          env:
            - name: PRODUCT_CATALOG_SERVICE_ADDR
              value: "productcatalogservice:3550"
          readinessProbe:
            grpc:
              port: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cartservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: cartservice
  template:
    metadata:
      labels:
        app: cartservice
    spec:
      containers:
        - name: server
          image: microservices-demo/cartservice:v0.10.5
          ports:
            - containerPort: 7070
          env:
            - name: REDIS_ADDR
              value: "redis-cart:6379"
          readinessProbe:
            grpc:
              port: 7070
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: productcatalogservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: productcatalogservice
  template:
    metadata:
      labels:
        app: productcatalogservice
    spec:
      containers:
        - name: server
          image: microservices-demo/productcatalogservice:v0.10.5
          ports:
            - containerPort: 3550
          readinessProbe:
            grpc:
              port: 3550
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: currencyservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: currencyservice
  template:
    metadata:
      labels:
        app: currencyservice
    spec:
      containers:
        - name: server
          image: microservices-demo/currencyservice:v0.10.5
          ports:
            - containerPort: 7000
          readinessProbe:
            grpc:
              port: 7000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shippingservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: shippingservice
  template:
    metadata:
      labels:
        app: shippingservice
    spec:
      containers:
        - name: server
          image: microservices-demo/shippingservice:v0.10.5
          ports:
            - containerPort: 50051
          readinessProbe:
            grpc:
              port: 50051
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paymentservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: paymentservice
  template:
    metadata:
      labels:
        app: paymentservice
    spec:
      containers:
        - name: server
          image: microservices-demo/paymentservice:v0.10.5
          ports:
            - containerPort: 50051
          readinessProbe:
            grpc:
              port: 50051
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: emailservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: emailservice
  template:
    metadata:
      labels:
        app: emailservice
    spec:
      containers:
        - name: server
          image: microservices-demo/emailservice:v0.10.5
          ports:
            - containerPort: 8080
          readinessProbe:
            grpc:
              port: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: adservice
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: adservice
  template:
    metadata:
      labels:
        app: adservice
    spec:
      containers:
        - name: server
          image: microservices-demo/adservice:v0.10.5
          ports:
            - containerPort: 9555
          readinessProbe:
            grpc:
              port: 9555
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-cart
  namespace: boutique
spec:
  selector:
    matchLabels:
      app: redis-cart
  template:
    metadata:
      labels:
        app: redis-cart
    spec:
      containers:
        - name: redis
          image: redis:alpine
          ports:
            - containerPort: 6379
          readinessProbe:
            tcpSocket:
              port: 6379
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loadgenerator
  namespace: boutique
spec:
  replicas: 1
  selector:
    matchLabels:
      app: loadgenerator
  template:
    metadata:
      labels:
        app: loadgenerator
    spec:
      containers:
        - name: main
          image: microservices-demo/loadgenerator:v0.10.5
          env:
            - name: FRONTEND_ADDR
              value: "frontend:80"
`;

export const SAMPLE_CLUSTERS: SampleCluster[] = [
    {
        id: "ticketing",
        label: "Ticketing platform",
        description: "Gateway, order/auth/ticket services, Postgres and Redis.",
        yaml: TICKETING_YAML,
    },
    {
        id: "store",
        label: "Online store",
        description: "Storefront, catalog/cart/checkout/payment, Postgres, Redis and Kafka.",
        yaml: STORE_YAML,
    },
    {
        id: "boutique",
        label: "Online Boutique",
        description: "Google microservices-demo: frontend fans out to many services (high fan-out).",
        yaml: BOUTIQUE_YAML,
    },
];

export const DEFAULT_SAMPLE_ID = SAMPLE_CLUSTERS[0].id;
