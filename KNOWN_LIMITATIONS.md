# Known limitations – VIPERS HOSPITAL demo

Be open about these with prospective clients. None of them stop the demo workflows.

## Scope of the software (Bahmni Lite 2.0)

| Area | What the demo has | Not in Bahmni Lite 2.0 (do not advertise) |
|---|---|---|
| Registration, visits, search | Yes | — |
| Consultations, vitals, diagnoses, allergies | Yes (2.0 consultation pad) | — |
| Prescriptions | Yes (medication orders, print latest medications) | **Pharmacy stock / dispensing / inventory** (that is Bahmni Standard with Odoo) |
| Laboratory | Orders flow to **Lab Entry**; results entered and visible to the doctor; report upload | Analyser integration / full LIS (OpenELIS is not part of Lite) |
| Appointments | Booking, check-in, services, calendar | — |
| Patient documents | Upload per visit (images, video, PDF ≤ 5 MB) | — |
| Billing | Crater invoices, payments, receipts in UGX; **patients sync automatically** to billing | **Automatic charging from orders** (the sync only creates/updates customers; the cashier builds the invoice) |
| Inpatient (wards, beds, ADT) | Yes (enabled 28 Oct 2026): Female, Male, Maternity, Paediatric wards (32 beds); admit, assign bed, transfer, discharge; In-Patient tile for Ward Nurse, Doctor, Administrator | — |
| Radiology / PACS, analytics dashboards (Metabase) | — | Not deployed in this profile (links removed) |

## Things you may notice

- **Age instead of date of birth → 1 January.** If only the age is entered at registration, Bahmni stores an estimated date of birth of 1 January of that year (e.g. age 30 on 28 Oct 2026 → 01/01/1996, shown as "30 years 9 months"). The registration form briefly shows today's date minus 30 years before saving. Help tells users to enter the exact date of birth when known.
- **"Start OPD visit" says "Patient updated successfully".** The visit is created (it shows as Active Visit); only the stock message wording is misleading.
- **Lab results:** after saving, the result is visible to the doctor but not listed on the Lab Entry patient screen, and a Positive result is not flagged Abnormal automatically (the technician ticks Abnormal).
- **Date formats differ by module:** 2.0 screens use 10/28/2026 (month first), Lab Entry 01 — Jan — 1996 and a mm/dd/yyyy picker, Billing and reports 28/10/2026 and 28-Oct-2026.
- **Invoices and receipts show the patient's name and phone, not the Patient ID.** The ID is visible in the Billing customer list.
- **Audit log** lists the oldest events of the chosen day first (scroll down for recent activity).
- **Automated testers:** the History and Examination form can crash (React error #185, the open consultation is lost) if a long text is typed in one machine-speed burst. Human typing, pasting and fast typists (30 ms per key) were tested and do not trigger it; browser agents should type long notes in short chunks.
- **Temperature is entered in °F** in the stock Vitals form. Changing to °C requires concept/form configuration (out of scope for this demo).
- **Patient ID prefix is `ABC`** (stock Bahmni identifier source), e.g. ABC200003.
- **Address fields are generic** (District/State/Pin Code labels and an India-oriented hierarchy from the stock config). City/Village works as free text.
- **Billing shows a "GST Number" field** on invoices (Indian tax field in the Bahmni Crater build), and synced customer names may show a double space when there is no middle name.
- **Billing has a separate login** (e-mail based), as in the official Bahmni Lite design.
- Some legacy screens still use the older Bahmni look (Clinical patient search, Appointments, older admin pages). Branding (title, logo, colours) is applied, but the layout is the original.
- **Open access (since 28 Oct 2026):** no access code and no passwords. Anyone with the link can click a role card and enter, and can change data others see. The guard restores accounts every 15 minutes and `reset-demo` restores the data. Not for real patients.
- The cards sign in to shared accounts with simple passwords (policy relaxed to 6 characters). Wrong passwords typed in the hidden manual form lock that shared account (and its card) for 5 minutes for everyone.
- **Visits stay open during the demo:** the "Close Stale Visits Task" is paused so the demo patients remain in the Active and Lab lists for all 10 days. A real hospital should keep it running (re-enable with `KEEP_VISITS_OPEN=0` before running `05-demo-accounts.sh`, then start the task in OpenMRS).
- **The demo powers itself off** at the end of the period (2026-11-04 08:47 EAT) after a final backup. `.\vipers.ps1 vm-start` brings it back; cancel with `sudo systemctl disable --now vipers-expiry.timer` on the VM.

## Phones and tablets

- **Laptop and tablet:** all workflows tested.
- **Phone (390 px):** the 2.0 screens (home, registration, search, patient dashboard, consultation pad, documents), Lab Entry and Billing have been adapted and tested. **Appointments** is a legacy desktop page: it works on a phone but shows the desktop layout (pinch to zoom). Phones are fine for demonstrations and quick tasks, but full clinical data entry is more comfortable on a tablet or laptop.

## Speed

- The **first** visit to a section downloads its app code (up to ~1.4 MB after the login warm-up; Clinical and Appointments are pre-downloaded in the background). After that, sections load from the browser cache and only fetch patient data. On slow or unstable connections the first visit can still take several seconds.
- Restarting services (maintenance) can interrupt requests in progress; the page shows a temporary error, and retrying works.

## Ask Vipers AI

- Navigation help only; it declines medical questions. It may say "I'm not sure" when a question isn't covered by the verified help. That is intended rather than guessing.
- Needs internet and the DeepSeek service; if unavailable, the static Help still works.
- Limited by daily and total token ceilings (see AI_INTEGRATION.md).

## Hosting

- Single VM, no high availability. A VM restart brings everything back automatically (tested: ~5 minutes), but OpenMRS is unavailable during that time.
- Until the Namecheap A records exist, the address is the temporary `*.34-35-115-102.sslip.io` host (valid HTTPS). The switch to `demo.motionimprints.tech` happens automatically within 15 minutes of DNS propagating.
- This is a demonstration environment. It makes **no claim of production-grade clinical security or regulatory compliance** (e.g. Uganda's Data Protection and Privacy Act obligations for a live hospital).
