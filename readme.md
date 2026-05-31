# Mainland Twilight

Random skirmish maps for **0 A.D.** with evening and night lighting, optional passable hills on the main script, and small presentation tweaks (custom grass tile when present, ally alarm audio).

**Game version:** `0.28.0` (see `mod.json`).

## Install

1. Copy this folder into your 0 A.D. mods directory, for example:
   - **Windows:** `Documents\My Games\0ad\mods\mainland-twilight\`
2. Enable **Mainland Twilight** in the mod manager, then pick a map below in skirmish setup.

## Build `.pyromod` (release zip)

The engine can package a mod for sharing (texture cache, optional zip compression). See the official guide: **[Modding Guide — Distributing your mods](https://gitea.wildfiregames.com/0ad/0ad/wiki/Modding_Guide#distributing-your-mods)**.

From a machine that has **0 A.D. Alpha 28** installed:

```powershell
cd "C:\Users\[user]\Documents\My Games\0ad\mods\mainland-twilight"
.\build-pyromod.ps1 -GameRoot "C:\Path\To\Your\0 A.D. alpha"
```

Or set `$env:ZERO_AD_ROOT` to the game install folder (the one that contains `binaries\system\pyrogenesis.exe`), then run `.\build-pyromod.ps1` with no arguments.

Output: **`dist\mainland-twilight-<version>.pyromod`** (version from `mod.json`). Install by double‑opening the file with 0 A.D. or: `pyrogenesis.exe path\to\mainland-twilight-0.x.x.pyromod`.

Do **not** use `-archivebuild-compress` for mod.io uploads. Pyrogenesis defaults to ZIP **store** (same as other verified mods); `-archivebuild-compress` produces deflate and is only for ad‑hoc sharing.

Equivalent manual command (run from your game install root):

```text
binaries\system\pyrogenesis.exe -mod=mod -mod=public -archivebuild="C:\...\mods\mainland-twilight" -archivebuild-output="mainland-twilight.pyromod"
```

## mod.io downloads (“Invalid mod: Failed to get metadata_blob from modFile”)

If **Settings → Mod Selection → Download Mods** shows that error for **mainland-twilight**, the problem is **not** the zip deflate/store format alone. In 0 A.D. **0.28**, the game rejects mod.io entries **before download** when the modfile API response has no valid **`metadata_blob`**.

From [`source/ps/ModIo.cpp`](https://github.com/0ad/0ad/blob/master/source/ps/ModIo.cpp), each mod.io modfile must expose `metadata_blob` as JSON containing at least:

- **`dependencies`** — array (e.g. `["0ad=0.28.0"]`)
- **`minisigs`** — array with a **minisign** signature of the uploaded `.pyromod`, using Wildfire Games’ signing key (same trust model as other in-game downloadable mods)

That blob is attached when Wildfire **verifies and publishes** the mod on [mod.io](https://mod.io/g/0ad); a raw upload without that step leaves `metadata_blob` empty and the client marks the mod invalid.

**Workaround for players:** install manually — clone or download from [GitHub](https://github.com/Haroldgomez777/mainland-twilight), or open a `.pyromod` built with `build-pyromod.ps1`, then enable the mod in **Mod Selection** (no mod.io needed).

**For maintainers:** after building a new `.pyromod`, send it through the usual Wildfire mod verification / mod.io publishing process so the active modfile gets `metadata_blob` + signature updated. Forum reference: [Guide for publishing mods on mod.io](https://wildfiregames.com/forum/topic/24333-guide-for-publishing-mods-on-modio/).

## Maps

| In-game name | Script | Notes |
|----------------|--------|--------|
| **Mainland Twilight** | `mainland_maximalists.js` | Land-only circular map; uses `createPassableHillsMt` for elevated passable hills; richer terrain layers and forests vs the fixed variant. |
| **Mainland Fixed Positions** | `mainland_fixed_positions.js` | Same biome set, lighter layout (no passable-hill pass); circular player ring; uses stock `createFood` for map-wide huntables and berries. |

Both maps list **`SupportedBiomes`: `mainland_maximalists/`** — biome JSON lives under `maps/random/rmbiome/mainland_maximalists/`.

## Biomes (rmbiome)

JSON under `maps/random/rmbiome/mainland_maximalists/`:

- **`op-temprate.json`** — Rhine Valley (fall) evening: sun, ambient, water, postprocess tuned for dusk.
- **`mainland-night.json`** — Dark night variant with stronger night postprocess.

Pick the biome in the map setup screen when the random map supports multiple biomes.

## Custom grass (optional art)

If your copy of the mod includes `art/`:

- **Terrain definition:** `art/terrains/biome-mainland-twilight/mainland_twilight_grass_01.xml`  
  The biome JSON can reference terrain name `mainland_twilight_grass_01` (must match the **basename** of that XML file).
- **Tiling:** `<props size="…"/>` in the XML controls how large the texture appears on the ground (smaller = more repeats, finer grass).
- **Texture credits:** see `art/textures/terrain/types/GRASS_TEXTURE_ATTRIBUTION.txt` when that pack is included (CC0 grass set from OpenGameArt).

If those paths are missing, the game falls back to stock terrains only.

## Audio

**Ally attack alarm** is overridden when this mod is enabled:

- `audio/interface/alarm/alarmally_1.ogg`

Same path as the public mod, so this file replaces the default clip. Sourced from [Haroldgomez777/audi-mod](https://github.com/Haroldgomez777/audi-mod).

## Technical notes

- Map scripts load **`rmgen`**, **`rmgen-common`**, and **`rmbiome`** from the engine / public mod; they do not ship a private copy of those libraries (helps avoid OOS and drift from stock).
- **`placePlayerBases`** expects `PlayerPlacement` as `[playerIDs, playerPositions, …]`; `groupPlayersByArea` return values must be applied so IDs stay aligned with positions.
- Use the engine’s global **`isNomad()`** (from `g_MapSettings`); do not shadow it with a map-local function.

## Credits and links

- Source: [github.com/Haroldgomez777/mainland-twilight](https://github.com/Haroldgomez777/mainland-twilight)
- Forum thread: [Mainland Twilight — new mod for team games](https://wildfiregames.com/forum/topic/96802-mainland-twilight-new-mod-for-team-games/)
- Earlier inspiration: [Feldfeld Mod / Feldmap](https://wildfiregames.com/forum/topic/53880-feldmap/) — this distribution is a separate, lightweight package aligned with current **Alpha 28** rmgen APIs.
- Ally alarm audio: [audi-mod](https://github.com/Haroldgomez777/audi-mod).
