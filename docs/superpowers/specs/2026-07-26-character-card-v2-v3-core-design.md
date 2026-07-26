# Character Card V2/V3 Core Design

## Goal

Provide a dependency-light, import-layer-ready core for detecting, validating, parsing, and normalizing public Character Card V2 and V3 JSON/PNG files. The core must preserve forward-compatible data, expose stable failure codes, and return the original PNG bytes as a possible avatar source.

## Scope

This increment includes:

- public Zod schemas for Character Card V2, Character Card V3, V2 character books, V3 lorebooks, entries, and V3 assets;
- JSON and PNG input detection;
- `chara` V2 and `ccv3` V3 PNG `tEXt` extraction;
- V3 preference when both PNG chunks are present;
- strict base64, UTF-8, JSON, and schema validation;
- a shared `NormalizedCharacter` model;
- retention of the validated raw card, `extensions`, and unknown fields;
- the original PNG bytes as an avatar source;
- bounded input and stable parser error codes;
- generated V2/V3 JSON and PNG tests.

This increment explicitly does not include Electron UI, IPC, database persistence, import conflict handling, prompt assembly, card editing/export, remote assets, PNG extension assets, or CHARX. CHARX is deferred until its archive and embedded-asset security policy is designed separately.

## Specification Sources

The implementation follows the public source specifications rather than copying an application's parser:

- [Character Card V2 specification](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)
- [Character Card V3 specification](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)

V2 requires `spec: "chara_card_v2"` and `spec_version: "2.0"`. V3 requires `spec: "chara_card_v3"`; the baseline is `3.0`, while numeric versions newer than `3.0` remain importable as requested by the V3 forward-compatibility guidance. Required V3 `3.0` fields still have to pass the schema.

No SillyTavern AGPL implementation code or test fixture is copied. SillyTavern may remain useful for behavioral interoperability research, but the implementation here is independently derived from the public format specifications and small permissively licensed packages.

## Public API

The core exports:

```ts
parseCharacterCard(
  input: string | Uint8Array,
  options?: { maxInputBytes?: number },
): ParsedCharacterCard;

detectCharacterCardFormat(value: unknown): 'v2' | 'v3' | undefined;
```

It also exports the V2/V3 Zod schemas, raw schema-derived types, `NormalizedCharacter`, source/result types, parser safety limits, and `CharacterCardParseError`.

The default safety constants are:

```ts
DEFAULT_CHARACTER_CARD_MAX_INPUT_BYTES = 20 * 1024 * 1024;
MAX_CHARACTER_CARD_PNG_CHUNKS = 4096;
MAX_CHARACTER_CARD_JSON_DEPTH = 256;
MAX_CHARACTER_CARD_JSON_NODES = 100_000;
```

The result separates source data from product data:

```ts
interface ParsedCharacterCard {
  format: 'v2' | 'v3';
  rawCard: CharacterCardV2 | CharacterCardV3;
  character: NormalizedCharacter;
  source:
    | { kind: 'json' }
    | {
        kind: 'png';
        cardChunk: 'chara' | 'ccv3';
        avatar: { mediaType: 'image/png'; bytes: Uint8Array };
      };
}
```

The PNG byte array is copied from caller-owned input before it is returned, so downstream import code can store or transform it without depending on a mutable external buffer.

## Schema Strategy

Known fields are strict about required presence and value type. V2's version is the exact `2.0` literal. V3's version must be a numeric string representing `3.0` or newer. V3 dates are non-negative integer Unix timestamps, language map keys are lowercase ISO 639-1-shaped codes, and asset extensions are lowercase without a dot.

Unknown fields are intentionally retained. Every extensible object level uses Zod's loose-object behavior, including the card root, `data`, character book/lorebook, entries, and V3 assets. The specified `extensions` fields are additionally validated as records of JSON values.

Zod's parsed clone is not returned as `rawCard`. After successful validation, Xiong returns the original object created by `JSON.parse`. This is deliberate: valid JSON may contain an own enumerable property named `__proto__`, and object-cloning implementations may accidentally discard it or treat it as a prototype setter. `JSON.parse` creates it as a normal own data property without changing the object's prototype. The object has still passed the complete Zod schema before it is exposed.

## Normalization

`NormalizedCharacter` maps the common snake_case card fields into product-facing camelCase fields:

- `name`, `description`, `personality`, and `scenario`;
- `firstMes` and `mesExample`;
- `creatorNotes`, `systemPrompt`, and `postHistoryInstructions`;
- `alternateGreetings`, `tags`, `creator`, and `characterVersion`;
- validated `extensions`;
- the V2 character book or V3 lorebook, including retained unknown fields.

V3-only values are grouped under `character.v3`: assets, nickname, multilingual creator notes, source references, group-only greetings, creation date, and modification date. Keeping these fields grouped avoids inventing V2 defaults while still making all V3 data needed by later import and prompt layers directly accessible.

Normalization starts from a structured deep clone of the validated raw `data`. Arrays and objects such as tags, alternate greetings, extensions, character books/lorebooks, assets, multilingual notes, sources, and group greetings therefore share no mutable references with `rawCard`. A downstream editor may modify normalized data without corrupting the lossless raw import representation.

## PNG Processing

Production parsing reuses:

- `png-chunks-extract` for PNG chunk extraction and CRC validation;
- `png-chunk-text` for `tEXt` decoding.

Xiong does not implement a second PNG parser. A small container-safety preflight runs before the extraction library only to ensure every declared chunk length fits inside the already size-bounded input, no more than 4096 chunks are present, and the container has one leading `IHDR`, image `IDAT`, and a final `IEND`. This prevents a tiny malicious input from making the older library allocate memory according to an attacker-controlled multi-gigabyte length or create millions of zero-length chunk objects.

`png-chunks-extract` performs extraction and CRC checks for ordinary chunks but stops before checking the `IEND` CRC. Since valid `IEND` has no data, its CRC over the fixed `IEND` type is constant; the safety preflight explicitly verifies those final four bytes without decoding PNG pixels or replacing the library parser.

The parser selects `ccv3` whenever it exists, even if a `chara` fallback also exists. It otherwise selects `chara`. The selected value must be canonical padded base64, decode to valid UTF-8, contain valid JSON, match the selected V2/V3 chunk, and pass the corresponding schema. The parser never falls back from an invalid `ccv3` payload to `chara`, because doing so would violate V3 precedence and could hide a malformed authoritative card.

## Input Limits and Errors

The default maximum input size is 20 MiB and may be lowered by the caller. The limit is measured in UTF-8 bytes for strings and raw bytes for binary input, before JSON parsing or PNG extraction.

After `JSON.parse` and before Zod, an iterative traversal limits input to 256 levels and 100000 total JSON values. Child counts are checked before they are pushed onto the traversal stack, so a huge flat array cannot create a large temporary stack before rejection. Any `RangeError` unexpectedly raised by JSON parsing or Zod validation is also mapped to the same stable complexity error.

`CharacterCardParseError.code` is one of:

- `INPUT_TOO_LARGE`
- `UNSUPPORTED_FORMAT`
- `INVALID_PNG`
- `PNG_TOO_MANY_CHUNKS`
- `PNG_CARD_CHUNK_MISSING`
- `INVALID_BASE64`
- `INVALID_UTF8`
- `INVALID_JSON`
- `JSON_TOO_COMPLEX`
- `UNSUPPORTED_CARD_SPEC`
- `SCHEMA_INVALID`
- `PNG_CHUNK_SPEC_MISMATCH`

Messages and nested causes are diagnostic; downstream behavior should branch on the stable code.

## Dependencies and Licenses

| Package | Use | License |
| --- | --- | --- |
| `zod@4.4.3` | Runtime schemas | MIT |
| `png-chunks-extract@1.0.0` | Runtime chunk extraction and CRC verification | MIT |
| `png-chunk-text@1.0.0` | Runtime `tEXt` decoding | MIT |
| `crc-32@0.3.0` | Transitive runtime CRC implementation | Apache-2.0 |
| `png-chunks-encode@1.0.0` | Test-only generated PNG fixtures | MIT |
| `sliced@1.0.1` | Transitive test-only encoder helper | MIT |
| `@types/png-*` | Type declarations | MIT |

The installed CommonJS packages were verified at runtime with ESM default imports for extract/encode and a namespace import for `png-chunk-text`, matching their DefinitelyTyped declarations.

Runtime notices for Zod, `png-chunks-extract`, `png-chunk-text`, and `crc-32` are stored in the repository's `THIRD_PARTY_NOTICES.md` and `third-party-licenses` directory. Electron Builder copies both into the Windows package's `resources` directory. This notice bundle is explicitly scoped to Character Card core runtime dependencies and does not claim to be a complete Xiong dependency inventory. Test-only encoders, helpers, and type packages are not distributed by this bundle.

## Testing

Tests generate original V2/V3 cards and valid 1x1 PNG files in memory. Coverage includes:

- V2 and V3 JSON;
- V2 `chara` and V3 `ccv3` PNG;
- `ccv3` precedence independent of chunk order;
- invalid authoritative `ccv3` payloads never falling back to `chara`;
- PNG chunk/card spec mismatch handling;
- Unicode and emoji round trips;
- unknown fields at every schema level and extension retention;
- missing fields and wrong field types;
- missing PNG card chunks;
- invalid base64, UTF-8, and JSON;
- CRC corruption and forged out-of-bounds chunk lengths;
- corrupted final `IEND` CRC values;
- more than 4096 otherwise valid PNG chunks;
- structurally incomplete PNG containers with no image data;
- 10000-level JSON input, excessive JSON nodes, and mapped Zod `RangeError` values;
- own `__proto__` fields under card data and extensions;
- mutation isolation between normalized data and `rawCard`;
- unsupported binary data and configurable input limits.

No downloaded or copyright-unclear character card fixture is included.

## Acceptance Criteria

Given a valid V2 or V3 JSON/PNG card, core returns a validated raw card, a normalized character, and source metadata without losing unknown fields. V3 wins over V2 inside dual-chunk PNG files. PNG input can supply its original bytes as an avatar. Invalid or oversized input fails deterministically with a stable code, and no production PNG parser code is copied or recreated.
