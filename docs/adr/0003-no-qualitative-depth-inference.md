---
status: accepted
---

# Never infer flood severity from descriptive language — only a measured cm figure or an explicit "passable"/"impassable" claim

`classify()` (`data.js`) used to treat descriptive Thai/English phrases —
"เข่า"/"knee", "สูง"/"shin" — as evidence of a "yellow" (caution) verdict when
no numeric depth was present in the report text. This looked reasonable
("knee-deep" clearly implies some meaningful depth) but it was still a guess:
"knee" means different things to different reporters, and a Citizen report
(Traffy Fondue) submitter describing their own impression of the water isn't
the same as a measured cm figure. Assigning a caution color from that guess
told drivers something more confident than the data actually supported —
exactly the "misleading interpretation" this app exists to avoid (see
`CONTEXT.md`'s "Passability status").

The explicit "ผ่านไม่ได้"/"impassable" phrase is kept as a red trigger,
deliberately treated differently: that's the reporter directly stating the
outcome ("I could not pass"), not us estimating a depth from ambiguous
wording. A direct claim about passability and an inferred guess about depth
are different kinds of evidence, even though both arrive as free text.

Symmetrically, an explicit "ผ่านได้"/"passable" claim classifies straight to
green — checked before any parsed cm figure, so a stray/unrelated number
elsewhere in the same text (a historical peak, a different spot) can't
override the reporter's own stated outcome. This only applies when depth
wasn't independently *measured*: BMA's sensor readings are authoritative and
exempt from this override (`classify()`'s `trustedDepth` flag), since a
vague phrase like "small cars can pass" shouldn't be allowed to downgrade a
real hardware measurement — only Longdo/Traffy's regex-scraped depth, which
comes from this same free text anyway, can be overridden this way. Both the
passable and impassable checks match only a specific, fixed collocation
(`ผ่านไม่ได้`, `ไม่สามารถผ่าน(ได้)?`) rather than a generic "negation word
appears somewhere nearby" window — an earlier, broader version of the
negation check misfired on unrelated negations sharing the same sentence
(e.g. "ไม่หนัก ผ่านได้สบายๆ" — "ไม่" negates "หนัก", not "ผ่านได้").

So: with no cm figure and no explicit passable/impassable claim, a report now
always classifies as `"gray"` (unknown) — never a guessed severity. For a
Citizen report specifically, if a photo is attached, the UI surfaces that as
a "look at the photo yourself" cue (a camera glyph next to the status dot,
and `มีภาพประกอบ` in place of a repeated "unknown" in the popup) rather than
color-coding a severity that isn't actually known. This is a UI-only cue, not
a new Passability status — the route-verdict math and `STATUS_RANK` are
unaffected.

A future reader tempted to re-add a keyword-based severity guess (or extend
it to more phrases) should read this first: the trade-off was made
deliberately — losing a weak-but-real signal from descriptive language, in
exchange for never showing a driver a caution/clear color the data can't
actually back up.
