{{/*
Expand the name of the chart.
*/}}
{{- define "kubetopo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name (resource-name prefix).
Honors fullnameOverride, else release-name + chart-name (deduplicated).
*/}}
{{- define "kubetopo.fullname" -}}
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
{{- define "kubetopo.backend.fullname" -}}
{{- printf "%s-backend" (include "kubetopo.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubetopo.postgres.fullname" -}}
{{- printf "%s-postgres" (include "kubetopo.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubetopo.collector.fullname" -}}
{{- printf "%s-otel-collector" (include "kubetopo.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubetopo.frontend.fullname" -}}
{{- printf "%s-frontend" (include "kubetopo.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubetopo.beyla.fullname" -}}
{{- printf "%s-beyla" (include "kubetopo.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubetopo.beyla.serviceAccountName" -}}
{{- if .Values.beyla.serviceAccount.create -}}
{{- default (include "kubetopo.beyla.fullname" .) .Values.beyla.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.beyla.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* OTLP endpoint Beyla exports to — defaults to the in-cluster collector. */}}
{{- define "kubetopo.beyla.otlpEndpoint" -}}
{{- if .Values.beyla.otlpEndpoint -}}
{{- .Values.beyla.otlpEndpoint -}}
{{- else -}}
{{- printf "http://%s.%s.svc.cluster.local:%v" (include "kubetopo.collector.fullname" .) (include "kubetopo.namespace" .) .Values.otelCollector.service.httpPort -}}
{{- end -}}
{{- end -}}

{{/*
Target namespace for all namespaced resources. Defaults to namespace.name
("kubetopo"), falling back to the release namespace when blank.
*/}}
{{- define "kubetopo.namespace" -}}
{{- default .Release.Namespace .Values.namespace.name -}}
{{- end -}}

{{/* ServiceAccount name. */}}
{{- define "kubetopo.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "kubetopo.backend.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Chart label. */}}
{{- define "kubetopo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels applied to every resource. */}}
{{- define "kubetopo.labels" -}}
helm.sh/chart: {{ include "kubetopo.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: kubetopo
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{/* Backend image reference (tag falls back to appVersion). */}}
{{- define "kubetopo.backend.image" -}}
{{- $tag := default .Chart.AppVersion .Values.backend.image.tag -}}
{{- printf "%s:%s" .Values.backend.image.repository $tag -}}
{{- end -}}

{{/* Frontend image reference (tag falls back to appVersion). */}}
{{- define "kubetopo.frontend.image" -}}
{{- $tag := default .Chart.AppVersion .Values.frontend.image.tag -}}
{{- printf "%s:%s" .Values.frontend.image.repository $tag -}}
{{- end -}}

{{/* ---- Database wiring (bundled postgres vs external) ---- */}}

{{- define "kubetopo.database.host" -}}
{{- if .Values.postgres.enabled -}}
{{- include "kubetopo.postgres.fullname" . -}}
{{- else -}}
{{- required "externalDatabase.host is required when postgres.enabled=false" .Values.externalDatabase.host -}}
{{- end -}}
{{- end -}}

{{- define "kubetopo.database.port" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.service.port -}}
{{- else -}}
{{- .Values.externalDatabase.port -}}
{{- end -}}
{{- end -}}

{{- define "kubetopo.database.name" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.auth.database -}}
{{- else -}}
{{- .Values.externalDatabase.database -}}
{{- end -}}
{{- end -}}

{{- define "kubetopo.database.secretName" -}}
{{- if .Values.postgres.enabled -}}
{{- default (include "kubetopo.postgres.fullname" .) .Values.postgres.auth.existingSecret -}}
{{- else -}}
{{- required "externalDatabase.existingSecret is required when postgres.enabled=false" .Values.externalDatabase.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "kubetopo.database.userKey" -}}
{{- if .Values.postgres.enabled -}}POSTGRES_USER{{- else -}}{{- .Values.externalDatabase.userKey -}}{{- end -}}
{{- end -}}

{{- define "kubetopo.database.passwordKey" -}}
{{- if .Values.postgres.enabled -}}POSTGRES_PASSWORD{{- else -}}{{- .Values.externalDatabase.passwordKey -}}{{- end -}}
{{- end -}}

{{/* Collector export endpoint — defaults to the in-cluster backend OTLP service. */}}
{{- define "kubetopo.collector.backendEndpoint" -}}
{{- if .Values.otelCollector.backendEndpoint -}}
{{- .Values.otelCollector.backendEndpoint -}}
{{- else -}}
{{- printf "http://%s.%s.svc.cluster.local:%v" (include "kubetopo.backend.fullname" .) (include "kubetopo.namespace" .) .Values.backend.service.otlpPort -}}
{{- end -}}
{{- end -}}
