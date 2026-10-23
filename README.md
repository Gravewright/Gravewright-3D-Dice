# Gravewright 3D Dice

3D dice for Gravewright, based on [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) by Simone and JDW. **AGPLv3**, with original references and licenses in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The module displays the results already computed by Gravewright. It never rerolls,
changes totals, or sends dice results through a separate channel. Only authorized
live chat messages animate; history and reconnect do not replay old rolls.

- Physics on a worker: collisions, gravity, rotation, sleeping and buffered playback.
- d2, d3, d4, d6, d8, d10, d12, d14, d16, d20, d24, d30 and percentile d100 (two d10s).
- Fate dice; generated reroll/explosion facts and discarded results; repeated rolls.
- Private rolls inherit the server's audience. Each viewer's appearance is personal.
- Reduced-motion preference skips movement. Unsupported die shapes keep native chat results.
- Twenty-four physical dice per animation batch; larger rolls continue in subsequent batches.
- Procedural impact sound unlocks after a user gesture; no external audio assets.

## Instalar e personalizar

Instale o ZIP assinado pelo catálogo do marketplace. Na mesa, abra **Extensões**
e ative **Gravewright 3D Dice**. O botão **Personalizar**, à esquerda de desativar,
abre a prévia e permite alterar somente **cor do dado**, **cor do texto** e
**fonte**. As preferências são salvas por usuário e por mesa. Jogadores também
podem personalizar sua aparência; a ativação da mesa continua sendo controlada
pelo GM. Desativar remove a camada 3D e mantém as rolagens nativas.

A versão 0.1.2 reúne traduções e personalização em uma modal nativa. Os pacotes
assinados são distribuídos pelas [Releases do Marketplace](https://github.com/Gravewright/marketplace/releases/tag/gravewright-3d-dice-v0.1.2).
Use **Atualizar** na lista de módulos para instalar as melhorias preservando
a ativação das mesas e as preferências pessoais.
**Remover** desinstala o módulo de todas as mesas afetadas após a confirmação;
as preferências salvas são preservadas para uma futura reinstalação.

Requer um host com o hook opcional `customize(context)` do runtime de módulos.
A integração atual usa `context.i18n` e `context.api.ui.openModal`, APIs públicas
já presentes no Gravewright 0.3.2; ela não exige alterações no core. A integração
inicial está registrada em VALIDATION.md. O módulo em si nunca é incluído no core.

As cinco fontes abertas são Atkinson Hyperlegible, Noto Sans, Noto Serif,
IBM Plex Mono e Montserrat. Os arquivos e as licenças acompanham o ZIP;
não há carregamento de fontes por CDN durante o jogo.

## Translations / Traduções — 0.1.2

The customization interface uses Gravewright's Translator API (`context.i18n`)
and the module's own English, Brazilian Portuguese and Spanish catalogs in
`src/messages.js`. It follows the user's selected interface language, falls back
to English, and refreshes an open customization window when the language changes.
Labels, action buttons, source/license links and preview/save notices use the
same catalog, including the preview's accessible label. The customization window
uses the host's public modal API. Authored roll labels, font names and the legal
attribution keep their original wording. Catalogs and listeners are removed when
the module stops.

A interface de personalização usa a API do Translator do Gravewright
(`context.i18n`), com catálogos próprios em inglês, português brasileiro e
espanhol no arquivo `src/messages.js`. Ela acompanha o idioma escolhido pelo
usuário, usa inglês como alternativa e atualiza a janela aberta quando o idioma
muda. Rótulos, botões, links de código-fonte/licença, o nome acessível da prévia e
avisos de prévia e gravação passam pelo mesmo catálogo. A janela usa a API
pública de modais do host. Nomes de rolagens escritos pelos usuários, nomes das
fontes e o aviso legal preservam o texto original. Catálogos e listeners são
removidos ao desativar o módulo.

Version 0.1.2 includes these changes. Its source and package versions are aligned
for release; the Marketplace signing workflow publishes the installable archive.
The previously published 0.1.1 archive remains unchanged.

A versão 0.1.2 inclui estas alterações. As versões do código-fonte e do pacote
estão alinhadas para a release; o fluxo de assinatura do Marketplace publica o
arquivo instalável. O arquivo 0.1.1 publicado anteriormente permanece inalterado.

## Build and source

Node.js and Python 3 are required for packaging. Runtime requires WebGL2.

```sh
npm ci
npm test
npm run build
```

Set `GRAVEWRIGHT_ROOT` to a Gravewright source checkout before `npm test` to run
the behavioral integration test against the actual host translation and modal
APIs. The test also discovers an enclosing host checkout automatically; when
neither is available, that integration test is skipped. For example:

```sh
GRAVEWRIGHT_ROOT=/path/to/gravewright npm test
```

In PowerShell, use `$env:GRAVEWRIGHT_ROOT = 'E:\gravewright-base'` followed by
`npm test`. With the host virtualenv's Python, an already built module ZIP, a
Translator ZIP and a Chromium executable, run the isolated browser checks:

```sh
/path/to/gravewright/.venv/bin/python tests/localization.py \
  --host-root /path/to/gravewright \
  --package dist/gravewright-3d-dice-0.1.2.zip \
  --translator /path/to/translator.zip \
  --output /path/to/gravewright/data/runner/dice-localization-review \
  --browser-executable /path/to/chromium
```

On Windows, use the host's `.venv/Scripts/python.exe` and installed Edge or
Chromium executable. The output must be a fresh empty directory under the host's
`data/runner/`; fixture data, media, installed test packages, caches and screenshots
stay there. The test does not reuse operator data or installed packages.
See [VALIDATION.md](VALIDATION.md) for results and platform limits.

The release ZIP has manifest.json and main.js at its root and includes source,
build scripts, dependency lockfile and license notices. Generated distributions
stay out of Git. Signing keys must remain outside this repository.

This is an independent Gravewright adaptation, not an official Dice So Nice or
Foundry product. Upstream themes, branded/custom model sets, textures and
customization UI are excluded. The retained mechanics are adapted to Gravewright's
lifecycle and server-owned results; Foundry-specific APIs and integrations do not run.
