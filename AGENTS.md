# Project Rules

- Service tokens (service object, service group, literal port) are expanded to their real ports before appearing in a port position, so a group or object name never sits where a port is expected. Use `serviceToPorts` (src/lib/access.ts) + `fmtPortList` (src/components/access/FocusRows.tsx) for display and `serviceRefKind` (src/lib/access.ts) to label the token's kind (服务对象 / 服务组 / 字面端口 / 通配).
- Disabled NAT rules stay hidden by default across lists, access relationships, node aggregates and reference previews behind the `cfg.showDisabled` display preference (src/lib/uiPrefs.ts); keep the cached access-layer getters keyed on that flag so toggling it does not reuse stale results.
- Destination-focused access paths use sibling source groups and retain the source in every five-stage row; this avoids nested frames and empty reserved source columns.
