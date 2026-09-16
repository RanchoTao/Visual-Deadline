# Unified capture architecture

## Goal

Text, voice, image, and document inputs share one flow:

```text
Capture -> Interpret -> Decompose -> Confirm -> Materialize -> Plan/Execute
```

The mode changes the extractor, not the product contract. No mode writes Tasks directly.

## Current foundation

The current `MultimodalComposer` and `/api/intake` already establish useful boundaries:

- one intake can include text and multiple assets;
- files upload directly to private Supabase Storage;
- the server validates session, owner-prefixed path, MIME, size, and storage metadata;
- intake/draft rows are separate from final `tasks` rows;
- the existing task UI requires user confirmation before adding Tasks.

Current extraction is incomplete for image/document/audio. That is a capability gap, not a reason to create separate capture products.

## Pipeline

### 1. Capture

The client creates a UUID `captureId` and stable `clientRequestId`, records mode/locale, and uploads attachments. It can save a local draft before authentication; cloud submission waits for an authenticated owner or the later guest-import flow.

### 2. Interpret

Server/worker adapters produce versioned interpretations:

- text normalization;
- speech-to-text with timestamps/language/confidence;
- OCR/vision description with page/region references;
- document extraction with page/section references.

The raw user text and asset remain distinct from extracted text. Provider output is untrusted input and must be schema-validated.

### 3. Decompose

The compiler proposes typed candidates:

- Goal;
- Milestone;
- Task;
- dependency;
- note/context only.

Each candidate contains source references, assumptions, warnings, confidence, and proposed relationships. It cannot invent completion, actual work, or measured user state.

### 4. Confirm

The user sees an editable diff:

- entities to create;
- existing entities to link or update;
- dependencies;
- uncertain fields;
- ignored content;
- attachment retention choice where relevant.

No canonical write occurs until confirmation. Partial confirmation is valid. Reject/cancel preserves or deletes capture artifacts according to the retention policy without creating Tasks.

### 5. Materialize

One server command accepts capture/version/candidate IDs plus user edits and an idempotency key. In a transaction it:

1. verifies candidate ownership and confirmed interpretation version;
2. creates/updates canonical entities in dependency order;
3. records `legacy/source` references and execution events;
4. links candidates to materialized IDs;
5. marks the capture materialized.

Retry returns the same result. A partially failed materialization is resumed or rolled back transactionally, never duplicated.

### 6. Plan/execute

New Tasks appear in TASKS. They enter NOW only if canonical eligibility/ranking chooses them. New Goals/Milestones appear in PLAN. They enter OPS scheduling only when resource-aware operations are active. Capture does not promise scheduling or allocation.

## Provider interface

```text
Extractor.canHandle(asset)
Extractor.extract(asset, context) -> ExtractedEvidence
Compiler.compile(capture, evidence[]) -> CandidateSet
```

Provider adapters run server-side, receive bounded content, and return normalized DTOs. Record provider/model/version, latency, token/cost metadata where available, input/output checksums, and failure classification without storing secrets.

A deterministic text parser/manual fallback must allow capture when AI is unavailable. Provider failure never corrupts the original capture.

## Asset lifecycle and privacy

- Private bucket only; signed access is short-lived.
- Object path begins with immutable owner and capture IDs.
- MIME is checked against server-observed object metadata; add content scanning before broad document support.
- Enforce per-file, per-capture, and per-user quotas.
- Record checksum to detect retry duplicates.
- Delete orphaned uploads through a delayed, auditable cleanup job.
- Define retention separately for raw media, extracted text, and materialized source references.
- Never send an asset to a provider before user-facing disclosure/consent applicable to that provider/data type.

## Guest capture

Guest captures use the same IDs and schema in local storage/IndexedDB. Binary assets stay local unless the user explicitly uploads them. Account import previews data volume and provider processing implications. A cloud Task must not reference a local-only attachment as though it were durable.

## UX ownership

- Global quick capture opens from every primary page.
- TASKS may preselect “Task”; PLAN may preselect “Goal/plan”; both still use the same pipeline.
- NOW shows a compact capture entry but does not implement a private compiler.
- REVIEW shows materialized provenance and rejected/failed capture history only when useful.
- Avatar → Settings owns provider/privacy/retention preferences.

OPS does not own Capture or generic Task creation. It consumes confirmed canonical Tasks when building rolling schedules and resource allocations.

## Failure handling

| Failure | Behavior |
| --- | --- |
| Upload interrupted | Resume/retry by checksum; do not create duplicate attachment rows |
| Extractor unsupported | Keep capture, offer manual text/edit path |
| Provider timeout/invalid output | Record failed interpretation; raw capture remains intact |
| User closes confirmation | Preserve draft according to policy; zero canonical writes |
| Materialization retry | Return prior materialized IDs via idempotency key |
| Relationship target deleted | Block affected candidate and request remap |
| Guest import lacks binary | Import metadata as unresolved; do not fabricate cloud URL |

## Verification

- Every mode reaches the same candidate/confirmation component.
- Rejecting or closing creates zero canonical entities.
- Confirming a mixed Goal/Milestone/Task capture creates exact relationships once.
- Duplicate submit/materialize requests are idempotent.
- Cross-user capture/attachment/candidate access is denied.
- Asset path, MIME, size, checksum, quota, and ownership negative tests pass.
- Provider outage leaves an editable manual path.
- Capture provenance remains visible from the resulting entity and Review.

## Persistence stage

Beta requires only the current Capture path's durable owner, attachment metadata, confirmation state, and idempotent Task materialization. Separate multi-version interpretation/candidate tables are deferred until advanced extraction or provenance requirements exceed what safely extending the current intake/draft tables can provide.
