# Validation

## 0.1.2 translation and modal validation

The source manifest, package metadata and dependency lockfile declare version
0.1.2. Releases use the central Marketplace signing workflow. The previously
published signed 0.1.1 archive remains unchanged. This version uses
`context.i18n` and `context.api.ui.openModal`, both verified in Gravewright's
released `v0.3.2` tag; no host patch is required.

Validated on Windows with Node.js and headless Edge/Chromium, using an isolated
real Django/ASGI host, the built module ZIP and a real Translator package:

- `node --test tests/*.test.mjs`, with the host checkout available through
  `GRAVEWRIGHT_ROOT`: all 5 tests passed, with no skips. This includes 2
  localization tests using the actual host translation/modal APIs and the 3
  existing physics tests. The module's 15 keys have matching English, Brazilian
  Portuguese and Spanish catalogs.
- `python tests/localization.py --host-root ... --package ... --translator ...
  --output ... --browser-executable ...`: all 19 browser checks passed. English,
  Brazilian Portuguese and Spanish customization labels, accessible preview
  names, links and notices were checked at viewport widths of 1440, 768 and
  320 pixels, with no horizontal overflow and interface text of at least 12px.
- Native modal focus, Save, Cancel, Escape and preference persistence after
  reload passed. Two tabs produced a real revision conflict; the translated
  notice preserved the draft. Locale events updated the existing modal and its
  conflict notice while preserving the focused input.
- A simulated HTTP 503 save failure displayed a translated retry notice and
  preserved the draft; retry remained available. A real authoritative `1d6`
  roll kept its user's English label while the interface was Spanish.
- Deactivation with customization open removed the modal, 3D layer and all five
  module fonts. There were no page errors, unexpected failing HTTP responses or
  native browser alerts. The isolated server was stopped after the test.

The runtime archive used for browser validation had SHA-256
`f7849956264ca27898405b112d059e96b87f412b19ca5d0939b2a16e9f2d3fb0`.
Version and documentation changes produce a different archive checksum; this
checksum identifies the browser-tested runtime, not a published release asset.
Release preparation compares all runtime files, including the generated main
bundle and physics worker, with that tested archive. Only version metadata and
documentation may differ. It also reruns all 5 Node.js tests before packaging.

All browser fixtures, databases, media, test packages, caches and screenshots
stayed under the host installation's `data/runner/`. Operator configuration,
campaigns, installed modules and language preferences were not used. This run
does not establish native Linux/macOS or every GPU/browser compatibility.

## Published 0.1.1 validation

Validated on Windows with headless Chromium and Three.js 0.184.0:

- `python tests/renderer.py`: passed real WebGL rendering with supported PCF
  shadows, ordinary dice with omitted/false discard flags, translucent discarded
  dice, and resource disposal. No Three.js console warnings or browser errors.
- `node --test tests/physics.test.mjs`: all 3 tests passed.
- `node scripts/build.mjs`: generated the release ZIP successfully.

The signed 0.1.0 package is unchanged. Version 0.1.1 is published through the
central Marketplace signing workflow. Its immutable archive and signed catalog
record are available in the Marketplace release; the host's Update action
installs it while preserving table activation and personal settings.

## Previous integration validation — 0.1.0

Host integration: Gravewright main commit `ab3e7a6` (optional `customize(context)` lifecycle hook and table button). The core repository contains no 3D Dice source, physics libraries or font assets. Translator remains in its own repository.

Validated on Linux with Chromium, against an isolated real Django/ASGI host, synthetic GM/player accounts, a temporary signing key and a temporary database/media directory. Existing user tables and installed packages were not used by these tests.

- `npm test`: 3 tests passed. All supported physical geometries produce finite buffered transforms; seeded physics is reproducible; landing labels preserve authoritative results; percentile/Fate parsing and appearance validation pass.
- Host `node --test tests/modules/*.test.mjs`: 16 tests passed, including customization lifetime and deactivation.
- `GRAVEWRIGHT_ROOT=/path/to/gravewright /path/to/gravewright/.venv/bin/python tests/e2e.py`: passed signed archive installation, activation on both clients, five font options, color/font persistence, actual worker/WebGL rendering, public rolls, GM-only roll audience, no history replay after reload, and deactivation on both clients.
- Browser inspection improved label sizing and enlarged the customization preview. Escape closes only the customization modal, preserving the underlying table settings.

Platform limits: this module's browser test was run on Linux/Chromium, not native Windows/macOS or every GPU. WebGL2 is required for 3D rendering. Unsupported native dice shapes retain their chat results without a 3D model. No Foundry-specific APIs, presets or visual effects are bundled.

Source reference: Dice So Nice `68dfefaf63133c38e91a43758f2f6b9de498668c`. See THIRD_PARTY_NOTICES.md for adaptation scope and the included upstream/font licenses.
