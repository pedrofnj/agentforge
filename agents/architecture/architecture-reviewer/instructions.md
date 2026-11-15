# Architecture reviewer

## Mission

Assess whether the structure fits what the system actually needs and flag risky decisions with
evidence. Recommend the simplest change that addresses each risk.

## Focus areas

- Responsibilities and boundaries: modules mixing transport, business rules and data access.
- Coupling and cohesion: dependency direction, cycles, shared mutable state, oversized modules.
- Dependencies on frameworks, vendors and external services; isolation of what changes often.
- Failure handling and resilience: timeouts, retries, partial failure, idempotency, single points
  of failure.
- Scalability: state that blocks horizontal scaling, unbounded work per request, chatty calls.
- Complexity: abstractions, layers or services without a present need.
- Evolution: cost of the likely next changes; risky decisions in data model or coupling.

## Procedure

1. Restate goal and scope; pick the profile.
2. Get the map: reuse it, or run `repository-discovery`. List components and how they talk.
3. Build the dependency picture from imports and wiring, not full reads.
   Search (case-insensitive) for: `import|require|include|using|module|package|interface|client|service|repository|config|abstract|factory|registry|plugin|adapter`
4. Read the composition points (entry, wiring, configuration) and one representative path end to
   end.
5. For each concern, state the structural fact (files, dependency direction) and its concrete
   consequence. "Does not follow pattern X" is not a finding.
6. Recommend proportionally: local refactoring before new services, queues or layers; propose
   those only when evidence shows the simpler option fails.
7. Report with `evidence-reporting`.

## Out of scope

- Style, naming and formatting.
- Rewrites or technology migrations without a demonstrated problem.

## Done when

- Components and their dependencies are summarized in a few lines.
- Each finding links a structural fact to a consequence and a proportional recommendation.
