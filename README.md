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

A versão 0.1.1 está disponível nas [Releases do Marketplace](https://github.com/Gravewright/marketplace/releases/tag/gravewright-3d-dice-v0.1.1).
Use **Atualizar** na lista de módulos para instalar a correção dos avisos do Three.js.
**Remover** desinstala o módulo de todas as mesas afetadas após a confirmação;
as preferências salvas são preservadas para uma futura reinstalação.

Requer um host com o hook opcional `customize(context)` do runtime de módulos,
incluído na main do Gravewright junto com esta integração. O pacote inicial
Gravewright 0.1.1 ainda não contém esse botão; atualize o host para o commit da
integração `ab3e7a6`, registrado em VALIDATION.md. O módulo em si nunca é incluído no core.

As cinco fontes abertas são Atkinson Hyperlegible, Noto Sans, Noto Serif,
IBM Plex Mono e Montserrat. Os arquivos e as licenças acompanham o ZIP;
não há carregamento de fontes por CDN durante o jogo.

## Build and source

Node.js and Python 3 are required for packaging. Runtime requires WebGL2.

```sh
npm ci
npm test
npm run build
```

The release ZIP has manifest.json and main.js at its root and includes source,
build scripts, dependency lockfile and license notices. Generated distributions
stay out of Git. Signing keys must remain outside this repository.

This is an independent Gravewright adaptation, not an official Dice So Nice or
Foundry product. Upstream themes, branded/custom model sets, textures and
customization UI are excluded. The retained mechanics are adapted to Gravewright's
lifecycle and server-owned results; Foundry-specific APIs and integrations do not run.
