FROM golang:1.25-bookworm AS builder

WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/yams-mobile .

FROM debian:bookworm-slim

WORKDIR /app
RUN mkdir -p /app/data

COPY --from=builder /out/yams-mobile /app/yams-mobile

ENV PORT=10000
ENV DB_PATH=/app/data/yams.db

EXPOSE 10000

CMD ["/app/yams-mobile"]
