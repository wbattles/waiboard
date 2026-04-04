{{- define "waiboard.name" -}}
{{ .Chart.Name }}
{{- end -}}

{{- define "waiboard.fullname" -}}
{{ .Release.Name }}-{{ .Chart.Name }}
{{- end -}}

{{- define "waiboard.labels" -}}
app.kubernetes.io/name: {{ include "waiboard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "waiboard.selectorLabels" -}}
app.kubernetes.io/name: {{ include "waiboard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
