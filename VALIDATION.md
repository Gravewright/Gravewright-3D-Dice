# Validation — 0.1.1

Validated on Windows with headless Chromium and Three.js 0.184.0:

- `python tests/renderer.py`: passed real WebGL rendering with supported PCF
  shadows, ordinary dice with omitted/false discard flags, translucent discarded
  dice, and resource disposal. No Three.js console warnings or browser errors.
- `node --test tests/physics.test.mjs`: all 3 tests passed.
- `node scripts/build.mjs`: generated the release ZIP successfully.

The installed signed 0.1.0 package is unchanged. Updating users requires signing
and publishing 0.1.1 through the normal release/marketplace process.

## Previous integration validation — 0.1.0

Host integration: Gravewright main commit `ab3e7a6` (optional `customize(context)` lifecycle hook and table button). The core repository contains no 3D Dice source, physics libraries or font assets. Translator remains in its own repository.

Validated on Linux with Chromium, against an isolated real Django/ASGI host, synthetic GM/player accounts, a temporary signing key and a temporary database/media directory. Existing user tables and installed packages were not used by these tests.

- `npm test`: 3 tests passed. All supported physical geometries produce finite buffered transforms; seeded physics is reproducible; landing labels preserve authoritative results; percentile/Fate parsing and appearance validation pass.
- Host `node --test tests/modules/*.test.mjs`: 16 tests passed, including customization lifetime and deactivation.
- `GRAVEWRIGHT_ROOT=/path/to/gravewright /path/to/gravewright/.venv/bin/python tests/e2e.py`: passed signed archive installation, activation on both clients, five font options, color/font persistence, actual worker/WebGL rendering, public rolls, GM-only roll audience, no history replay after reload, and deactivation on both clients.
- Browser inspection improved label sizing and enlarged the customization preview. Escape closes only the customization modal, preserving the underlying table settings.

Platform limits: this module's browser test was run on Linux/Chromium, not native Windows/macOS or every GPU. WebGL2 is required for 3D rendering. Unsupported native dice shapes retain their chat results without a 3D model. No Foundry-specific APIs, presets or visual effects are bundled.

Source reference: Dice So Nice `68dfefaf63133c38e91a43758f2f6b9de498668c`. See THIRD_PARTY_NOTICES.md for adaptation scope and the included upstream/font licenses.
