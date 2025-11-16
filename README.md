# Real-Time Meme Coin Data Aggregator

## Overview

This is a backend system designed to discover, aggregate, and deliver real-time meme coin data. It fetches information from multiple live DEX APIs, processes it into a unified format, and makes it available to client applications through a REST API and a real-time WebSocket stream.

## Core Features

- **Data Aggregation:** Fetches token data from DexScreener and GeckoTerminal in parallel.
- **Intelligent Merging:** Transforms and merges data from different sources into a single, consistent format, handling duplicates.
- **Job Queue System:** Uses BullMQ for a resilient and scalable background job processing system to handle data fetching.
- **High-Performance Caching:** Caches all processed data in Redis to ensure fast API response times and protect upstream APIs from rate-limiting.
- **REST API:** Provides endpoints for clients to fetch token data with support for sorting and pagination.
- **Real-Time WebSocket Stream:** Pushes live data updates to all connected clients the moment they are available.

## System Architecture

The system is built on a microservices architecture to ensure scalability and separation of concerns.

1.  **BullMQ Workers (Data Aggregator):** These are background worker processes that handle the intensive work of fetching data from external APIs. Using a job queue allows this process to be scaled independently and provides robust features like automatic retries on failure.

2.  **API Gateway:** A stateless Express.js service that handles all HTTP traffic. It reads directly from the Redis cache to provide fast, on-demand data to clients.

3.  **WebSocket Server:** A dedicated service for managing persistent client connections. It listens for update messages via Redis Pub/Sub and broadcasts them to clients.

4.  **Redis:** The central component that acts as the system's backbone, serving two critical roles:
    - **As a Database:** It stores the BullMQ job queue and the application's data cache.
    - **As a Message Bus:** It facilitates communication between the data workers and the WebSocket server via its Pub/Sub feature.

## Design Decisions and Evaluation Criteria

#### Architecture design and scalability approach

The system uses a decoupled microservices architecture. This was a deliberate choice to allow each component (the data workers, the API gateway, and the WebSocket server) to be scaled independently based on load. For background job processing, a simple cron job was intentionally replaced with **BullMQ**, a professional job queue system. This provides superior reliability with automatic retries and allows us to scale the number of data-fetching workers in the future without changing the core application logic.

#### Handling of real-time data and WebSocket implementation

Real-time data is handled using a push-based, event-driven model. When a BullMQ worker successfully updates the data, it publishes a message to a Redis Pub/Sub channel. The WebSocket server, a subscriber to this channel, then pushes the update to clients. A key optimization was made to **broadcast only differences**, not the entire data set. This drastically reduces network bandwidth and improves client-side rendering performance, providing a truly real-time feel.

#### Caching strategy and performance optimization

Redis is the core of the caching strategy. All data fetched from external APIs is processed and stored in a Redis cache with a short Time-To-Live (TTL). The API Gateway serves all requests directly from this cache, making response times extremely fast and protecting the system from external API rate limits.

#### Error handling and recovery mechanisms

The system is designed for resilience.

1.  **Job Retries:** BullMQ automatically retries failed data-fetching jobs with an exponential backoff strategy, handling temporary network issues or API failures.
2.  **Data Source Isolation:** The aggregator is designed to continue operating even if one of the external data sources fails, ensuring the service remains partially available.
3.  **Structured Logging:** All services use **Pino** for structured (JSON) logging. Unlike `console.log`, this creates machine-readable logs that can be easily sent to a centralized logging service for monitoring, searching, and alerting in a production environment.

#### Code quality and best practices

Code quality was a primary focus.

- The entire codebase is written in **TypeScript** for strict type-safety.
- The project is structured as a **monorepo using npm workspaces**, with shared logic (like the Redis client and data types) extracted into common packages to avoid code duplication (DRY principle).

#### Understanding of distributed system challenges

The architecture directly addresses two core challenges of distributed systems: state management and service communication.

- **State Management:** The web-facing services (API Gateway, WebSocket Server) are designed to be stateless. All shared state is externalized and managed centrally in Redis. This allows us to run multiple instances of these services without synchronization issues.
- **Service Communication:** Services communicate asynchronously through Redis. The workers communicate with the WebSocket server via Pub/Sub, and the producer communicates with workers via the BullMQ queue. This prevents cascading failures, where a problem in one service would crash others that depend on it.

## Scalability Strategy Summary

The system was designed with the following key scalability choices:

- **Independent Service Scaling:** The microservices architecture allows us to scale the API Gateway, WebSocket Server, and data processing workers independently.
- **Scalable Background Processing:** Using the BullMQ job queue allows us to increase data processing throughput by simply adding more worker instances.
- **Stateless Web Services:** The API Gateway and WebSocket Server are stateless, making them easy to scale horizontally behind a load balancer.
- **Centralized High-Performance Cache:** Using Redis as a cache and message bus ensures that it can handle a high volume of reads, writes, and messages as the central communication point.
