# VIPERS HOSPITAL – Deployment Report

*Motion Imprints Technologies, Uganda · 10-day online sales demonstration · prepared 25 October 2026*

## A. Executive summary

VIPERS HOSPITAL, the official **Bahmni Lite 2.0** hospital system with the OpenMRS **2.0.1** security patch, has been deployed on Google Cloud (Johannesburg) and is **live over HTTPS** behind a tester access code. It is rebranded as VIPERS HOSPITAL, has five demo role accounts, Uganda-relevant fictional data, contextual help, a first-login walkthrough and the **Ask Vipers AI** navigation assistant (DeepSeek).

Every workflow in the brief was exercised through the real web interface by automated browser tests against the public URL: registration, consultation (vitals, diagnosis, prescription, lab order), lab result entry and doctor view, appointments, documents, billing with payment and receipt, administration, help and AI, four screen sizes, phones, performance, reboot recovery and security. ****128 of 128**** final checks passed (details in TEST_RESULTS.md).

**Verdict: READY WITH MINOR LIMITATIONS** (see section I).

**Demo activation (10-day clock start): 2026-10-25 08:47 EAT (Africa/Kampala). Planned end: 2026-11-04 08:47 EAT (the VM takes a final backup and powers itself off automatically).**

## B. Deployment details

| Item | Value |
|---|---|
| Google Cloud project | `vipers-hospital-demo` (labels purpose=sales-demo, app=vipers-hospital, lifecycle=temporary-10day) |
| Region / zone | africa-south1 (Johannesburg) / africa-south1-a; same price as Belgium, closer to Uganda |
| VM | `vipers-hospital-vm`, e2-standard-4: 4 vCPU, 16 GB RAM, 80 GB balanced SSD, 4 GB swap |
| OS | Ubuntu 24.04.5 LTS x86-64, timezone Africa/Kampala; Docker 29.9.2, Compose 5.6.1 |
| Bahmni release | `Bahmni/bahmni-docker` tag **2.0.0-lite**, commit `3215b5a1c6aa036d07f10e60950bdec5866bb410` (24 Sep 2026), profile `bahmni-lite`, 18 services |
| Security patch | `bahmni/openmrs:2.0.1` (published 8 Oct 2026, Bahmni advisory: SQL injection and path traversal). Other images: release tags of 2.0.0-lite (no `latest` or unreleased builds) |
| Added services | Caddy (HTTPS, Let's Encrypt, page injection), `vipers-addons` (gate, help, Ask Vipers AI) |
| Services status | 20/20 containers running; auto-restart; recovered unaided from a full VM reboot in ~5 min |
| Public URL | **https://demo.34-35-115-102.sslip.io** (billing: https://billing.34-35-115-102.sslip.io). Switches automatically to **https://demo.motionimprints.tech** / **billing.motionimprints.tech** within 15 min of adding the two Namecheap A records (→ 34.35.115.102). |
| Access | Tester access code page → Bahmni login. SSH only via Google IAP. Databases and internal ports not exposed. |

## C. Implemented changes

- **Branding:** browser titles and visible text "Bahmni" → "VIPERS HOSPITAL"; VIPERS logo and favicon (teal medical cross with V mark, white header variant); wordmark and "DEMO ENVIRONMENT" chip in the app headers; Bahmni white-label (login and landing logos, welcome text "WELCOME TO VIPERS HOSPITAL"); logos on **registration cards and clinical printouts**; login location renamed **VIPERS HOSPITAL**; billing (Crater) company **VIPERS HOSPITAL**, logo on invoices and receipts, **teal theme**, VIPERS logo in place of "crater". Bahmni code is not modified; technical identifiers are unchanged.
- **Licences:** *About & licences* page (linked from the badge, gate and help) credits Bahmni, OpenMRS (trademark notice), Crater and components, and states what Motion Imprints configured.
- **Interface:** small bottom-corner **?** Help and **Ask Vipers AI** buttons, which lift above form action bars and shrink to icons inside forms; scroll room so they never permanently hide buttons; **phone layout fixes** for the 2.0 screens (single-column registration, compact header, dashboard and consultation pad fit, action-bar layering fix).
- **Contextual help:** page-specific help for 18 screens and 23 FAQs, all validated against the live UI (`help.json`); one dismissible quick tip per screen (desktop); full guide page `/vipers-assets/help.html`.
- **Walkthrough:** 3 steps on first login (navigation, workflows, Help & AI) with Next/Back/Skip/"Don't show again", stored in the browser only.
- **Ask Vipers AI:** server-side DeepSeek (`deepseek-flash`) integration with static-first answers, caching, per-IP rate limits, daily and total token ceilings, clinical-advice and patient-identifier filters, and the key in Secret Manager (see AI_INTEGRATION.md).
- **Demo accounts:** five roles built from Bahmni's own roles minus unrelated tiles; no System Developer or full-privilege rights. Missing 2.0 privileges were fixed (Get Appointments, Add Diagnoses/Allergies, DocumentReference). Self-healing every 15 min.
- **Billing:** Uganda Shilling (no decimals), Kampala time zone, day/month/year dates, Kampala address, Cashier role, UGX price list (12 services and medicines). Fixed the upstream sync's hard-coded INR currency for new patients.
- **Demo data:** six fictional patients covering malaria (lab-confirmed, paid invoice), antenatal care (pending labs, appointment), child pneumonia, hypertension follow-up, a waiting patient and a booked appointment. Reproducible with `tests/seed.js`; clean `baseline` backup for `reset-demo`.
- **Security hardening:** all Bahmni and Crater default passwords replaced (owner/super-admin passwords random and root-only on the server); stock demo users' passwords randomised; Crater's nginx no longer logs the sync's credentials, which Bahmni sends in the URL; legacy OpenMRS admin and AtomFeed console redirected; HSTS and no-index headers; gate lockout counts wrong codes only.
- **Operations:** guard timer (self-heal plus automatic DNS switch-over), nightly backups (02:30 EAT), `reset-demo`, Windows control script `vipers.ps1`, budget alerts.

## D. Clinical test results (final run, real UI, public HTTPS URL)

| Workflow | Result | Evidence | Notes |
|---|---|---|---|
| Patient registration | PASS | `wf-rec-2-form.png`, `wf-rec-3-saved.png`; reception.json | register, search (0.1 s), open, update details, start OPD visit: 6/6 |
| Consultation | PASS | `wf-doc-3-pad.png`, `wf-doc-4-vitals.png`, `wf-doc-6-dashboard-after.png`; doctor.json | vitals, diagnosis (Confirmed), notes form, saved in 1.9 s, reopened and verified via FHIR: 16/16 |
| Laboratory | PASS | `wf-lab-1-queue.png`, `wf-lab-2-entry.png`, `wf-lab-3-saved.png`; lab.json | doctor's RDT order reached Lab Entry, result "Positive for P. falciparum" saved, visible to the doctor: 4/4 |
| Medication | PASS | `wf-doc-2-medication-row.png`; doctor.json | AL 20/120 mg, 4 tablets twice a day × 3 days, oral; persisted as a medication order |
| Billing | PASS | `wf-bill-1-dashboard.png`, `wf-bill-2-invoice-form.png`, `wf-bill-6-invoice-paid.png`; billing.json | patient auto-synced as customer; UGX 42,000 invoice; cash payment; PDF receipt; invoice PAID: 6/6 |
| Appointments | PASS | `wf-appt-1-form.png`, `wf-appt-3-checkin.png`; appointments-documents.json | booked (General Medicine OPD), then checked in through the UI, change persisted |
| Patient documents | PASS | `wf-doc-up-3.png` | fictional referral letter uploaded and listed under the visit |
| Administration | PASS | `wf-adm-2-audit.png`, `wf-adm-3-formbuilder.png`, `wf-adm-4-service.png`; admin.json | audit log, form builder, reversible "Antenatal Care" service; owner password reset / user creation / settings all blocked (HTTP 403): 9/9 |
| Phone (390 px) | PASS | `evidence/mobile/mob-*.png`; mobile.json | register, consultation, lab result, appointment, billing, help & AI: 6/6 |

## E. Ask Vipers AI test results

| Item | Result |
|---|---|
| Model | `deepseek-flash` (verified via DeepSeek `/models`) |
| Test questions | 23 (22 through the API in the user session + 1 through the panel UI) |
| Answered by DeepSeek | 4 new navigation questions, all successful; average **2.5 s** |
| Answered from static help / cache (0 tokens) | 5 (3 FAQs, 1 page-context question, 1 panel example) + 1 cached repeat |
| Declined (clinical advice) / withheld (patient identifiers) | 3 / 2, all correct |
| Failures | 0 |
| Tokens | ~1,633 input + ~897 output for the DeepSeek answers (≈ 410 in / 225 out per answer) |
| Estimated cost | about USD 0.01 for all testing today (DeepSeek balance 3.09 → 3.08) |
| Security | key never in browser, scripts, assets, logs or reports; browser never calls DeepSeek; rate limit triggered (7 of 8 rapid requests rejected) |

## F. Screenshots

Actual screenshots from the deployed system are in `evidence/screenshots/` (desktop) and `evidence/mobile/` (phone):

| # | Screen | File |
|---|---|---|
| 1 | Tester gate and VIPERS HOSPITAL login | `r-00-gate.png`, `r-01-login.png` |
| 2 | Home dashboard | `ux-desktop-1920-home.png`, `wf-adm-1-home.png` |
| 3 | Registration | `wf-rec-2-form.png`, `wf-rec-3-saved.png` |
| 4 | Doctor consultation | `wf-doc-3-pad.png`, `wf-doc-4-vitals.png`, `wf-doc-6-dashboard-after.png` |
| 5 | Laboratory | `wf-lab-1-queue.png`, `wf-lab-2-entry.png`, `wf-lab-3-saved.png` |
| 6 | Billing | `wf-bill-1-dashboard.png`, `wf-bill-2-invoice-form.png`, `wf-bill-6-invoice-paid.png` |
| 7 | Contextual help | `wf-ai-1-help-panel.png`, `r-13-help-guide.png` |
| 8 | Ask Vipers AI | `wf-ai-2-panel-answer.png` |
| 9 | Demo administration | `wf-adm-2-audit.png`, `wf-adm-3-formbuilder.png`, `wf-adm-4-service.png` |
| – | Walkthrough, About & licences, phones | `wf-tour-1.png`, `r-12-about-licences.png`, `evidence/mobile/*` |

## G. Google Cloud cost report

| | |
|---|---|
| Estimate before deployment | ≈ USD 4.1/day → ≈ 41 for 10 days (+ setup), target 40–50 |
| Actual hourly rate | ≈ USD 0.164/h (VM 0.147 + disk 0.012 + IP 0.005), from the Google catalogue |
| Spend so far | ≈ USD 1.1 (6.8 h since VM creation at 02:09 EAT; Billing → Reports shows the actual figure, with a lag of several hours) |
| Remaining demo period | 10 days × 3.94 ≈ USD 39.4 (+ small egress) |
| Trial credit | USD 190.71 remaining (Billing → Credits, 25 Oct; not readable via the CLI) |
| Alerts | budget USD 50 (25 Oct – 15 Nov), alerts at 20 / 35 / 50 gross of credits; **alerts only e-mail, they don't stop spending** |
| Demo expiry | 2026-11-04 08:47 EAT (the VM takes a final backup and powers itself off automatically) |
| Shutdown | CLEANUP.md (close firewall → stop VM → delete project → relink PaperAid billing) |

## H. Outstanding issues

- **DNS not yet configured:** add A records `demo` and `billing` → 34.35.115.102 at Namecheap. Until then testers use the sslip.io address (valid HTTPS).
- **PaperAid billing is unlinked** (`paperaid-ca172`): this freed the trial billing slot, so the PaperAid Firebase backend is paused. Relink after the demo (CLEANUP.md step 5).
- **Rotate the DeepSeek key** after the demo (it was shared in chat).
- Product limits (KNOWN_LIMITATIONS.md): no pharmacy stock or dispensing, inpatient or analytics in Lite; invoices are not auto-generated from orders; °F temperature; `ABC` patient-ID prefix; generic address labels; "GST Number" field and double-spaced names in billing; legacy layouts in some screens.
- **Phones:** core screens and workflows tested on a 390 px phone; Appointments keeps its desktop layout (zoom).
- Demo-only settings: shared simple passwords, relaxed password policy, visits kept open (stale-visit task paused), automatic power-off at the end. Revert for any real installation (DEPLOYMENT.md, section C).
- No manual intervention is needed to run the demo; the DNS records are optional.

## I. Final client readiness verdict

**READY WITH MINOR LIMITATIONS**

All 128 final acceptance checks passed against the live HTTPS deployment: every clinical, laboratory, appointment, document, billing and administration workflow, plus help, walkthrough, Ask Vipers AI and its safeguards, four screen sizes, phones, performance, reboot recovery and security. Testers can use it now through the sslip.io address.

"Minor limitations" rather than "ready" reflects things outside the build itself, all documented: the motionimprints.tech DNS records still need to be added (optional; the switch is automatic); Bahmni Lite does not include pharmacy stock, inpatient or automatic billing from orders; a few cosmetic upstream items (°F temperature, `ABC` IDs, India-oriented address labels and GST field); and Appointments keeps its desktop layout on phones. None of these block a client demonstration.
