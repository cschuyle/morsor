# Stage 1: build frontend
FROM node:20-alpine AS frontend
WORKDIR /app

# Version string passed from deploy script
ARG MOOCHO_VERSION=dev
ENV VITE_APP_VERSION=${MOOCHO_VERSION}

COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
# Vite outputs to ../src/main/resources/static (relative to frontend/)
RUN cd frontend && npm run build

# Stage 2: build Spring Boot app (uses pre-built static from stage 1)
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY build.gradle settings.gradle gradlew ./
COPY gradle/wrapper gradle/wrapper
COPY tools/morsor-cli tools/morsor-cli
RUN chmod +x gradlew
RUN ./gradlew dependencies --no-daemon
COPY src src
COPY --from=frontend /app/src/main/resources/static ./src/main/resources/static
RUN ./gradlew bootJar -PskipFrontendBuild=true --no-daemon -x test

# Stage 3: runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN adduser -D -s /bin/sh appuser
COPY --from=builder /app/build/libs/*.jar app.jar
COPY fixtures fixtures
ENV MOOCHO_DATA_LOCATION=file:./fixtures/data/*.json
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
