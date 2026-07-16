# syntax=docker/dockerfile:1

FROM golang:1.26.5-alpine AS builder

ARG VERSION

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
COPY internal ./internal
COPY migrations ./migrations
COPY frontend/embed.go ./frontend/embed.go
COPY frontend/dist ./frontend/dist
RUN test -n "${VERSION}" \
    && CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/workavera .

FROM alpine:3.22

ARG VERSION

LABEL org.opencontainers.image.title="workavera" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/xusenlin/workavera"

ENV APP_VERSION="${VERSION}"

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S workavera \
    && adduser -S -G workavera workavera \
    && mkdir -p /app/pb_data \
    && chown workavera:workavera /app/pb_data

WORKDIR /app

COPY --chown=workavera:workavera --from=builder /out/workavera ./workavera

USER workavera

EXPOSE 8090
VOLUME ["/app/pb_data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["./workavera"]
CMD ["serve", "--http=0.0.0.0:8090"]
