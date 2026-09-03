# Architecture Policy
Prefer modular monoliths until distribution is justified. Enforce Presentation -> Application -> Domain -> Infrastructure. Do not silently add microservices, queues or caching. Material decisions require ADRs.
