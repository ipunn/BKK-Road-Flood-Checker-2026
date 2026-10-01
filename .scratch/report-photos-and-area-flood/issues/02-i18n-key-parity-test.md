# 02: Thai/English key-parity test

**What to build:** A test that fails when the Thai and English dictionaries do not expose the same set of keys, so the many **Translated strings** this effort adds can't silently drift between languages.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] A test asserts the Thai and English dictionaries have identical keys, and reports which keys are missing from which language
- [ ] The test passes on the current dictionaries (fix any existing drift it finds, or record it explicitly)
- [ ] Existing tests still pass
