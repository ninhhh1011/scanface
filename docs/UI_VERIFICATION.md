# UI implementation and verification — 2026-09-13

The normal HR application uses HeroUI3.2.5 compound controls, self-hosted Inter Tight (Vietnamese included), source design colors/radii, grouped top navigation, responsive tables, forms and dialogs. The design source remains unchanged. Official HeroUI repository, quick-start, theming, button, text-field and select documentation were read; references are in ARCHITECTURE.md.

Implemented routes cover login/profile, dashboard, employees with eight detail tabs, departments/positions, contracts, shifts/calendar, attendance/manual correction/face scan, leave/balances/OT, timesheets, internal payroll, performance, private documents, announcements/notifications, reports, users/roles/settings/audit, knowledge base and Copilot. Forms call authenticated APIs. Loading, empty, error, missing-configuration and success states are distinct. Dirty-dialog warnings, keyboard Escape, camera consent and exact status membership are explicit; NOT_ENROLLED is never styled as enrolled. No presentation-only page or fabricated successful mutation exists.

## Executed checks

- `node --no-maglev --env-file=.env scripts/browser-qa.mjs`: exit0, **27 checks**, **zero page errors** on Chrome. Four role logins/scopes; viewports390×844,768×1024,1024×768,1440×900 without document overflow; grouped navigation;15 ordinary routes rendered. Screenshots: `artifacts/verification/screenshots/employees-*.png`.
- `scripts/browser-flows.mjs`, run by `npm run verify -- --http`: **12 flows**, zero page errors; department CRUD, employee edit/archive, shift assignment, contract creation, private attachment upload/download/anonymous denial/delete, reasoned leave entitlement create/edit, invalid CSV preview/export/Escape, timesheet20-employee detail/CSV, employee leave submit → manager approve → employee cancel with real ledger assertions, consent gate/camera denied/unenrolled status. Test-owned records are cleaned;20 employees remain.
- Three component boundary tests run in root Vitest. Typecheck, lint and production Workers build passed; see PROGRESS and FEATURE_MATRIX for consolidated evidence.

One aggregate run timed out waiting for admin login without a page error; its original report is retained as `verify-prior-failure.json`. Browser QA now asserts login HTTP status and records redacted failure details. Independent rerun passed all27 checks; no unproven cause is assigned to the earlier timeout.

## Verification limits

Route rendering is not proof of every mutation. FEATURE_MATRIX distinguishes service lifecycle tests from browser evidence; full password-change, correction/OT/payroll/performance/admin browser cycles and exhaustive keyboard/device coverage are not claimed. Actual camera enrollment, new-capture recognition/accuracy/liveness, real-provider conversation/citation flows and online HTTPS remain external acceptance gates. Automated camera-denial testing captured no human faces.
