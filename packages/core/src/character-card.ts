import * as textChunk from 'png-chunk-text';
import extractChunks from 'png-chunks-extract';
import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.json());
const characterBookPositionSchema = z.enum(['before_char', 'after_char']);

export const characterBookV2EntrySchema = z.looseObject({
  keys: z.array(z.string()),
  content: z.string(),
  extensions: jsonObjectSchema,
  enabled: z.boolean(),
  insertion_order: z.number(),
  case_sensitive: z.boolean().optional(),
  name: z.string().optional(),
  priority: z.number().optional(),
  id: z.number().optional(),
  comment: z.string().optional(),
  selective: z.boolean().optional(),
  secondary_keys: z.array(z.string()).optional(),
  constant: z.boolean().optional(),
  position: characterBookPositionSchema.optional(),
});

export const characterBookV2Schema = z.looseObject({
  name: z.string().optional(),
  description: z.string().optional(),
  scan_depth: z.number().optional(),
  token_budget: z.number().optional(),
  recursive_scanning: z.boolean().optional(),
  extensions: jsonObjectSchema,
  entries: z.array(characterBookV2EntrySchema),
});

const characterCardV2DataSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  first_mes: z.string(),
  mes_example: z.string(),
  creator_notes: z.string(),
  system_prompt: z.string(),
  post_history_instructions: z.string(),
  alternate_greetings: z.array(z.string()),
  character_book: characterBookV2Schema.optional(),
  tags: z.array(z.string()),
  creator: z.string(),
  character_version: z.string(),
  extensions: jsonObjectSchema,
});

export const characterCardV2Schema = z.looseObject({
  spec: z.literal('chara_card_v2'),
  spec_version: z.literal('2.0'),
  data: characterCardV2DataSchema,
});

export const lorebookV3EntrySchema = z.looseObject({
  keys: z.array(z.string()),
  content: z.string(),
  extensions: jsonObjectSchema,
  enabled: z.boolean(),
  insertion_order: z.number(),
  case_sensitive: z.boolean().optional(),
  use_regex: z.boolean(),
  constant: z.boolean().optional(),
  name: z.string().optional(),
  priority: z.number().optional(),
  id: z.union([z.number(), z.string()]).optional(),
  comment: z.string().optional(),
  selective: z.boolean().optional(),
  secondary_keys: z.array(z.string()).optional(),
  position: characterBookPositionSchema.optional(),
});

export const lorebookV3Schema = z.looseObject({
  name: z.string().optional(),
  description: z.string().optional(),
  scan_depth: z.number().optional(),
  token_budget: z.number().optional(),
  recursive_scanning: z.boolean().optional(),
  extensions: jsonObjectSchema,
  entries: z.array(lorebookV3EntrySchema),
});

export const characterCardV3AssetSchema = z.looseObject({
  type: z.string(),
  uri: z.string(),
  name: z.string(),
  ext: z.string().regex(/^[a-z0-9]+$/, 'Asset extension must be lowercase and omit the dot'),
});

const compatibleV3VersionSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Spec version must be a numeric version string')
  .refine((version) => {
    const parsedVersion = Number(version);
    return Number.isFinite(parsedVersion) && parsedVersion >= 3;
  }, 'Spec version must be 3.0 or newer');

const languageCodeSchema = z.string().regex(/^[a-z]{2}$/, 'Language code must be ISO 639-1');

const characterCardV3DataSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  creator: z.string(),
  character_version: z.string(),
  mes_example: z.string(),
  extensions: jsonObjectSchema,
  system_prompt: z.string(),
  post_history_instructions: z.string(),
  first_mes: z.string(),
  alternate_greetings: z.array(z.string()),
  personality: z.string(),
  scenario: z.string(),
  creator_notes: z.string(),
  character_book: lorebookV3Schema.optional(),
  assets: z.array(characterCardV3AssetSchema).optional(),
  nickname: z.string().optional(),
  creator_notes_multilingual: z.record(languageCodeSchema, z.string()).optional(),
  source: z.array(z.string()).optional(),
  group_only_greetings: z.array(z.string()),
  creation_date: z.number().int().nonnegative().optional(),
  modification_date: z.number().int().nonnegative().optional(),
});

export const characterCardV3Schema = z.looseObject({
  spec: z.literal('chara_card_v3'),
  spec_version: compatibleV3VersionSchema,
  data: characterCardV3DataSchema,
});

export type CharacterBookV2 = z.infer<typeof characterBookV2Schema>;
export type LorebookV3 = z.infer<typeof lorebookV3Schema>;
export type CharacterCardV3Asset = z.infer<typeof characterCardV3AssetSchema>;
export type CharacterCardV2 = z.infer<typeof characterCardV2Schema>;
export type CharacterCardV3 = z.infer<typeof characterCardV3Schema>;
export type CharacterCard = CharacterCardV2 | CharacterCardV3;
export type CharacterCardFormat = 'v2' | 'v3';
export type CharacterCardExtensions = z.infer<typeof jsonObjectSchema>;

export interface NormalizedCharacterV3Data {
  assets?: CharacterCardV3Asset[];
  nickname?: string;
  creatorNotesMultilingual?: Record<string, string>;
  source?: string[];
  groupOnlyGreetings: string[];
  creationDate?: number;
  modificationDate?: number;
}

export interface NormalizedCharacter {
  format: CharacterCardFormat;
  specVersion: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  extensions: CharacterCardExtensions;
  characterBook?: CharacterBookV2 | LorebookV3;
  v3?: NormalizedCharacterV3Data;
}

export interface JsonCharacterCardSource {
  kind: 'json';
}

export interface PngCharacterCardAvatarSource {
  mediaType: 'image/png';
  bytes: Uint8Array;
}

export interface PngCharacterCardSource {
  kind: 'png';
  cardChunk: 'chara' | 'ccv3';
  avatar: PngCharacterCardAvatarSource;
}

export type CharacterCardSource = JsonCharacterCardSource | PngCharacterCardSource;

export interface ParsedCharacterCard {
  format: CharacterCardFormat;
  rawCard: CharacterCard;
  character: NormalizedCharacter;
  source: CharacterCardSource;
}

export interface ParseCharacterCardOptions {
  maxInputBytes?: number;
}

export const DEFAULT_CHARACTER_CARD_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_CHARACTER_CARD_PNG_CHUNKS = 4096;
export const MAX_CHARACTER_CARD_JSON_DEPTH = 256;
export const MAX_CHARACTER_CARD_JSON_NODES = 100_000;

export const characterCardErrorCodes = [
  'INPUT_TOO_LARGE',
  'UNSUPPORTED_FORMAT',
  'INVALID_PNG',
  'PNG_TOO_MANY_CHUNKS',
  'PNG_CARD_CHUNK_MISSING',
  'INVALID_BASE64',
  'INVALID_UTF8',
  'INVALID_JSON',
  'JSON_TOO_COMPLEX',
  'UNSUPPORTED_CARD_SPEC',
  'SCHEMA_INVALID',
  'PNG_CHUNK_SPEC_MISMATCH',
] as const;

export type CharacterCardErrorCode = (typeof characterCardErrorCodes)[number];

export class CharacterCardParseError extends Error {
  readonly code: CharacterCardErrorCode;

  constructor(code: CharacterCardErrorCode, message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = 'CharacterCardParseError';
    this.code = code;
  }
}

export function detectCharacterCardFormat(value: unknown): CharacterCardFormat | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.spec === 'chara_card_v2') {
    return 'v2';
  }

  if (value.spec === 'chara_card_v3') {
    return 'v3';
  }

  return undefined;
}

export function parseCharacterCard(
  input: string | Uint8Array,
  options: ParseCharacterCardOptions = {},
): ParsedCharacterCard {
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_CHARACTER_CARD_MAX_INPUT_BYTES;
  assertValidMaxInputBytes(maxInputBytes);

  const inputBytes =
    typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : input.byteLength;

  if (inputBytes > maxInputBytes) {
    throw new CharacterCardParseError(
      'INPUT_TOO_LARGE',
      `Character card input exceeds the ${maxInputBytes} byte limit`,
    );
  }

  if (typeof input === 'string') {
    return parseJsonCharacterCard(input);
  }

  const bytes = new Uint8Array(input);
  if (resemblesPng(bytes)) {
    return parsePngCharacterCard(bytes);
  }

  if (!resemblesJsonObject(bytes)) {
    throw new CharacterCardParseError(
      'UNSUPPORTED_FORMAT',
      'Character card input is neither a JSON object nor a PNG image',
    );
  }

  return parseJsonCharacterCard(decodeUtf8(bytes));
}

function parseJsonCharacterCard(json: string): ParsedCharacterCard {
  const rawValue = parseJsonValue(json);
  const parsedCard = validateCharacterCard(rawValue);

  return {
    format: parsedCard.format,
    rawCard: parsedCard.rawCard,
    character: normalizeCharacterCard(parsedCard.rawCard),
    source: { kind: 'json' },
  };
}

function parsePngCharacterCard(bytes: Uint8Array): ParsedCharacterCard {
  assertPngChunkBounds(bytes);

  let chunks: ReturnType<typeof extractChunks>;
  try {
    chunks = extractChunks(bytes);
  } catch (error) {
    throw new CharacterCardParseError('INVALID_PNG', 'PNG structure or CRC is invalid', {
      cause: error,
    });
  }

  let charaPayload: string | undefined;
  let ccv3Payload: string | undefined;

  for (const chunk of chunks) {
    if (chunk.name !== 'tEXt') {
      continue;
    }

    let decoded: ReturnType<typeof textChunk.decode>;
    try {
      decoded = textChunk.decode(chunk.data);
    } catch (error) {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG contains an invalid tEXt chunk', {
        cause: error,
      });
    }

    if (decoded.keyword === 'ccv3' && ccv3Payload === undefined) {
      ccv3Payload = decoded.text;
    } else if (decoded.keyword === 'chara' && charaPayload === undefined) {
      charaPayload = decoded.text;
    }
  }

  const selected =
    ccv3Payload === undefined
      ? charaPayload === undefined
        ? undefined
        : { keyword: 'chara' as const, payload: charaPayload }
      : { keyword: 'ccv3' as const, payload: ccv3Payload };

  if (selected === undefined) {
    throw new CharacterCardParseError(
      'PNG_CARD_CHUNK_MISSING',
      'PNG does not contain a chara or ccv3 character card tEXt chunk',
    );
  }

  const payloadBytes = decodeBase64(selected.payload);
  const rawValue = parseJsonValue(decodeUtf8(payloadBytes));
  const parsedCard = validateCharacterCard(rawValue);
  const expectedFormat = selected.keyword === 'ccv3' ? 'v3' : 'v2';

  if (parsedCard.format !== expectedFormat) {
    throw new CharacterCardParseError(
      'PNG_CHUNK_SPEC_MISMATCH',
      `PNG ${selected.keyword} chunk does not contain a Character Card ${expectedFormat.toUpperCase()}`,
    );
  }

  return {
    format: parsedCard.format,
    rawCard: parsedCard.rawCard,
    character: normalizeCharacterCard(parsedCard.rawCard),
    source: {
      kind: 'png',
      cardChunk: selected.keyword,
      avatar: {
        mediaType: 'image/png',
        bytes,
      },
    },
  };
}

function validateCharacterCard(
  value: unknown,
): { format: 'v2'; rawCard: CharacterCardV2 } | { format: 'v3'; rawCard: CharacterCardV3 } {
  const format = detectCharacterCardFormat(value);

  if (format === undefined) {
    throw new CharacterCardParseError(
      'UNSUPPORTED_CARD_SPEC',
      'Character card spec must be chara_card_v2 or chara_card_v3',
    );
  }

  let parsed:
    | ReturnType<typeof characterCardV2Schema.safeParse>
    | ReturnType<typeof characterCardV3Schema.safeParse>;
  try {
    parsed =
      format === 'v2'
        ? characterCardV2Schema.safeParse(value)
        : characterCardV3Schema.safeParse(value);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new CharacterCardParseError(
        'JSON_TOO_COMPLEX',
        'Character card JSON is too complex to validate safely',
        { cause: error },
      );
    }
    throw error;
  }

  if (!parsed.success) {
    throw new CharacterCardParseError(
      'SCHEMA_INVALID',
      'Character card does not match its schema',
      {
        cause: parsed.error,
      },
    );
  }

  // JSON.parse creates `__proto__` as an own data property. Zod is used only
  // for validation here because returning its clone could discard that valid
  // JSON key. The original object has passed the full schema unchanged.
  return format === 'v2'
    ? { format, rawCard: value as CharacterCardV2 }
    : { format, rawCard: value as CharacterCardV3 };
}

function normalizeCharacterCard(card: CharacterCard): NormalizedCharacter {
  const format = card.spec === 'chara_card_v2' ? 'v2' : 'v3';
  const data = structuredClone(card.data);
  const normalized: NormalizedCharacter = {
    format,
    specVersion: card.spec_version,
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    firstMes: data.first_mes,
    mesExample: data.mes_example,
    creatorNotes: data.creator_notes,
    systemPrompt: data.system_prompt,
    postHistoryInstructions: data.post_history_instructions,
    alternateGreetings: data.alternate_greetings,
    tags: data.tags,
    creator: data.creator,
    characterVersion: data.character_version,
    extensions: data.extensions,
  };

  if (data.character_book !== undefined) {
    normalized.characterBook = data.character_book;
  }

  if (card.spec === 'chara_card_v3') {
    normalized.v3 = normalizeV3Data(data as CharacterCardV3['data']);
  }

  return normalized;
}

function normalizeV3Data(data: CharacterCardV3['data']): NormalizedCharacterV3Data {
  const normalized: NormalizedCharacterV3Data = {
    groupOnlyGreetings: data.group_only_greetings,
  };

  if (data.assets !== undefined) {
    normalized.assets = data.assets;
  }
  if (data.nickname !== undefined) {
    normalized.nickname = data.nickname;
  }
  if (data.creator_notes_multilingual !== undefined) {
    normalized.creatorNotesMultilingual = data.creator_notes_multilingual;
  }
  if (data.source !== undefined) {
    normalized.source = data.source;
  }
  if (data.creation_date !== undefined) {
    normalized.creationDate = data.creation_date;
  }
  if (data.modification_date !== undefined) {
    normalized.modificationDate = data.modification_date;
  }

  return normalized;
}

function decodeBase64(encoded: string): Uint8Array {
  const trimmed = encoded.trim();
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  if (trimmed.length === 0 || trimmed.length % 4 !== 0 || !base64Pattern.test(trimmed)) {
    throw new CharacterCardParseError(
      'INVALID_BASE64',
      'Character card PNG chunk is not valid base64',
    );
  }

  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.toString('base64') !== trimmed) {
    throw new CharacterCardParseError(
      'INVALID_BASE64',
      'Character card PNG chunk is not canonical base64',
    );
  }

  return decoded;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CharacterCardParseError('INVALID_UTF8', 'Character card payload is not valid UTF-8', {
      cause: error,
    });
  }
}

function parseJsonValue(json: string): unknown {
  const withoutBom = json.codePointAt(0) === 0xfeff ? json.slice(1) : json;
  let value: unknown;

  try {
    value = JSON.parse(withoutBom) as unknown;
  } catch (error) {
    if (error instanceof RangeError) {
      throw new CharacterCardParseError(
        'JSON_TOO_COMPLEX',
        'Character card JSON is too complex to parse safely',
        { cause: error },
      );
    }
    throw new CharacterCardParseError('INVALID_JSON', 'Character card payload is not valid JSON', {
      cause: error,
    });
  }

  assertJsonComplexity(value);
  return value;
}

function assertPngChunkBounds(bytes: Uint8Array): void {
  if (!hasPngSignature(bytes)) {
    throw new CharacterCardParseError('INVALID_PNG', 'PNG signature is invalid');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunkIndex = 0;
  let foundEnd = false;
  let foundImageData = false;

  while (offset < bytes.byteLength) {
    if (chunkIndex >= MAX_CHARACTER_CARD_PNG_CHUNKS) {
      throw new CharacterCardParseError(
        'PNG_TOO_MANY_CHUNKS',
        `PNG contains more than ${MAX_CHARACTER_CARD_PNG_CHUNKS} chunks`,
      );
    }

    if (bytes.byteLength - offset < 12) {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG chunk header is truncated');
    }

    const dataLength = view.getUint32(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.byteLength) {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG chunk length exceeds input bounds');
    }

    const name = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );

    if (!/^[A-Za-z]{4}$/.test(name)) {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG chunk type is invalid');
    }
    if (chunkIndex === 0 && (name !== 'IHDR' || dataLength !== 13)) {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG must start with a 13-byte IHDR chunk');
    }
    if (chunkIndex > 0 && name === 'IHDR') {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG contains more than one IHDR chunk');
    }
    if (name === 'IDAT') {
      foundImageData = true;
    }

    offset = chunkEnd;
    chunkIndex += 1;

    if (name === 'IEND') {
      if (dataLength !== 0 || offset !== bytes.byteLength) {
        throw new CharacterCardParseError('INVALID_PNG', 'PNG IEND chunk is invalid');
      }
      assertIendCrc(bytes, chunkEnd - 4);
      foundEnd = true;
      break;
    }
  }

  if (!foundEnd) {
    throw new CharacterCardParseError('INVALID_PNG', 'PNG is missing its IEND chunk');
  }
  if (!foundImageData) {
    throw new CharacterCardParseError('INVALID_PNG', 'PNG is missing IDAT image data');
  }
}

function assertIendCrc(bytes: Uint8Array, crcOffset: number): void {
  // IEND has no data, so its CRC over the fixed ASCII type `IEND` is constant.
  const expectedCrc = [0xae, 0x42, 0x60, 0x82] as const;
  for (let index = 0; index < expectedCrc.length; index += 1) {
    if (bytes[crcOffset + index] !== expectedCrc[index]) {
      throw new CharacterCardParseError('INVALID_PNG', 'PNG IEND CRC is invalid');
    }
  }
}

function assertJsonComplexity(root: unknown): void {
  const stack: Array<{ depth: number; value: unknown }> = [{ depth: 1, value: root }];
  let discoveredNodeCount = 1;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }

    if (current.depth > MAX_CHARACTER_CARD_JSON_DEPTH) {
      throw new CharacterCardParseError(
        'JSON_TOO_COMPLEX',
        `Character card JSON exceeds ${MAX_CHARACTER_CARD_JSON_DEPTH} levels`,
      );
    }

    if (typeof current.value !== 'object' || current.value === null) {
      continue;
    }

    const nextDepth = current.depth + 1;
    if (Array.isArray(current.value)) {
      discoveredNodeCount = addDiscoveredJsonNodes(discoveredNodeCount, current.value.length);
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: nextDepth, value: current.value[index] });
      }
      continue;
    }

    const objectValue = current.value as Record<string, unknown>;
    const keys = Object.keys(objectValue);
    discoveredNodeCount = addDiscoveredJsonNodes(discoveredNodeCount, keys.length);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key !== undefined) {
        stack.push({ depth: nextDepth, value: objectValue[key] });
      }
    }
  }
}

function addDiscoveredJsonNodes(currentCount: number, additionalCount: number): number {
  const nextCount = currentCount + additionalCount;
  if (nextCount > MAX_CHARACTER_CARD_JSON_NODES) {
    throw new CharacterCardParseError(
      'JSON_TOO_COMPLEX',
      `Character card JSON exceeds ${MAX_CHARACTER_CARD_JSON_NODES} nodes`,
    );
  }
  return nextCount;
}

function assertValidMaxInputBytes(maxInputBytes: number): void {
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes <= 0) {
    throw new TypeError('maxInputBytes must be a positive safe integer');
  }
}

function resemblesPng(bytes: Uint8Array): boolean {
  return (
    hasPngSignature(bytes) ||
    bytes[0] === 0x89 ||
    (bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
  );
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function resemblesJsonObject(bytes: Uint8Array): boolean {
  let index = 0;

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    index = 3;
  }

  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      return byte === 0x7b;
    }
    index += 1;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
