# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS builder

ARG VERSION

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
COPY migrations ./migrations
RUN test -n "${VERSION}" \
    && CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/assistant-app .

FROM alpine:3.22

ARG VERSION

LABEL org.opencontainers.image.title="assistant-app" \
      org.opencontainers.image.version="${VERSION}"

ENV APP_VERSION="${VERSION}"

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S assistant \
    && adduser -S -G assistant assistant \
    && mkdir -p /app/pb_data \
    && chown assistant:assistant /app/pb_data

WORKDIR /app

COPY --chown=assistant:assistant --from=builder /out/assistant-app ./assistant-app
COPY --chown=assistant:assistant frontend/dist ./frontend/dist

USER assistant

EXPOSE 8090
VOLUME ["/app/pb_data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["./assistant-app"]
CMD ["serve", "--http=0.0.0.0:8090"]
