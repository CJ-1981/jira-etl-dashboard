# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.18.0] - 2026-10-24

### Fixed

- German holiday data corrected against statute (SPEC-HOLIDAY-001): the hand-maintained rule table in `src/lib/holidays/german-holidays.ts` was wrong in four verified places — Reformation Day was listed for NW/HE/RP/SL although it applies only to BB/MV/SN/ST/TH plus HB/HH/NI/SH from 2018 (and nationwide as a 2017 one-off); Buß- und Bettag was missing for SN; Weltkindertag was missing for TH (from 2019); Frauentag was missing for BE (from 2019) and MV (from 2023).
- feiertagejs emits Reformation Day for HB/HH/NI/SH before 2018, where it was not yet a holiday; the adapter post-corrects that entry (citation: Landtag Niedersachsen Drucksache 18/827). The national scope now shows the statutory nine Easter Sunday/Whit Sunday-free set, and Brandenburg keeps both Sundays at state level per its Feiertagsgesetz.
- `getWorkingDaysCacheKey` no longer mutates the caller's `regions` array; it copies before sorting.

### Added

- `feiertagejs ^1.5.1` as a runtime dependency, integrated behind a contract-preserving adapter in `src/lib/holidays/german-holidays.ts` (public signatures, `GermanState` codes, `GermanHoliday` shape, `regions=[]` national-only semantics, per-year cache, and `YYYY-MM-DD` serialization unchanged; MIT, zero transitive dependencies).
- Statute-pinned regression suite `src/lib/holidays/__tests__/german-holidays.pins.test.ts`: six statute pins, boundary pins, and a law-derived expected matrix covering 2000...currentYear+5 across the national scope and all 16 states, plus non-mutation and import-isolation checks.
