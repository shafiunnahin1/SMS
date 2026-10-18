# Incident runbook — suspected leak of personal data (one page)

> Step 8.1 (D27, `docs/legal/privacy-and-consent.md` §7). Fill in the contacts below before go-live. The legal deadline to tell
> the authorities is **not known** — the owner's lawyer must give it (§7 step 4). Commands assume the production server shell in
> `api/`; keep a copy of every output for the post-mortem.

## Who calls whom

| Role | Name | Phone | When |
|---|---|---|---|
| Incident lead (platform owner) | `{{owner_name}}` | `{{owner_phone}}` | always first |
| Technical lead (server access) | `{{tech_name}}` | `{{tech_phone}}` | within 15 minutes |
| Lawyer | `{{lawyer_name}}` | `{{lawyer_phone}}` | as soon as personal data may be involved |
| Each affected institution's admin | from Super Admin → Institutions → detail → Admins | | within the same day (step 3) |
| SMS / bKash account managers | BulkSMSBD, bKash merchant support | | if their keys may be exposed |

## Steps

1. **Stop the access.** Revoke tokens — everyone, or one institution:
   ```sql
   DELETE FROM personal_access_tokens;                                     -- every session, everyone logs in again
   DELETE pat FROM personal_access_tokens pat JOIN users u ON u.id = pat.tokenable_id
     WHERE u.institution_id = :id;                                           -- one institution only
   ```
   If a key may be exposed: rotate `APP_KEY` only together with re-saving every encrypted value (SMS / bKash keys in the Super Admin
   panel, institutions' own SMS keys) — they are encrypted with it. Change the BulkSMSBD and bKash credentials at the provider and
   enter the new ones in the panel. Suspend an affected institution from the Super Admin panel if needed.
2. **Find what and who was affected** (`audit_logs`, the sessions list): who logged in, from where, which exports ran:
   ```sql
   SELECT institution_id, user_id, action, ip_address, created_at FROM audit_logs
     WHERE created_at >= :since ORDER BY created_at;                         -- e.g. student.exported, auth.*, sms_sender.*, tenant.purged
   ```
   Write down: institutions, kinds of data (names, phones, photos, results, fees), number of people, time window.
3. **Tell each affected institution at once** (they are the data controller): what happened, what data, what we did, what they
   should tell guardians. Keep the message and the time sent.
4. **Authorities**: within the deadline the lawyer gives (unknown here — ask; do not guess).
5. **Post-mortem within 7 days**: cause, timeline, what changed (code, keys, access), and a test or check that would have caught it.
   Add a line to `docs/DECISIONS.md` if a rule changes.

## Afterwards
- Restore from backup only if data was destroyed — see `docs/ops/restore-drill.md`.
- Backups keep a deleted or leaked copy for 30 days (rolling); say so to the institutions.
