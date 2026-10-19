# JHM Filling Station — Rebuild Roadmap

Source: /tmp/extracted (Next.js app). Target: TanStack Start + Lovable Cloud.

- [x] 1. Enable Lovable Cloud
- [x] 2. Port database schema (33 migrations, ~8k lines: enums, tables, functions, RLS, calibration data)
- [ ] 3. Auth + roles (dispenser, manager, admin, MD; invitation flow)
- [ ] 4. App shell + Bangla/English + design system (fuel-station dark/utility theme)
- [ ] 5. Dispenser flow: shift open, meter readings, tank dip
- [ ] 6. Cash screen, expenses, dues (credit customers), lubricants
- [ ] 7. Shift close + reconciliation + variance alerts
- [ ] 8. Dashboards: manager, MD, admin
- [ ] 9. Reports (daily sheet, P&L, xlsx export)
- [ ] 10. Stock + refill (tanker delivery)
- [ ] 11. People roster
- [x] 12. AI: meter OCR (Lovable AI) done + chat assistant done (/chat, manager/admin/md, read + confirmed writes)
- [ ] 13. Offline queue / sync events (n8n mirroring optional)

- [x] Phase 3 — Auth screens, join-by-invite, role gating, shell, all section routes live
- [ ] Phase 4 — First-run admin account needs creating (invitation flow requires one admin to exist)
- [x] Employee (dispenser) flow verified end to end: meter photo + OCR, dip entry, offline queue flush, photo upload, data visible to manager/admin/MD
- [ ] Remaining: audit viewer UI polish
