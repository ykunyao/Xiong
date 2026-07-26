# Third-Party Notices: Character Card Core Runtime

This notice is intentionally limited to runtime dependencies used by Xiong's Character Card V2/V3 parsing core. It is not a complete inventory of every third-party dependency used by Xiong.

The following components are included in or used by the packaged runtime:

| Component          | Version | Purpose                                                       | License    | Upstream                                       |
| ------------------ | ------- | ------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| Zod                | 4.4.3   | Character Card schema validation                              | MIT        | <https://github.com/colinhacks/zod>            |
| png-chunks-extract | 1.0.0   | PNG chunk extraction and CRC validation                       | MIT        | <https://github.com/hughsk/png-chunks-extract> |
| png-chunk-text     | 1.0.0   | PNG `tEXt` chunk decoding                                     | MIT        | <https://github.com/hughsk/png-chunk-text>     |
| crc-32             | 0.3.0   | CRC-32 implementation used transitively by png-chunks-extract | Apache-2.0 | <https://github.com/SheetJS/js-crc32>          |

The corresponding upstream license files are distributed in the `third-party-licenses` directory next to this notice.

The test fixture encoder `png-chunks-encode`, its transitive helper `sliced`, and `@types/*` packages are development-only dependencies. They are not part of the packaged runtime and are therefore not covered by this runtime notice bundle.
