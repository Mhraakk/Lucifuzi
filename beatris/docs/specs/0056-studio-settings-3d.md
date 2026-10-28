# 0056 — Every stone setting as a measured 3D model

**Status:** done.

## What
**Asked:** «خود اپ تکمیله؟». Then the owner chose «همه‌ی نگین‌گذاری‌ها (پیشنهادی)».

**The gap:**
- The studio engine (`public/js/studio`, spec 0016) built only the prong setting.
- The other six were checked by their rules alone (`SETTING_NOT_MODELLED`, spec 0054).
- Their models and weights had no head and no stones.

**Now:**
- All seven settings are built as closed metal plus stones, measured, and checked:
  - prong (چنگی), bezel (قاب‌دار), halo (هاله), channel (ریلی), pavé (پاوه), flush (دفنی) and tension (فشاری).
- A design run from a brief such as «انگشتر ۱۸ عیار پاوه، سنگ ۱٫۳ میل» returns:
  - the measured weight;
  - the stones (count and carats);
  - the findings of that setting.

## How each setting is built
The axes are those of spec 0016:
- the finger runs along y;
- the top of the ring is +z;
- units are millimetres.

**The builder contract:** each builder in `ring.mjs` returns `{ parts, stones, measures, shank? }`.
- `parts` are closed metal meshes. The head is their union.
- `stones` lists each stone group with its count and carats.
- `shank` replaces the band (tension only).

**Measures:** every number in `measures` is read from the geometry as built.

| Setting | Geometry | Measures | Rules |
|---|---|---|---|
| prong | Unchanged: prongs from the shoulders over the crown, a gallery wire under the girdle. | culet clearance, prong over crown, prong count and diameter | the prong rules, STONE_CLEARANCE, PRONG_GRIP |
| bezel | A cup around the girdle outline, its wall offset along the outline's normal by exactly `wallMm`. A bearing ledge carries the girdle. The lip rises `seatDepthMm` above the girdle, modelled before burnishing. Under the girdle the cup narrows by 0.35 mm per mm (a pavilion falls about 1.1), so it stays clear of the stone. Its base follows the band's curve, 0.3 mm into it. | wall, lip over the girdle, bearing, collar height, culet clearance | BEZEL_WALL, BEZEL_GRIP, STONE_CLEARANCE, HEAD_WALL_THIN |
| halo | The centre stone in prongs. A frame around it overlaps the prongs by 0.3 mm. Melee of `haloStoneMm` sit along the frame's middle line, `spacingMm` apart and 0.1 mm clear of the prongs. Between every two melee sits one bead on the inner rim and one on the outer rim. The outer rim is the casting minimum wide. | the prong measures, melee count and spacing, frame width and depth, bead diameter | the prong rules for the centre, HALO_STONES, PRONG_GRIP, STONE_CLEARANCE, HEAD_WALL_THIN |
| channel | `stoneCount` stones (five by default) in one row along the top of the band, girdles level with its surface. Two rails run along the band, swept about the finger axis. Each rail is `wallMm` thick, takes the girdle `seatDepthMm` deep and sits 0.3 mm into the band. An end bar closes each end. | stone count, rail wall, groove, metal under the culet, rail margin at the ends, arc | CHANNEL_SIZE, FLOOR_UNDER_STONE, HEAD_WALL_THIN, RAIL_OFF_BAND |
| pavé | Rows × columns of small stones over the band's top. The band's width sets the number of rows. Girdles sit 0.05 mm under the surface. A bead sits at every corner of a stone's cell, so each stone has four shared beads (a grain pattern). The beads along the field's two long edges stand 0.3 of a pitch from their row, and every bead is just big enough to reach over the girdles it holds. | stone count, rows, columns, beads per stone, bead diameter, metal under the culet | PAVE_SIZE, PAVE_SPACING, PAVE_BEADS, FLOOR_UNDER_STONE |
| flush | One stone sunk into the band, its table level with the metal. No metal is added. The band's rounded edge falls away from the top, so the girdle's ends across the band must stay under metal. | metal depth (the band as built), metal under the culet, metal over the girdle's ends | FLUSH_SIZE, FLUSH_DEPTH, STONE_EDGE_EXPOSED |
| tension | The band opens at the top: two flat ends. The stone's girdle sits `seatDepthMm` deep in a notch in each end, with 0.6 mm of metal above it. | gap, groove, jaw depth, culet clearance to the finger | TENSION_STONE, TENSION_METAL, TENSION_GRIP, STONE_CLEARANCE |

**Stone shape:** every cut is the engine's elliptical brilliant stand-in (spec 0016), so shapes differ only in width and length.

**Defaults from a brief:** `paramsFromIntent` starts every setting from values that pass its own rules.
- **Stone size**, when the brief gives none: pavé 1.3 mm, channel 2.5, flush 2.5.
- **Bezel:** wall at least the casting minimum and 6 % of the stone; lip 0.5.
- **Channel:**
  - groove 0.2, five stones;
  - the band's top is as wide as the stones, both rails and 0.3 mm;
  - the band's bottom is set so the band is still 0.2 mm wider than the rails where the channel ends. A channel band hardly tapers.
- **Pavé:** spacing 0.15, four beads, nine columns.
- **Flush:** the band's top at least the stone's depth + 0.45 thick, and at least the stone + 1.2 wide.
- **Tension:**
  - the top at least the pavilion + 1.0;
  - the bottom at least the top ÷ 2.4;
  - width at least 3.
- **Head height** applies only to the raised settings: prong, bezel and halo.

## Measured weight
**Seats and overlaps:** a stone sunk in metal removes metal (its seat), and two metal pieces that overlap would count that metal twice. `G.overlaps` measures both:
- A fine voxel grid is laid over the head's region, 160 cells on its longest side.
- Every metal part and stone group is voxelized on its own.
- `seat` = metal ∩ stones.
- `double` = the sum of the parts − their union.

**What the inspection reports:**
- `metalVolume` = the meshes' exact volumes − seat − double. This is the finished metal, before the stones go in.
- `seatVolume` and `overlapVolume`.
- `settings`: each setting's type and measures. Tension and flush add no head, so their measures live here.
- `stones`: id, count and carats of each group.

**Connectivity:** one-piece casting is counted from the parts. Each part is voxelized on its own, so overlaps never cancel.

## Wiring
- **`schemas.mjs`:**
  - `MODELLED_SETTINGS` is gone, since every type is built.
  - `SETTING_SPEC` gains `stoneCount` and `rowCount`.
  - `headHeightMm` is optional on `stoneSetting`.
- **`cad.mjs`:**
  - Dispatches to the builder of each type.
  - Tension replaces the shank's mesh, and a shank that carries tension takes no other setting (`E_REF`).
  - `delete` also drops the setting record.
- **`design.mjs`:**
  - `programOf` always builds the setting.
  - **New measured rules:**
    - FLOOR_UNDER_STONE: under 0.3 mm of metal under a sunk culet (high).
    - HEAD_WALL_THIN: a bezel, rail or frame wall under the casting minimum (critical).
    - RAIL_OFF_BAND: where a channel ends, the tapering band is narrower than its rails (high).
    - STONE_EDGE_EXPOSED: a flush girdle less than 0.1 mm under the metal at the band's sides (high).
  - **As-built depths:** `checkSetting` reads the metal depth as built for flush and tension.
  - CASTING_FINE_DETAIL applies to prong and halo heads.
  - The weight optimiser counts the tension gap.
- **`setting.mjs`:**
  - A halo's centre stone passes the prong rules.
  - New rule TENSION_GRIP: a notch under 0.25 mm (high).
- **`instruct.mjs`:** «دیواره N», «فاصله سنگ N», «سنگ هاله N», «N سنگ», «شیار / لبه / عمق نشیمن N» edit the setting.
- **Server:**
  - The inspection schema takes the new fields.
  - The optimiser's head weight is the measured total minus the shank.
  - The design summary names the setting, the stone count and the carats.

## Acceptance
- **`tests/studio-engine.test.mjs`, for each of the seven settings from a Persian brief:**
  - the program validates;
  - the model is closed and one solid;
  - the measures are present;
  - stone count and carats are above zero;
  - the weight is 1.5–6 g;
  - there are no critical or high findings at the defaults, and every finding matches the `FINDING` schema.
- **The same file, setting by setting:**
  - the bezel wall equals `wallMm`;
  - the flush table is level with the band (under 0.02 mm);
  - the tension band is open and closed, and its gap = width − 2 × notch;
  - pavé has rows × columns stones with four beads each;
  - the halo has N melee and 2N beads;
  - the channel keeps at least 0.3 mm under its culets.
- **The flush seat** matches the stone's volume (±15 %).
- **Negative cases:**
  - a 0.4 mm bezel wall → BEZEL_WALL and HEAD_WALL_THIN;
  - a 1.4 mm flush band → FLUSH_DEPTH with the depth as built;
  - a soft stone in tension → TENSION_STONE;
  - 5 mm channel stones → CHANNEL_SIZE;
  - a thin pavé top → FLOOR_UNDER_STONE;
  - 13 channel stones → RAIL_OFF_BAND;
  - a 2.5 mm flush stone on a 2.6 mm band → STONE_EDGE_EXPOSED.
- **Weight optimiser on a bezel ring:** the setting is untouched, and the re-measured weight is at or under the target.
- **Sentence edits:** «دیواره ۰٫۸» and «۱۱ سنگ» edit the setting.
- **`tests/hardening.test.mjs`:** a bezel brief builds `shank` and `stoneSetting`, with no `SETTING_NOT_MODELLED`; the API summary names «قاب‌دار» and «قیراط».
- **e2e:**
  - The studio coach builds a pavé brief and a tension brief.
  - Each summary names the setting, the stone count and the carats.
- **Gate:** `npm run gate` passes, and CI's full e2e passes.

## Constraints
- **No runtime dependencies.** Geometry stays pure and deterministic, and every number comes from the geometry or a rule.
- **The STL carries no seats.** The exported STL is the uncut casting model: seats are subtracted from the weight but not cut. The setter cuts them at the bench.
- **Only the studio changes.** The accounting logic and the tutorial videos are not touched.

## Results
- **Gate:** `npm run gate` passes: 525 tests, 0 failures, 4 skipped.
- **e2e:** the studio coach and studio settings steps pass, 16/16 checks with 0 browser errors.
- **Measured from the test briefs** (18 k yellow, size 54):

| Setting | Stones | Carats | Weight (g) | Seat (mm³) | Overlap (mm³) |
|---|---|---|---|---|---|
| prong | 1 × 5.5 mm | 0.61 | 3.30 | 0.01 | 0.52 |
| bezel | 1 × 5.5 mm | 0.61 | 3.91 | 1.21 | 1.37 |
| halo | 1 × 5.5 mm + 18 × 1.2 mm | 0.72 | 4.07 | 5.28 | 2.38 |
| channel | 5 × 2.5 mm | 0.29 | 4.34 | 8.67 | 10.84 |
| pavé | 9 × 1.3 mm | 0.07 | 3.11 | 2.81 | 0.51 |
| flush | 1 × 2.5 mm | 0.06 | 4.07 | 3.05 | 0 |
| tension | 1 × 5 mm | 0.46 | 4.62 | 0.29 | 0 |

- **Speed:** each one builds and is measured in under half a second.

## Out of scope
- Seats or light holes cut into the exported mesh.
- Shapes other than the elliptical stand-in, honeycomb pavé, and a burnished bezel.
- New studio exercises for the new settings.
