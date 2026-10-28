# Google Cloud costs – VIPERS HOSPITAL demo

All charges go to billing account `01D668-8878F1-940DCD` and are paid from the **free-trial credit** (USD 190.71 remaining of 300 when checked on 25 Oct 2026, expiring January 2027). Project `vipers-hospital-demo` only.

## Prices used (Google Cloud Billing Catalog, fetched 25 Oct 2026, on-demand, africa-south1)

| Resource | Unit price | Per hour | Per day |
|---|---|---|---|
| e2-standard-4: 4 vCPU × 0.023993 + 16 GB × 0.003216 | per hour | 0.1474 | 3.54 |
| 80 GB balanced persistent disk (0.109788 per GB-month) | per month | 0.0120 | 0.29 |
| Static external IP, in use | 0.005 per hour | 0.0050 | 0.12 |
| **Total (excluding egress)** | | **≈ 0.164** | **≈ 3.94** |

Johannesburg (africa-south1) has the **same E2 price as Belgium** (europe-west1) and much lower latency from Uganda, so it was chosen. Quotas in both regions were sufficient (32 vCPU, 250 GB SSD).

Not used (to keep costs down): load balancers, Cloud NAT, managed databases, Kubernetes, snapshots, paid monitoring. Backups are stored on the VM's own disk.

## Estimates

| Period | Hours | Estimate (USD) |
|---|---|---|
| Build and acceptance testing (25 Oct, 02:09 EAT → activation) | ≈ 8–9 | ≈ 1.5 |
| 10-day demonstration (24/7) | 240 | ≈ 39.4 |
| Network egress (testers' page loads, est.) | | ≈ 1–2 |
| **Expected total** | | **≈ 42–43** |

This is within the USD 40–50 target and well below the USD 55 ceiling. These are estimates, not a guaranteed cap.

DeepSeek (separate account, prepaid balance USD 3.09): the test questions cost < USD 0.01 in total. A heavy demo day (~200 AI answers at ~700 tokens each) is about 140k tokens. Check DeepSeek's current per-million-token price for `deepseek-flash` to convert; the measured balance did not move during testing. Hard ceilings (250k tokens/day, 1.5M total) cap the worst case (see AI_INTEGRATION.md).

## Budget alerts

Budget **"VIPERS demo period budget"**: USD 50 for **25 Oct – 15 Nov 2026**, project `vipers-hospital-demo` only, **measured before credits** (so the alerts still fire although the credit pays). Alerts at **40 % (USD 20), 70 % (USD 35) and 100 % (USD 50)**, e-mailed to the billing account's administrators (omodingisaac123@gmail.com).

> **Budget alerts do not stop spending.** They only send e-mails. To stop charges, stop the VM (`.\vipers.ps1 vm-stop`) or follow CLEANUP.md.

## Checking actual spend

Google Cloud console → **Billing → Reports** → filter *Project = vipers-hospital-demo* (data lags by several hours). The free-trial balance is under **Billing → Credits**.

## After the demo

A stopped VM still costs about USD 0.41/day (disk + reserved IP). Deleting the project (CLEANUP.md) brings this to zero.
