import { deflateSync } from 'node:zlib';
import * as textChunk from 'png-chunk-text';
import encodeChunks from 'png-chunks-encode';
import { describe, expect, test, vi } from 'vitest';
import {
  CharacterCardParseError,
  MAX_CHARACTER_CARD_JSON_NODES,
  MAX_CHARACTER_CARD_PNG_CHUNKS,
  characterCardV2Schema,
  characterCardV3Schema,
  detectCharacterCardFormat,
  parseCharacterCard,
  type CharacterCardErrorCode,
} from './character-card';

const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createV2Card(name = 'Mira') {
  return {
    spec: 'chara_card_v2' as const,
    spec_version: '2.0' as const,
    vendor_top: { retained: true },
    data: {
      name,
      description: 'A curious archivist.',
      personality: 'Patient and observant.',
      scenario: 'Inside a moonlit archive.',
      first_mes: 'Welcome to the archive.',
      mes_example: '<START>\n{{user}}: Hello\n{{char}}: Welcome.',
      creator_notes: 'Created entirely for Xiong tests.',
      system_prompt: 'Stay in character.',
      post_history_instructions: 'Answer concisely.',
      alternate_greetings: ['You found the hidden reading room.'],
      tags: ['test', 'original'],
      creator: 'Xiong test suite',
      character_version: '1.2.0',
      extensions: {
        'xiong.test': { enabled: true, nested: ['kept'] },
      },
      character_book: {
        name: 'Archive notes',
        description: 'Facts used only by this generated fixture.',
        scan_depth: 4,
        token_budget: 512,
        recursive_scanning: false,
        extensions: { 'xiong.book': { retained: true } },
        vendor_book: 'keep me',
        entries: [
          {
            keys: ['archive'],
            content: 'The archive opens at midnight.',
            extensions: { 'xiong.entry': { retained: true } },
            enabled: true,
            insertion_order: 10,
            case_sensitive: false,
            name: 'Opening hours',
            id: 7,
            comment: 'Generated fixture entry',
            selective: true,
            secondary_keys: ['midnight'],
            constant: false,
            position: 'before_char' as const,
            vendor_entry: ['keep', 'this'],
          },
        ],
      },
      vendor_data: { retained: 'yes' },
    },
  };
}

function createV3Card(name = '岚') {
  return {
    spec: 'chara_card_v3' as const,
    spec_version: '3.0',
    vendor_top_v3: { retained: true },
    data: {
      name,
      description: '来自云海的旅人。',
      personality: '沉静、友善。',
      scenario: '你们在山顶相遇。',
      first_mes: '你好，旅行者。🌙',
      mes_example: '<START>\n{{user}}: 你好\n{{char}}: 今夜月色很好。',
      creator_notes: 'Xiong 自生成测试角色。',
      system_prompt: '始终保持角色设定。',
      post_history_instructions: '不要替用户行动。',
      alternate_greetings: ['又见面了。', '风把你带来了。'],
      tags: ['测试', '原创'],
      creator: 'Xiong 测试套件',
      character_version: '3.0-test',
      extensions: {
        'xiong.test.v3': { unicode: '保留我' },
      },
      character_book: {
        name: '云海录',
        description: '自生成的世界设定。',
        scan_depth: 6,
        token_budget: 1024,
        recursive_scanning: true,
        extensions: { 'xiong.book.v3': { retained: true } },
        vendor_book_v3: { retained: true },
        entries: [
          {
            keys: ['云海'],
            content: '云海会在日出时泛金。',
            extensions: { 'xiong.entry.v3': { retained: true } },
            enabled: true,
            insertion_order: 1,
            use_regex: false,
            constant: false,
            id: 'cloud-sea',
            comment: '自生成条目',
            vendor_entry_v3: { retained: true },
          },
        ],
      },
      assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
      nickname: '小岚',
      creator_notes_multilingual: {
        en: 'Generated test character.',
        zh: '自生成测试角色。',
      },
      source: ['https://example.invalid/xiong-generated-fixture'],
      group_only_greetings: ['大家好。'],
      creation_date: 1_700_000_000,
      modification_date: 1_700_000_100,
      vendor_data_v3: { retained: 'yes' },
    },
  };
}

function toBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function createPng(
  textEntries: Array<{ keyword: string; text: string }> = [],
  options: { ancillaryChunkCount?: number; includeImageData?: boolean } = {},
): Uint8Array {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, 1);
  headerView.setUint32(4, 1);
  header.set([8, 6, 0, 0, 0], 8);

  const imageData = deflateSync(new Uint8Array([0, 0, 0, 0, 0]));

  const chunks: Array<{ name: string; data: Uint8Array }> = [
    { name: 'IHDR', data: header },
    ...textEntries.map(({ keyword, text }) => textChunk.encode(keyword, text)),
  ];

  for (let index = 0; index < (options.ancillaryChunkCount ?? 0); index += 1) {
    chunks.push({ name: 'ruSt', data: new Uint8Array() });
  }

  if (options.includeImageData !== false) {
    chunks.push({ name: 'IDAT', data: imageData });
  }
  chunks.push({ name: 'IEND', data: new Uint8Array() });

  return encodeChunks(chunks);
}

function captureParseError(run: () => unknown): CharacterCardParseError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CharacterCardParseError);
    return error as CharacterCardParseError;
  }

  throw new Error('Expected character card parsing to fail');
}

function expectErrorCode(run: () => unknown, code: CharacterCardErrorCode): void {
  expect(captureParseError(run).code).toBe(code);
}

describe('Character Card schemas and detection', () => {
  test('recognizes strict V2 and compatible V3 formats', () => {
    expect(detectCharacterCardFormat(createV2Card())).toBe('v2');
    expect(detectCharacterCardFormat(createV3Card())).toBe('v3');
    expect(detectCharacterCardFormat({ spec: 'unknown' })).toBeUndefined();

    expect(characterCardV2Schema.safeParse(createV2Card()).success).toBe(true);
    expect(
      characterCardV2Schema.safeParse({ ...createV2Card(), spec_version: '2.1' }).success,
    ).toBe(false);
    expect(
      characterCardV3Schema.safeParse({ ...createV3Card(), spec_version: '3.1' }).success,
    ).toBe(true);
  });

  test('rejects missing and incorrectly typed required schema fields', () => {
    const card = createV3Card();
    const invalidCard = {
      ...card,
      data: {
        ...card.data,
        group_only_greetings: undefined,
        first_mes: 42,
      },
    };

    expect(characterCardV3Schema.safeParse(invalidCard).success).toBe(false);
  });
});

describe('parseCharacterCard JSON', () => {
  test('normalizes V2 JSON and preserves every unknown field', () => {
    const card = createV2Card();
    const result = parseCharacterCard(JSON.stringify(card));

    expect(result.format).toBe('v2');
    expect(result.source).toEqual({ kind: 'json' });
    expect(result.rawCard).toEqual(card);
    expect(result.character).toMatchObject({
      format: 'v2',
      specVersion: '2.0',
      name: 'Mira',
      description: card.data.description,
      personality: card.data.personality,
      scenario: card.data.scenario,
      firstMes: card.data.first_mes,
      mesExample: card.data.mes_example,
      creatorNotes: card.data.creator_notes,
      systemPrompt: card.data.system_prompt,
      postHistoryInstructions: card.data.post_history_instructions,
      alternateGreetings: card.data.alternate_greetings,
      tags: card.data.tags,
      creator: card.data.creator,
      characterVersion: card.data.character_version,
      extensions: card.data.extensions,
      characterBook: card.data.character_book,
    });
    expect(result.character.v3).toBeUndefined();
  });

  test('normalizes Unicode V3 JSON bytes and exposes V3-only data', () => {
    const card = createV3Card();
    const result = parseCharacterCard(Buffer.from(JSON.stringify(card), 'utf8'));

    expect(result.format).toBe('v3');
    expect(result.rawCard).toEqual(card);
    expect(result.character.name).toBe('岚');
    expect(result.character.firstMes).toBe('你好，旅行者。🌙');
    expect(result.character.characterBook).toEqual(card.data.character_book);
    expect(result.character.v3).toEqual({
      assets: card.data.assets,
      nickname: card.data.nickname,
      creatorNotesMultilingual: card.data.creator_notes_multilingual,
      source: card.data.source,
      groupOnlyGreetings: card.data.group_only_greetings,
      creationDate: card.data.creation_date,
      modificationDate: card.data.modification_date,
    });
  });

  test('returns stable errors for malformed JSON, unknown specs, and schema failures', () => {
    expectErrorCode(() => parseCharacterCard('{"spec":'), 'INVALID_JSON');
    expectErrorCode(
      () => parseCharacterCard(JSON.stringify({ spec: 'chara_card_v9', data: {} })),
      'UNSUPPORTED_CARD_SPEC',
    );
    expectErrorCode(
      () =>
        parseCharacterCard(
          JSON.stringify({
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: { name: 'Incomplete' },
          }),
        ),
      'SCHEMA_INVALID',
    );
  });

  test('preserves own __proto__ fields from data and extensions without prototype pollution', () => {
    const card = createV2Card();
    Object.defineProperty(card.data, '__proto__', {
      value: { location: 'data', retained: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(card.data.extensions, '__proto__', {
      value: { location: 'extensions', retained: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const result = parseCharacterCard(JSON.stringify(card));

    expect(Object.hasOwn(result.rawCard.data, '__proto__')).toBe(true);
    expect(Reflect.get(result.rawCard.data, '__proto__')).toEqual({
      location: 'data',
      retained: true,
    });
    expect(Object.hasOwn(result.rawCard.data.extensions, '__proto__')).toBe(true);
    expect(Reflect.get(result.rawCard.data.extensions, '__proto__')).toEqual({
      location: 'extensions',
      retained: true,
    });
    expect(Object.getPrototypeOf(result.rawCard.data)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.rawCard.data.extensions)).toBe(Object.prototype);
  });

  test('keeps every normalized array and object independent from rawCard', () => {
    const result = parseCharacterCard(JSON.stringify(createV3Card()));
    expect(result.rawCard.spec).toBe('chara_card_v3');
    if (result.rawCard.spec !== 'chara_card_v3' || result.character.v3 === undefined) {
      throw new Error('Expected a normalized V3 character');
    }

    const rawData = result.rawCard.data;
    expect(result.character.tags).not.toBe(rawData.tags);
    expect(result.character.extensions).not.toBe(rawData.extensions);
    expect(result.character.characterBook).not.toBe(rawData.character_book);
    expect(result.character.v3.assets).not.toBe(rawData.assets);
    expect(result.character.v3.creatorNotesMultilingual).not.toBe(
      rawData.creator_notes_multilingual,
    );
    expect(result.character.v3.source).not.toBe(rawData.source);
    expect(result.character.v3.groupOnlyGreetings).not.toBe(rawData.group_only_greetings);

    result.character.tags.push('normalized-only');
    result.character.alternateGreetings[0] = 'normalized-only';
    const normalizedExtension = result.character.extensions['xiong.test.v3'] as {
      unicode: string;
    };
    normalizedExtension.unicode = 'normalized-only';
    if (result.character.characterBook !== undefined) {
      result.character.characterBook.entries[0]!.content = 'normalized-only';
    }
    result.character.v3.assets![0]!.name = 'normalized-only';
    result.character.v3.creatorNotesMultilingual!.zh = 'normalized-only';
    result.character.v3.source!.push('normalized-only');
    result.character.v3.groupOnlyGreetings.push('normalized-only');

    expect(rawData.tags).toEqual(['测试', '原创']);
    expect(rawData.alternate_greetings).toEqual(['又见面了。', '风把你带来了。']);
    expect(rawData.extensions['xiong.test.v3']).toEqual({ unicode: '保留我' });
    expect(rawData.character_book?.entries[0]?.content).toBe('云海会在日出时泛金。');
    expect(rawData.assets?.[0]?.name).toBe('main');
    expect(rawData.creator_notes_multilingual?.zh).toBe('自生成测试角色。');
    expect(rawData.source).toEqual(['https://example.invalid/xiong-generated-fixture']);
    expect(rawData.group_only_greetings).toEqual(['大家好。']);
  });
});

describe('parseCharacterCard PNG', () => {
  test('reads a V2 chara chunk and returns copied PNG bytes as the avatar source', () => {
    const card = createV2Card('PNG V2');
    const png = createPng([{ keyword: 'chara', text: toBase64Json(card) }]);
    const result = parseCharacterCard(png);

    expect(result.format).toBe('v2');
    expect(result.character.name).toBe('PNG V2');
    expect(result.rawCard).toEqual(card);
    expect(result.source.kind).toBe('png');
    if (result.source.kind === 'png') {
      expect(result.source.cardChunk).toBe('chara');
      expect(result.source.avatar.mediaType).toBe('image/png');
      expect(result.source.avatar.bytes).toEqual(png);
      expect(result.source.avatar.bytes).not.toBe(png);
    }
  });

  test('reads a Unicode V3 ccv3 chunk', () => {
    const card = createV3Card('雪狐🦊');
    const png = createPng([{ keyword: 'ccv3', text: toBase64Json(card) }]);
    const result = parseCharacterCard(png);

    expect(result.format).toBe('v3');
    expect(result.character.name).toBe('雪狐🦊');
    expect(result.character.creatorNotes).toBe('Xiong 自生成测试角色。');
    expect(result.source).toMatchObject({ kind: 'png', cardChunk: 'ccv3' });
  });

  test('prefers ccv3 over chara regardless of chunk order', () => {
    const png = createPng([
      { keyword: 'chara', text: toBase64Json(createV2Card('Fallback V2')) },
      { keyword: 'ccv3', text: toBase64Json(createV3Card('Preferred V3')) },
    ]);

    const result = parseCharacterCard(png);

    expect(result.format).toBe('v3');
    expect(result.character.name).toBe('Preferred V3');
    expect(result.source).toMatchObject({ kind: 'png', cardChunk: 'ccv3' });
  });

  test('does not hide an invalid authoritative ccv3 chunk by falling back to chara', () => {
    const png = createPng([
      { keyword: 'chara', text: toBase64Json(createV2Card('Valid fallback')) },
      { keyword: 'ccv3', text: 'not-valid-base64' },
    ]);

    expectErrorCode(() => parseCharacterCard(png), 'INVALID_BASE64');
  });

  test('rejects a card whose spec does not match the selected PNG chunk', () => {
    const png = createPng([{ keyword: 'ccv3', text: toBase64Json(createV2Card()) }]);

    expectErrorCode(() => parseCharacterCard(png), 'PNG_CHUNK_SPEC_MISMATCH');
  });

  test('reports missing card chunks and invalid encoded payloads', () => {
    expectErrorCode(() => parseCharacterCard(createPng()), 'PNG_CARD_CHUNK_MISSING');
    expectErrorCode(
      () => parseCharacterCard(createPng([{ keyword: 'chara', text: '%%%not-base64%%%' }])),
      'INVALID_BASE64',
    );
    expectErrorCode(
      () =>
        parseCharacterCard(
          createPng([{ keyword: 'ccv3', text: Buffer.from([0xc3, 0x28]).toString('base64') }]),
        ),
      'INVALID_UTF8',
    );
    expectErrorCode(
      () =>
        parseCharacterCard(
          createPng([
            { keyword: 'chara', text: Buffer.from('{not-json', 'utf8').toString('base64') },
          ]),
        ),
      'INVALID_JSON',
    );
  });
});

describe('parseCharacterCard safety boundaries', () => {
  test('enforces the byte limit before JSON or PNG parsing', () => {
    expectErrorCode(
      () => parseCharacterCard('界'.repeat(30), { maxInputBytes: 64 }),
      'INPUT_TOO_LARGE',
    );
    expectErrorCode(
      () => parseCharacterCard(createPng(), { maxInputBytes: 16 }),
      'INPUT_TOO_LARGE',
    );
  });

  test('rejects corrupted PNG CRC data', () => {
    const corrupted = createPng([{ keyword: 'chara', text: toBase64Json(createV2Card()) }]).slice();
    corrupted[16] = (corrupted[16] ?? 0) ^ 0xff;

    expectErrorCode(() => parseCharacterCard(corrupted), 'INVALID_PNG');
  });

  test('rejects an IEND chunk whose final CRC byte is corrupted', () => {
    const corrupted = createPng([{ keyword: 'chara', text: toBase64Json(createV2Card()) }]).slice();
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;

    expectErrorCode(() => parseCharacterCard(corrupted), 'INVALID_PNG');
  });

  test('rejects a PNG container with no IDAT image data', () => {
    const noImageData = createPng([{ keyword: 'chara', text: toBase64Json(createV2Card()) }], {
      includeImageData: false,
    });

    expectErrorCode(() => parseCharacterCard(noImageData), 'INVALID_PNG');
  });

  test('rejects a malicious out-of-bounds chunk length before extraction', () => {
    const malicious = new Uint8Array(20);
    malicious.set(pngSignature);
    malicious.set([0xff, 0xff, 0xff, 0xff], 8);
    malicious.set([0x49, 0x48, 0x44, 0x52], 12);

    expectErrorCode(() => parseCharacterCard(malicious), 'INVALID_PNG');
  });

  test('rejects excessive PNG chunk counts before extraction', () => {
    const excessiveChunks = createPng([{ keyword: 'chara', text: toBase64Json(createV2Card()) }], {
      ancillaryChunkCount: MAX_CHARACTER_CARD_PNG_CHUNKS,
    });

    expectErrorCode(() => parseCharacterCard(excessiveChunks), 'PNG_TOO_MANY_CHUNKS');
  });

  test('rejects a 10000-level JSON value iteratively before Zod validation', () => {
    const deeplyNested = `${'['.repeat(10_000)}0${']'.repeat(10_000)}`;

    expectErrorCode(() => parseCharacterCard(deeplyNested), 'JSON_TOO_COMPLEX');
  });

  test('rejects JSON values that exceed the node limit', () => {
    const tooManyNodes = JSON.stringify(new Array(MAX_CHARACTER_CARD_JSON_NODES).fill(0));

    expectErrorCode(() => parseCharacterCard(tooManyNodes), 'JSON_TOO_COMPLEX');
  });

  test('maps an unexpected Zod RangeError to the stable complexity code', () => {
    const schemaSpy = vi.spyOn(characterCardV2Schema, 'safeParse').mockImplementationOnce(() => {
      throw new RangeError('simulated schema recursion limit');
    });

    try {
      expectErrorCode(() => parseCharacterCard(JSON.stringify(createV2Card())), 'JSON_TOO_COMPLEX');
    } finally {
      schemaSpy.mockRestore();
    }
  });

  test('rejects unsupported binary input without treating it as JSON', () => {
    expectErrorCode(
      () => parseCharacterCard(new Uint8Array([0, 1, 2, 3, 4])),
      'UNSUPPORTED_FORMAT',
    );
  });
});
