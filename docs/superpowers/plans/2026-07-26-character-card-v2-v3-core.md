# Character Card V2/V3 Core Implementation Plan

**Goal:** Build the dependency-light core that validates, parses, and normalizes public Character Card V2/V3 JSON and PNG inputs while preserving raw and unknown data.

**Architecture:** `packages/core` owns public Zod schemas and a pure import parser. PNG chunk/CRC work is delegated to small MIT libraries. Parsing returns a validated raw card, a product-facing normalized character, and source metadata; Electron UI and persistence consume this later through separate integration work.

**Constraints:** Write tests before implementation, preserve unknown fields, apply an input limit before parsing, prefer `ccv3`, keep original PNG bytes available, do not copy SillyTavern AGPL code, and do not implement UI, database integration, export, or CHARX.

## Task 1: Specification and dependency validation

- [x] Read the public V2 and V3 specification sources.
- [x] Confirm `chara`, `ccv3`, UTF-8/base64, and dual-chunk precedence rules.
- [x] Verify `png-chunks-extract` and `png-chunk-text` runtime imports.
- [x] Verify direct and relevant transitive dependency licenses.
- [x] Add runtime, test-only, and TypeScript declaration dependencies.

## Task 2: Test-first contract

- [x] Write generated V2 and V3 JSON fixtures.
- [x] Generate valid 1x1 PNG fixtures in memory without third-party cards.
- [x] Cover V2/V3 JSON and PNG normalization.
- [x] Cover Unicode, unknown fields, and extension retention.
- [x] Cover `ccv3` precedence over `chara`.
- [x] Cover invalid authoritative `ccv3` data and chunk/spec mismatches.
- [x] Cover malformed JSON, unsupported specs, and schema failures.
- [x] Cover missing chunks, invalid base64/UTF-8, CRC corruption, forged chunk lengths, unsupported binary data, and input limits.
- [x] Run the tests once before implementation and confirm the expected missing-module failure.

## Task 3: Schemas and normalization

- [x] Add strict required-field V2 schemas with exact `2.0` versioning.
- [x] Add V3 schemas with forward-compatible numeric versions from `3.0` onward.
- [x] Add V2 character-book and V3 lorebook/entry schemas.
- [x] Preserve unknown fields at every extensible object level.
- [x] Validate `extensions` as arbitrary JSON records.
- [x] Add `NormalizedCharacter` common fields and grouped V3-only data.
- [x] Export raw, normalized, schema, and source types from `@xiong/core`.

## Task 4: JSON and PNG parser

- [x] Detect JSON objects and PNG-like byte input.
- [x] Enforce a configurable byte limit before parsing.
- [x] Add a minimal structural PNG preflight for malicious lengths and required image chunks.
- [x] Delegate extraction/CRC checks and `tEXt` decoding to the selected libraries.
- [x] Prefer `ccv3` and enforce chunk/spec agreement.
- [x] Strictly decode base64, UTF-8, JSON, and schemas.
- [x] Return copied PNG bytes as an avatar source.
- [x] Add stable `CharacterCardParseError` codes.

## Task 5: Review hardening

- [x] Limit PNG inputs to 4096 chunks before library extraction.
- [x] Validate the fixed `IEND` CRC omitted by `png-chunks-extract`.
- [x] Iteratively limit JSON to 256 levels and 100000 nodes before Zod.
- [x] Map JSON/Zod recursion `RangeError` failures to `JSON_TOO_COMPLEX`.
- [x] Return the schema-validated original JSON object so own `__proto__` fields survive.
- [x] Deep-clone normalized arrays and objects away from `rawCard`.
- [x] Remove the unused parser error `details` field.
- [x] Add scoped runtime notices and upstream license files.
- [x] Configure Electron Builder to include notices in Windows package resources.

## Task 6: Documentation and verification

- [x] Add the feature design document with specifications, licenses, API, and non-goals.
- [x] Update package manifests and the pnpm lockfile.
- [x] Run repository typecheck.
- [x] Run repository lint and formatting checks.
- [x] Run all repository tests.
- [x] Run the production build.
- [x] Build the Windows unpacked package and verify notice/license resources.
- [x] Review the final diff and confirm no UI, database, `DEVELOPMENT_REVISED.md`, commit, push, PR, or merge changes were made.
