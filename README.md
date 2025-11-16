# Real-Time Meme Coin Data Aggregator

## Overview

This is a backend system designed to discover, aggregate, and deliver real-time meme coin data. It fetches information from multiple live DEX APIs, processes it into a unified format, and makes it available to client applications through a REST API and a real-time WebSocket stream.

## Live Links & Demonstration

- **Live API URL:** `https://eterna-api-gateway.onrender.com/`
- **Live WebSocket URL:** `wss://eterna-websocket-server.onrender.com`
- **GitLab Repository:** `https://gitlab.com/eternalabs/backend`
- **Postman Collection:** [`Eterna Backend API.postman_collection.json`](./Eterna%20Backend%20API.postman_collection.json)

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Web Framework:** Express.js
- **Database / Cache:** Redis
- **Job Queue:** BullMQ
- **Real-Time Communication:** WebSockets (`ws` library)
- **Containerization:** Docker
- **Deployment:** Render

## Core Features

- **Data Aggregation:** Fetches token data from DexScreener and GeckoTerminal in parallel.
- **Intelligent Merging:** Transforms and merges data from different sources into a single, consistent format, handling duplicates.
- **Job Queue System:** Uses BullMQ for a resilient and scalable background job processing system to handle data fetching.
- **High-Performance Caching:** Caches all processed data in Redis to ensure fast API response times and protect upstream APIs from rate-limiting.
- **REST API:** Provides endpoints for clients to fetch token data with support for sorting, filtering, and pagination.
- **Real-Time WebSocket Stream:** Pushes optimized "diff" updates to all connected clients the moment they are available.

## System Architecture

The system is built on a microservices architecture to ensure scalability and separation of concerns.

1.  **BullMQ Workers (Data Aggregator):** Background processes that handle the intensive work of fetching data. Using a job queue provides robust features like automatic retries on failure.
2.  **API Gateway:** A stateless Express.js service that handles all HTTP traffic, reading directly from the Redis cache.
3.  **WebSocket Server:** A dedicated service for managing persistent client connections, broadcasting updates received via Redis Pub/Sub.
4.  **Redis:** The central backbone, acting as both a database for the job queue and a high-speed message bus for real-time events.

## Local Development

#### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose

#### Running the Services

1.  Clone the repository.
2.  Run `npm install` in the root directory.
3.  Start the Redis container and all services:
    ```bash
    docker-compose up -d
    ```

## Design Decisions and Evaluation Criteria

#### Architecture design and scalability approach

The system uses a decoupled microservices architecture. This was a deliberate choice to allow each component to be scaled independently. For background job processing, a simple cron job was replaced with **BullMQ**, a professional job queue system, to provide superior reliability and scalability.

#### Handling of real-time data and WebSocket implementation

Real-time data is handled using a push-based, event-driven model via Redis Pub/Sub. A key optimization was made to **broadcast only "diffs" (differences)**, not the entire data set. This drastically reduces network bandwidth and improves client-side rendering performance.

#### Caching strategy and performance optimization

Redis is the core of the caching strategy. The API Gateway serves all requests directly from the Redis cache, making response times extremely fast and protecting the system from external API rate limits.

#### Error handling and recovery mechanisms

1.  **Job Retries:** BullMQ automatically retries failed data-fetching jobs with an exponential backoff strategy.
2.  **Data Source Isolation:** The aggregator continues to operate even if one external data source fails.
3.  **Structured Logging:** All services use **Pino** for structured (JSON) logging, enabling effective monitoring and alerting in a production environment.

#### Code quality and best practices

The entire codebase is written in **TypeScript** for strict type-safety. The project is structured as a **monorepo using npm workspaces**, with shared logic extracted into common packages to avoid code duplication (DRY principle).

#### Understanding of distributed system challenges

The architecture directly addresses state management and service communication. All web-facing services are **stateless**, with shared state externalized to Redis. Services communicate **asynchronously** through Redis (Queues and Pub/Sub), preventing cascading failures.

## Scalability Strategy Summary

- **Independent Service Scaling:** The microservices architecture allows scaling the API Gateway, WebSocket Server, and data workers independently.
- **Scalable Background Processing:** Using the BullMQ job queue allows increasing data processing throughput by adding more worker instances.
- **Stateless Web Services:** The API Gateway and WebSocket Server are stateless, making them easy to scale horizontally behind a load balancer.
- **Centralized High-Performance Cache:** Redis acts as a high-performance bottleneck-avoider for all data access and real-time communication.
