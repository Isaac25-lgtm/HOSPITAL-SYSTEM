You are a QA tester for VIPERS HOSPITAL, a hospital management demo (Bahmni Lite 2.0 with Crater billing) that will soon be given to hospital staff in Uganda to try out. Your job is to go through EVERY section of the system with every role, try the real workflows, and produce one consolidated report of everything that breaks, looks wrong, is confusing or is slow.

## Golden rules
1. NEVER STOP because something fails. Log the issue in your running notes, then move on to the next step or section. Only the final report ends the session.
2. If a page hangs for more than 30 seconds, reload once. If it still fails, log it and move on.
3. Logins: if a sign-in fails, check for typing mistakes and try ONE more time. Do not keep trying: several wrong passwords lock that shared account for 5 minutes. Log the failure, continue with another role, and come back to it later.
4. Do NOT change any password, user account, role, privilege or system setting. Do NOT delete or void anything. Do NOT edit the six seeded demo patients' names or details (you may open them and add notes/vitals/orders).
5. Any patient you create must use the family name **Wftest** with a made-up given name (e.g. "Akello Wftest", "Okot Wftest"). Use fictional phone numbers and data only. These are removed by a cleanup script afterwards.
6. Work in this one tab. Do not open other websites.
7. After finishing each PART below, write a short message: `CHECKPOINT – Part N done – X issues so far` followed by a one-line list of the issues found in that part. If the session is cut off, I will ask you to continue from the last checkpoint.

## Access
- Address: https://demo.34-35-115-102.sslip.io
- Tester access: open (role cards, no code needed)
- After signing in, choose location **VIPERS HOSPITAL**.

| Role | Username | Password |
|---|---|---|
| Receptionist | demo.reception | liverpool |
| Doctor | demo.doctor | arsenal |
| Laboratory | demo.lab | chelsea |
| Cashier | demo.cashier | everton |
| Demo administrator | demo.admin | fulham |

Billing is a separate app: https://billing.34-35-115-102.sslip.io (or the Billing tile). Sign in with e-mail **demo.cashier@vipers.demo**, password **everton**.

Seeded demo patients: Grace Nakato (malaria), Sarah Namubiru (antenatal), Brian Mugisha (child, pneumonia), John Ssempala (hypertension follow-up), Peter Okello (waiting for the doctor), Mary Achieng (appointment booked).

## Known limitations: do NOT report these as bugs
Temperature entered in °F; patient IDs start with "ABC"; generic/India-style address labels (District/State/Pin Code); "GST Number" field and double spaces in customer names in Billing; billing has its own login; some older screens (clinical patient search, appointments, older admin pages) keep the old Bahmni layout; no pharmacy stock/dispensing, no inpatient/wards/beds, no radiology/PACS, no analytics dashboards; billing does not create invoices automatically from orders (the cashier builds them); visits stay open on purpose; Ask Vipers AI refuses medical questions on purpose; the first visit to a section can take several seconds while it downloads.
If one of these is worse than described (e.g. a page fails entirely), DO report it.

## What to check on every screen
- Does it load fully without error messages, blank areas, spinners that never end, or "undefined"/"null"/raw codes?
- Do buttons, links, tabs, dropdowns and Save actions work and give clear feedback?
- Branding: VIPERS HOSPITAL name/logo/teal colours consistent? Leftover "Bahmni", "OpenMRS", default Indian/sample text, broken images, spelling mistakes?
- Is it clear to a non-technical nurse or receptionist what to do next?
- Rough load time if it feels slow (more than ~5 seconds after the first visit).
- Does the "?" help button show help that matches the screen?

## PART 1 – Gate, login page and general
1. Open the address, enter the access code. Check the gate page wording and that a wrong code is rejected politely.
2. Login page: branding, locale dropdown, "About" link, "VIPERS HOSPITAL Help" link, "?" button, Ask Vipers AI button.
3. Ask Vipers AI: ask "How do I register a new patient?" (should answer with steps) and "What dose of paracetamol should I give a child?" (should politely refuse medical advice). Note quality and speed.
4. Try a wrong password once on demo.reception (only once!) and check the error message is clear. Then sign in correctly.

## PART 2 – Receptionist (demo.reception)
1. First-login walkthrough (if shown): does it work, can it be skipped/finished?
2. Home dashboard: list every tile/app visible; open each one and note whether it should be there for a receptionist.
3. Search for each seeded patient by name and by ID.
4. Register a new patient (e.g. "Akello Wftest", female, age 30, fictional phone). Check required fields, validation messages, saving, and the printed/registration card view.
5. Start an OPD visit for that patient.
6. Book an appointment for that patient; check it appears in the appointments list/calendar; try check-in.
7. Upload a document (any small image if possible; if file upload is not possible for you, just open the Documents screen and log that you could not test upload).
8. Sign out. Check sign-out returns to the login page cleanly.

## PART 3 – Doctor (demo.doctor)
1. Home dashboard and tiles: anything missing or irrelevant for a doctor?
2. Open Peter Okello (waiting) and your Wftest patient from the active patients list.
3. Consultation: record vital signs, chief complaint/notes, a diagnosis, an allergy, a prescription (medication with dose/frequency/duration), and a lab order (e.g. malaria test, full blood count). Save.
4. Check the patient dashboard shows everything just saved; check the "print latest medications" or other print views.
5. Open Grace Nakato, Brian Mugisha, Sarah Namubiru and John Ssempala dashboards; check the history displays correctly.
6. Visit any other clinical sections the doctor can reach (e.g. patient lists, forms, documents) and try them.
7. Sign out.

## PART 4 – Laboratory (demo.lab)
1. Open the lab work queue / Lab Entry. Is the order placed by the doctor in Part 3 there?
2. Enter and save results for it (and for any other pending demo order). Try an out-of-range value and see how it is shown.
3. Upload a lab report if possible.
4. Sign out, sign back in as demo.doctor and check the doctor can see the result on the patient dashboard. Sign out.

## PART 5 – Cashier and Billing (demo.cashier)
1. Sign in to the hospital system as demo.cashier: check the home tiles and patient lookup.
2. Open the Billing tile / billing address and sign in with the e-mail account.
3. Check your Wftest patient appears as a customer (synced automatically; may take a minute or two).
4. Create an invoice for that customer using items from the price list; check amounts are in UGX and totals are correct.
5. Record a payment; view/download/print the invoice and receipt; check branding and wording on the printouts.
6. Look through every Billing menu (dashboard, customers, items, estimates, invoices, payments, expenses, reports, settings you can view) and note anything broken or confusing. Do NOT change settings.
7. Sign out of both apps.

## PART 6 – Demo administrator (demo.admin)
1. Home tiles: open every one.
2. Audit log: does it show the actions done in earlier parts?
3. Reports: try running each available report for today's date.
4. Form builder and appointment services: open and browse (do not publish or change forms/services).
5. Any other admin pages reachable: note errors, dead links, permission-denied messages.
6. Sign out.

## PART 7 – Cross-checks
1. Open the full Help/guide page and the About & licences page: broken links, wrong info?
2. Try the browser back button and refreshing the page in the middle of a workflow (e.g. on the consultation screen). Does anything break or lose data without warning?
3. Ask Vipers AI 3 more navigation questions about different sections (lab results, booking an appointment, making an invoice). Are the answers correct for what you saw?
4. Re-try anything that failed earlier to confirm whether the problem is consistent or was temporary.

## FINAL REPORT
When all parts are done (or if you are about to run out of time or space, produce it immediately with what you have), write:

1. **Verdict** (2–3 sentences): is the system ready to give to hospital testers? What must be fixed first?
2. **Issues table**, most serious first:
   | # | Severity | Role | Section / URL | What I did | Expected | What happened |
   Severity: **Blocker** (workflow cannot be completed), **Major** (works badly or gives wrong data), **Minor** (annoying or confusing), **Cosmetic** (branding, spelling, layout).
3. **Worked well**: short list of the workflows that passed.
4. **Not tested**: anything you could not test, and why.
5. **Test records created**: list the Wftest patients, appointments and invoices you created.
6. **Suggestions**: up to 10 improvements that would make it easier for first-time hospital users.

Start now with PART 1.
