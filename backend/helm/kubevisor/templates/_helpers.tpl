{{/*
Expand the name of the chart.
*/}}
{{- define "kubevisor.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name (resource-name prefix).
Honors fullnameOverride, else release-name + chart-name (deduplicated).
*/}}
{{- define "kubevisor.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Component resource names. */}}
{{- define "kubevisor.backend.fullname" -}}
{{- printf "%s-backend" (include "kubevisor.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubevisor.postgres.fullname" -}}
{{- printf "%s-postgres" (include "kubevisor.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubevisor.collector.fullname" -}}
{{- printf "%s-otel-collector" (include "kubevisor.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubevisor.frontend.fullname" -}}
{{- printf "%s-frontend" (include "kubevisor.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubevisor.beyla.fullname" -}}
{{- printf "%s-beyla" (include "kubevisor.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubevisor.beyla.serviceAccountName" -}}
{{- if .Values.beyla.serviceAccount.create -}}
{{- default (include "kubevisor.beyla.fullname" .) .Values.beyla.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.beyla.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* OTLP endpoint Beyla exports to — defaults to the in-cluster collector. */}}
{{- define "kubevisor.beyla.otlpEndpoint" -}}
{{- if .Values.beyla.otlpEndpoint -}}
{{- .Values.beyla.otlpEndpoint -}}
{{- else -}}
{{- printf "http://%s.%s.svc.cluster.local:%v" (include "kubevisor.collector.fullname" .) (include "kubevisor.namespace" .) .Values.otelCollector.service.httpPort -}}
{{- end -}}
{{- end -}}

{{/*
Target namespace for all namespaced resources. Defaults to namespace.name
("kubevisor"), falling back to the release namespace when blank.
*/}}
{{- define "kubevisor.namespace" -}}
{{- default .Release.Namespace .Values.namespace.name -}}
{{- end -}}

{{/* ServiceAccount name. */}}
{{- define "kubevisor.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "kubevisor.backend.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Chart label. */}}
{{- define "kubevisor.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels applied to every resource. */}}
{{- define "kubevisor.labels" -}}
helm.sh/chart: {{ include "kubevisor.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: kubevisor
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{/* Backend image reference (tag falls back to appVersion). */}}
{{- define "kubevisor.backend.image" -}}
{{- $tag := default .Chart.AppVersion .Values.backend.image.tag -}}
{{- printf "%s:%s" .Values.backend.image.repository $tag -}}
{{- end -}}

{{/* Frontend image reference (tag falls back to appVersion). */}}
{{- define "kubevisor.frontend.image" -}}
{{- $tag := default .Chart.AppVersion .Values.frontend.image.tag -}}
{{- printf "%s:%s" .Values.frontend.image.repository $tag -}}
{{- end -}}

{{/* ---- Database wiring (bundled postgres vs external) ---- */}}

{{- define "kubevisor.database.host" -}}
{{- if .Values.postgres.enabled -}}
{{- include "kubevisor.postgres.fullname" . -}}
{{- else -}}
{{- required "externalDatabase.host is required when postgres.enabled=false" .Values.externalDatabase.host -}}
{{- end -}}
{{- end -}}

{{- define "kubevisor.database.port" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.service.port -}}
{{- else -}}
{{- .Values.externalDatabase.port -}}
{{- end -}}
{{- end -}}

{{- define "kubevisor.database.name" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.auth.database -}}
{{- else -}}
{{- .Values.externalDatabase.database -}}
{{- end -}}
{{- end -}}

{{- define "kubevisor.database.secretName" -}}
{{- if .Values.postgres.enabled -}}
{{- default (include "kubevisor.postgres.fullname" .) .Values.postgres.auth.existingSecret -}}
{{- else -}}
{{- required "externalDatabase.existingSecret is required when postgres.enabled=false" .Values.externalDatabase.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "kubevisor.database.userKey" -}}
{{- if .Values.postgres.enabled -}}POSTGRES_USER{{- else -}}{{- .Values.externalDatabase.userKey -}}{{- end -}}
{{- end -}}

{{- define "kubevisor.database.passwordKey" -}}
{{- if .Values.postgres.enabled -}}POSTGRES_PASSWORD{{- else -}}{{- .Values.externalDatabase.passwordKey -}}{{- end -}}
{{- end -}}

{{/* Collector export endpoint — defaults to the in-cluster backend OTLP service. */}}
{{- define "kubevisor.collector.backendEndpoint" -}}
{{- if .Values.otelCollector.backendEndpoint -}}
{{- .Values.otelCollector.backendEndpoint -}}
{{- else -}}
{{- printf "http://%s.%s.svc.cluster.local:%v" (include "kubevisor.backend.fullname" .) (include "kubevisor.namespace" .) .Values.backend.service.otlpPort -}}
{{- end -}}
{{- end -}}
