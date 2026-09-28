---
status: accepted
---

# Client-side EN/TH toggle via a shared dictionary, not per-page duplication or a build step

The site is static with no build step or bundler (`PRODUCT.md`), so adding English
support couldn't reach for a framework i18n library or generate localized page
copies at build time. Instead, translation state lives in one shared `i18n.js`
dictionary loaded by all three pages: static markup is tagged with
`data-i18n="key"` attributes swapped on load/toggle, and `app.js`'s
dynamically-generated strings call a small `t(key, vars)` helper instead of
hardcoding Thai literals. The toggle itself is in-page (no reload, no
`/en/`-style separate URLs), always defaults to Thai for a first-time visitor
— English is a manual opt-in via the header toggle, not auto-detected from
`navigator.language` — and persists the user's choice in `localStorage` after
that. The toggle button itself carries a 🌐 glyph and a `title` tooltip
("Switch to English"/"เปลี่ยนเป็นภาษาไทย") rather than showing only the bare
target-language name, since a plain "EN"/"ไทย" label risks reading as a status
indicator rather than a clickable control.

Considered and rejected: duplicating each of the three HTML pages per language
(`index.en.html`, etc.) — rejected because it lets the Thai and English copies
drift out of sync with no mechanism to catch it, which a shared dictionary
avoids by construction.

**Explicit exception**: content sourced from live external feeds, or naming
real-world places — road/place names from the BMA, Longdo/iTIC, and Traffy
Fondue feeds — is deliberately left untranslated even in English mode. A
driver needs those names to match physical street signage; a translated road
name would be actively harmful, not just imperfect. Only static,
app-authored text (including the known English forms of institution names
like BMA/TMD/DDPM in the footer) goes through the dictionary.
