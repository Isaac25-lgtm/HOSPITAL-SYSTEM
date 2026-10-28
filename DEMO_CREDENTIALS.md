# VIPERS HOSPITAL – Demo access (for invited testers)

> Share this with invited hospital testers (e-mail or WhatsApp). This is a sandbox with **fictional data only**.

## 1. Open the demo

| | |
|---|---|
| Web address | **https://demo.34-35-115-102.sslip.io** (switches to **https://demo.motionimprints.tech** once its DNS record is added) |
| Passwords | **None needed.** Click the card for your role. |
| Works on | Chrome, Edge, Firefox or Safari on a laptop, tablet or phone. Nothing to install. |

## 2. Choose your role

The sign-in page shows one card per role. Click a card and you are taken straight to the Home page at **VIPERS HOSPITAL**.

| Card | What you can try |
|---|---|
| Reception | Register and search patients, start visits, book appointments, upload documents |
| Doctor | Consultations, vital signs, diagnoses, prescriptions, lab orders, view lab results |
| Ward Nurse | Admissions, bed allocation (4 wards, 32 beds), ward transfers and discharges |
| Laboratory | Lab work queue, enter and save test results |
| Cashier | Patient lookup; the **Billing** tile opens the billing system |
| Administrator | Audit log, form builder, reports, appointment services |
| Billing | Opens the billing system; click **Enter Billing as Cashier** |

To switch role: log out (top right, *Hi, …* > Logout) and click another card.

## 3. Billing

Billing is a separate application (https://billing.34-35-115-102.sslip.io). Click **Enter Billing as Cashier**. Patients registered in VIPERS HOSPITAL appear in Billing automatically as customers. Prices are in Uganda Shillings (UGX).

## 4. Good to know

- Use **fictional** names and numbers only. Do not enter real patient information.
- The **?** button on each screen shows short step-by-step help. **Ask Vipers AI** answers "how do I…" questions about using the system. It does not give medical advice.
- Example patients are already loaded: Grace Nakato (malaria), Sarah Namubiru (antenatal care), Brian Mugisha (child, pneumonia), John Ssempala (hypertension follow-up), Peter Okello (waiting to see the doctor), Mary Achieng (appointment booked).
- Shared accounts: other testers may be using the same role at the same time and can see what you enter.

---
*For the system owner only (not for testers):* the cards sign in to these demo accounts. Hospital system: `demo.reception` / `liverpool`, `demo.doctor` / `arsenal`, `demo.lab` / `chelsea`, `demo.cashier` / `everton`, `demo.admin` / `fulham`, `demo.nurse` / `brighton`. Billing: `demo.cashier@vipers.demo` / `everton`. The link *Sign in with a username and password instead* under the cards shows the normal form. The former tester access code gate is switched off (`GATE_ENABLED=false` in `/opt/vipers/edge/edge.env`; set it to `true` and recreate `vipers-addons` to turn it back on).
