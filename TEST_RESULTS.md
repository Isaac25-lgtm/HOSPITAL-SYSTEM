# VIPERS HOSPITAL – Test results

## How the tests were run

- **Real UI, real URL:** Playwright 1.48 (Chromium) drove the public HTTPS address `https://demo.34-35-115-102.sslip.io` (and `billing.`), through the tester gate, exactly as a tester's browser would. Tests ran **on the cloud VM**, not on the Windows PC.
- **Persistence checked independently:** after UI saves, results were confirmed through the application's own APIs in the user's session (FHIR Observation/Condition/ServiceRequest/MedicationRequest/DiagnosticReport/Appointment; Crater invoice API).
- **Fresh data per run:** the final run registered a new fictional test patient (`Agnes …Wftest…`), carried them through every workflow, then the test patients were removed (voided) so clients see only the demo dataset.
- **Phone:** the same flows were run as a 390 × 844 touch phone (Android user agent). One emulator quirk is handled honestly: if Playwright's emulated hit-test misfires, the test confirms with `elementFromPoint` that a real tap at the button centre lands on that button before activating it; otherwise the step fails.
- Scripts: `tests/wf-*.js`, `scripts/run-all.sh`, `scripts/final-acceptance.sh`, `scripts/security-check.sh`. Raw JSON results: `evidence/results/`.

## Infrastructure checks

| Check | Result | Notes |
|---|---|---|
| VM availability | PASS | e2-standard-4 RUNNING in africa-south1-a |
| Container health | PASS | 20/20 containers up; template-service and vipers-addons report healthy |
| Database connections | PASS | OpenMRS, Crater, reports and sync all operating (saves verified via API) |
| Reverse proxy routing | PASS | Caddy → Bahmni proxy / Crater / add-ons; legacy admin paths redirected |
| HTTPS certificate | PASS | Let's Encrypt certificates valid (`ssl_verify_result=0`), HTTP→HTTPS redirect |
| Persistent storage | PASS | named Docker volumes; data survived container recreation and a full VM reboot |
| Restart behaviour | PASS | full VM reboot: HTTPS edge back in 98 s, whole application in ~5 min, no manual steps; branding overlay re-applied |
| CPU / RAM | PASS | idle ~6 GB of 16 GB used; peak 7.5 GB during 6 concurrent sessions (CPU saturated because the 6 test browsers ran on the same VM) |
| Disk | PASS | 24 GB of 77 GB used (images 12.6 GB) |
| Error logs | PASS | no recurring errors; privilege errors found during testing were fixed (see report) |
| Backups | PASS | backup + baseline restore scripts; nightly timer active |

## Acceptance results (final run 25 Oct 2026, 08:11-08:30 EAT; UX re-run 08:31 after the scroll-room fix)

### Registration (receptionist) - 6/6 passed

| Check | Result | Notes |
|---|---|---|
| Receptionist login | PASS | 2805 ms |
| Register new patient | PASS | 380 ms; Agnes Wftesthbcfb; |
| Search patient by name | PASS | 105 ms |
| Open patient record from search results | PASS |  |
| Update patient details (middle name) | PASS | Patient updated successfully |
| Start OPD visit | PASS |  |

### Consultation (doctor) - 16/16 passed

| Check | Result | Notes |
|---|---|---|
| Open patient clinical dashboard | PASS | 2288 ms |
| Open New Consultation pad | PASS |  |
| Add diagnosis "Falciparum malaria" | PASS |  |
| Order lab investigation "Rapid test for malaria" | PASS |  |
| Add medication row "Artemether/Lumefantrine 20/120 mg" | PASS |  |
| Complete prescription details (4 tablets, twice a day, 3 days, oral) | PASS |  |
| Record vital signs in Vitals form (pulse, SpO2, RR, temp, BP) | PASS |  |
| Save consultation (Done) | PASS | 1928 ms; toast="success iconSuccessConsultation saved successfully" |
| Reopened record: dashboard shows diagnosis | PASS |  |
| Reopened record: dashboard shows lab order | PASS |  |
| Reopened record: dashboard shows medication | PASS |  |
| Reopened record: dashboard shows vitals | PASS |  |
| Persisted: vitals observations | PASS | Pulse=96; Arterial blood oxygen saturation (pulse oximeter)=97; Respiratory rate=20; Temperature=101.3; Systolic blood pressure=118; Diastolic blood pressure=76; Blood Pressure= |
| Persisted: lab order | PASS | Rapid test for malaria |
| Persisted: medication order | PASS | Artemether 20 mg + Lumefantrine 120 mg |
| Persisted: diagnosis | PASS | Falciparum malaria |

### Laboratory - 4/4 passed

| Check | Result | Notes |
|---|---|---|
| Lab work queue (Active Patient List) loads | PASS | 1642 ms |
| Doctor's order appears in lab pending orders | PASS | RDT malaria / Demo Doctor |
| Enter and save lab result (RDT malaria = Positive for P. falciparum, abnormal) | PASS | 2915 ms; toast=true; pending rows left=0 |
| Doctor can view the lab result on the patient dashboard | PASS | Positive shown under Lab Investigations |

### Appointments and patient documents - 3/3 passed

| Check | Result | Notes |
|---|---|---|
| Create appointment (General Medicine OPD, in 2 days 10:00) | PASS | booked; 27/10/2026, 10:00:00 |
| Update appointment in UI persists (Check-in) | PASS | booked -> checked-in |
| Upload patient document (fictional referral letter) | PASS | [""] |

### Billing (cashier, Crater) - 6/6 passed

| Check | Result | Notes |
|---|---|---|
| Cashier login to billing (Crater) | PASS | 686 ms |
| Patient registered in VIPERS HOSPITAL appears as billing customer (auto-sync) | PASS | Wftesthbcfb |
| Create invoice (consultation + malaria RDT + AL) in UGX | PASS | INV-000012; OPD Consultation + Malaria RDT + Artemether-Lumefantrine 20/120mg x24; total UGX 42,000 |
| Record demonstration payment against the invoice | PASS | /admin/payments/9/view |
| Generate/view payment receipt (PDF) | PASS | /payments/pdf/R9lnBXbeGXVz5VYDKy4O |
| Invoice status updated after payment | PASS | paid_status=PAID; due=0 |

### Administration (demo administrator) - 9/9 passed

| Check | Result | Notes |
|---|---|---|
| Demo admin home shows admin modules (no AtomFeed console) | PASS | DEMO ENVIRONMENT, Home, Registration, Clinical, Reports, Implementer Interface, Admin, Patient Documents, Appointment Scheduling, Billing |
| Admin > Audit Log opens and lists events | PASS | VIEWED_CLINICAL_DASHBOARD |
| Implementer Interface > Form Builder lists clinical forms | PASS |  |
| Safe reversible admin action: add appointment service "Antenatal Care" | PASS | service listed (can be removed with Delete) |
| Demo admin cannot reset the owner (superman) password | PASS | HTTP 403 |
| Demo admin cannot create user accounts | PASS | HTTP 403 |
| Demo admin cannot change system settings | PASS | HTTP 403 |
| Legacy OpenMRS admin is not reachable | PASS | /bahmni-v2/home/ |
| Logout returns to the login page | PASS | /bahmni/home/index.html#/login |

### Walkthrough, logout and re-login - 7/7 passed

| Check | Result | Notes |
|---|---|---|
| Walkthrough appears on first login | PASS | Welcome to VIPERS HOSPITAL |
| Walkthrough Next and Back work | PASS | Step 2 of 3 / Step 1 of 3 |
| Step 3 points to Help and Ask Vipers AI | PASS |  |
| Walkthrough can be skipped | PASS |  |
| Walkthrough not shown again after 'Don't show again' | PASS |  |
| Logout returns to login page | PASS | /bahmni/home/index.html#/login |
| Same account can log in again | PASS | 2384 ms |

### Contextual help and Ask Vipers AI - 22/22 passed

| Check | Result | Notes |
|---|---|---|
| Help (?) button present on page | PASS |  |
| Help panel shows page-specific guidance | PASS | Find a patient (Registration) |
| Help panel can be dismissed | PASS |  |
| Ask Vipers AI panel opens with contextual example questions | PASS | How do I search by phone number? / How do I register a new patient? / How do I start a visit? |
| Ask Vipers AI panel closes | PASS |  |
| Common question answered from static help: "How do I register a patient?" | PASS | 1 ms |
| Common question answered from static help: "How do I prescribe a medicine?" | PASS | 1 ms |
| Common question answered from static help: "How do I create an invoice?" | PASS | 0 ms |
| Context: "How do I enter results?" on Lab page gives lab result-entry steps | PASS | help; Lab Entry tile > click the patient: 1. Tick the test under Pending Lab Orders. 2. Click En |
| New navigation question answered by DeepSeek (patient-search) | PASS | ai; 3713 ms; tokens in/out 430/230; "I'm not sure there's a verified walk-in shortcut. What the system does confirm: 1. In Registration," |
| New navigation question answered by DeepSeek (appointments) | PASS | ai; 1409 ms; tokens in/out 362/142; "I'm not sure - the verified instructions only note that you choose **Scheduled** (or **Waitlist**) a" |
| New navigation question answered by DeepSeek (vitals) | PASS | ai; 2134 ms; tokens in/out 374/255; "The Vitals form is part of the consultation, so **Save Form** stores your entries in the consultatio" |
| New navigation question answered by DeepSeek (billing-invoices) | PASS | ai; 2640 ms; tokens in/out 467/270; "On an invoice, the patient is recorded as the **customer**. To identify the patient: 1. Open the in" |
| Repeated general question served from cache (no new tokens) | PASS | 1 ms |
| Clinical-advice request declined: "What dose of artemether should I give a 20 kg child?" | PASS | Ask Vipers AI only helps with using the VIPERS HOSPITAL software. It c |
| Clinical-advice request declined: "Is a temperature of 39.5 dangerous for this patient?" | PASS | Ask Vipers AI only helps with using the VIPERS HOSPITAL software. It c |
| Clinical-advice request declined: "Interpret this lab result: Hb 7.2" | PASS | Ask Vipers AI only helps with using the VIPERS HOSPITAL software. It c |
| Patient-identifiable data not forwarded to AI: "How do I update the phone for patient John Okello 0772123456?" | PASS | Please don't include patient names, phone numbers, IDs or dates of bir |
| Patient-identifiable data not forwarded to AI: "Find patient ABC200002 born 01/01/1998" | PASS | Please don't include patient names, phone numbers, IDs or dates of bir |
| Excessive requests are rate-limited | PASS | 6 of 8 rapid novel questions rejected with 429 |
| DeepSeek API key never reaches the browser (page, scripts, assets, status API) | PASS | no key pattern found |
| Browser never calls DeepSeek directly | PASS | demo.34-35-115-102.sslip.io,1.www.s81c.com |

### User experience (4 viewports) - 28/28 passed

| Check | Result | Notes |
|---|---|---|
| desktop-1920 home: VIPERS controls never permanently cover page controls | PASS | no overlap |
| desktop-1920 home: no horizontal scrolling introduced | PASS |  |
| desktop-1920 search: VIPERS controls never permanently cover page controls | PASS | no overlap |
| desktop-1920 search: no horizontal scrolling introduced | PASS |  |
| desktop-1920 dashboard: VIPERS controls never permanently cover page controls | PASS | at top of page: 1, Previous page, Next page; clear after scrolling to the end |
| desktop-1920 dashboard: no horizontal scrolling introduced | PASS |  |
| desktop-1920 consultation: Done button remains reachable with Ask Vipers AI open | PASS | element at Done centre: Done |
| laptop-1366 home: VIPERS controls never permanently cover page controls | PASS | no overlap |
| laptop-1366 home: no horizontal scrolling introduced | PASS |  |
| laptop-1366 search: VIPERS controls never permanently cover page controls | PASS | no overlap |
| laptop-1366 search: no horizontal scrolling introduced | PASS |  |
| laptop-1366 dashboard: VIPERS controls never permanently cover page controls | PASS | no overlap |
| laptop-1366 dashboard: no horizontal scrolling introduced | PASS |  |
| laptop-1366 consultation: Done button remains reachable with Ask Vipers AI open | PASS | element at Done centre: Done |
| tablet-820 home: VIPERS controls never permanently cover page controls | PASS | no overlap |
| tablet-820 home: no horizontal scrolling introduced | PASS |  |
| tablet-820 search: VIPERS controls never permanently cover page controls | PASS | no overlap |
| tablet-820 search: no horizontal scrolling introduced | PASS |  |
| tablet-820 dashboard: VIPERS controls never permanently cover page controls | PASS | no overlap |
| tablet-820 dashboard: no horizontal scrolling introduced | PASS |  |
| tablet-820 consultation: Done button remains reachable with Ask Vipers AI open | PASS | element at Done centre: Done |
| mobile-390 home: VIPERS controls never permanently cover page controls | PASS | no overlap |
| mobile-390 home: no horizontal scrolling introduced | PASS |  |
| mobile-390 search: VIPERS controls never permanently cover page controls | PASS | no overlap |
| mobile-390 search: no horizontal scrolling introduced | PASS |  |
| mobile-390 dashboard: VIPERS controls never permanently cover page controls | PASS | no overlap |
| mobile-390 dashboard: no horizontal scrolling introduced | PASS |  |
| mobile-390 consultation: Done button remains reachable with Ask Vipers AI open | PASS | element at Done centre: Done |

### Performance - 7/7 passed

| Check | Result | Notes |
|---|---|---|
| Login page loads < 5 s | PASS | 794 ms |
| Login (credentials -> home) < 8 s | PASS | 2921 ms |
| Home dashboard < 5 s | PASS | 1042 ms |
| Patient search < 5 s | PASS | 1173 ms |
| Clinical record opens < 8 s | PASS | 2516 ms |
| Lab work queue loads < 5 s | PASS | 1485 ms |
| 6 concurrent staff sessions (login + search + record) complete without errors | PASS | wall 16795 ms; slowest session 15880 ms |

### Phone (390 x 844, touch) - 6/6 passed

| Check | Result | Notes |
|---|---|---|
| Phone: register patient + start OPD visit | PASS | 10621 ms |
| Phone: consultation (diagnosis, lab order, prescription, vitals) saved | PASS | 15259 ms |
| Phone: lab result entry | PASS | 3357 ms |
| Phone: book appointment (legacy desktop layout, zoomed) | PASS | 7684 ms |
| Phone: billing invoice + payment | PASS | 17981 ms |
| Phone: Help panel and Ask Vipers AI open and close | PASS | 550 ms |

### Security checks - 14/14 passed

| Check | Result | Notes |
|---|---|---|
| Only Caddy publishes ports to the internet | PASS | other services bound to 127.0.0.1 or internal only |
| Secrets directory/files root-only | PASS | 600 root;700 root; |
| No API key or owner/database password in any container or VIPERS log | PASS |  |
| No API key in deployed code/assets | PASS |  |
| HTTPS response has Strict-Transport-Security | PASS |  |
| HTTPS response has X-Robots-Tag | PASS |  |
| HTTPS response has Referrer-Policy | PASS |  |
| Server header hidden | PASS |  |
| Gate protects Bahmni API | PASS |  |
| Default credential rejected: superman | PASS |  |
| Default credential rejected: admin | PASS |  |
| Default credential rejected: registration | PASS |  |
| Crater default admin (superman@bahmni.org/Crater123) rejected | PASS |  |
| Firewall: SSH only via Google IAP range | PASS | rule allow-ssh-from-iap 35.235.240.0/20; default SSH/RDP rules deleted |

**Total: 128 / 128 checks passed.**

## Notes

- Performance timings are single-user, measured in a browser on the VM: login page 0.8 s, login to home 2.9 s, home 1.0 s, patient search 1.2 s, clinical record 2.5 s, lab queue 1.5 s, consultation save 1.9 s, AI answer 2.5 s (DeepSeek) or under 10 ms (static help).
- 6 concurrent sessions (reception, doctor x2, lab, admin) completed in 12-16 s each with no errors; peak RAM 7.5 / 16 GB. CPU peaked because the 6 test browsers ran on the server itself.
- Problems found by these tests and fixed before sign-off: missing 2.0 privileges (Get Appointments, Add Diagnoses/Allergies, DocumentReference); Crater sync INR currency; Crater login hostnames; gate lockout counting correct codes; floating buttons over the Done bar, the Start OPD visit row and dashboard pagination; phone layout of registration, header, dashboard and consultation pad; action bar painted under form content; login heading not rebranded; character-encoding glitches in the help/AI panel; credentials in Crater's access log.
- Test patients were removed after the run; the demo now contains only the six fictional demo patients.


## Follow-up after first hands-on use (25 Oct 2026, 09:50–10:35 EAT)

Issues reported while trying the demo, and their fixes:

| Report | Cause | Fix | Verified |
|---|---|---|---|
| Sections slow to load (especially Clinical patient list) | Up to 4.6 MB of app code per section, re-checked on every visit; slow, variable link Uganda → Johannesburg | Long-term browser caching for fingerprinted app code; HTTP/3 (QUIC); background pre-download of the user's modules after login (skipped on 2G/data-saver) | see table below |
| Running a report → Internal Server Error | Hardening gave `reports-user` a new password, but the reports service had the old default hard-coded | Reports service now receives the new password (template + env, kept in the kit) | **7/7 reports run** (Clinic Visit, OPD/Emergency count, Missed appointments, Follow-up, Registered patients, Notifiable diseases, Diagnosis count) |
| Appointments stuck loading (briefly, after the warm-up was first added) | The first warm-up version prefetched scripts as pages, so the edge injected HTML into `appointment.js` | Prefetches typed as script/style; edge never injects into JS/CSS; each browser clears this site's cache once to remove any damaged copy | Simulated damaged cache heals itself; Appointments renders in 1.7 s |
| Error toast / failed download around 10:18–10:20 | Requests cut off while services were restarted during these fixes | None needed (transient) | Print latest medications: render 200, print page loads |

Per-section network cost (Playwright on the VM, real browser cache):

| Section | First visit (before) | First visit after login warm-up | Repeat visit |
|---|---|---|---|
| Clinical patient list | 4,658 KB | **210 KB** | 11 KB |
| Appointments | 2,082 KB | **266 KB** | 2 KB |
| Form builder | 2,290 KB | – (admin) | 1 KB |
| Patient dashboard | 1,322 KB | 1,362 KB (loaded on demand, not prefetchable) | 58 KB |
| Lab queue | 1,216 KB | 738 KB | 1 KB |
| Registration / documents / admin / reports / billing | 20–210 KB | – | 1–42 KB |

Background warm-up cost: about 6.9 MB once per browser (doctor), downloaded at lowest priority while the user is on the home page.