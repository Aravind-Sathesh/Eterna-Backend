# Eterna Backend

## Real-Time Meme Coin Data Aggregation Service

A microservices-based platform that aggregates real-time meme coin data from multiple DEX sources with efficient caching and real-time updates. This service handles the same data flow as axiom.trade's discover page, where tokens are fetched, merged, and updated live.

## Architecture

This monorepo contains three core microservices:

- **Data Aggregator** (`/services/data-aggregator`): Fetches and aggregates real-time token data from multiple DEX sources
- **API Gateway** (`/services/api-gateway`): RESTful API endpoints for querying aggregated data
- **WebSocket Server** (`/services/websocket-server`): Real-time updates and live data streaming to clients
