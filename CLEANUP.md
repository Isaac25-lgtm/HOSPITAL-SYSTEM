# Ending the 10-day demo and cleaning up

Everything for the demo lives in **one Google Cloud project: `vipers-hospital-demo`** (labels `app=vipers-hospital`, `lifecycle=temporary-10day`). Nothing else in your account was created or modified, except the billing change noted in step 5.

Run these from this folder on your PC (PowerShell; gcloud is already signed in).

> **Automatic end:** the VM takes a final backup and **powers itself off at 2026-11-04 08:47 EAT** (end of the 10 days). That already stops compute charges and public access. The steps below finish the cleanup. To extend the demo instead: `.\vipers.ps1 vm-start` and, on the VM, `sudo systemctl disable --now vipers-expiry.timer`.

## 1. Take a final summary (optional)

```powershell
.\vipers.ps1 status                                            # final health snapshot
gcloud billing budgets list --billing-account=01D668-8878F1-940DCD --project=vipers-hospital-demo
```
Actual spend: Google Cloud console → Billing → Reports → filter project `vipers-hospital-demo`.

## 2. Close external access

```powershell
gcloud compute firewall-rules delete allow-web-vipers --project=vipers-hospital-demo --quiet
```
The site is now unreachable from the internet (the VM still runs).

## 3. Stop compute charges

```powershell
gcloud compute instances stop vipers-hospital-vm --zone=africa-south1-a --project=vipers-hospital-demo
```
A stopped VM costs only its disk (~USD 0.29/day) and its reserved static IP (about USD 0.24/day while reserved and not in use).

## 4. Remove everything (recommended once you no longer need the data)

The demo data is disposable (fictional). The reusable kit is in this folder on your PC, and none of it depends on the cloud project.

**Simplest: delete the whole project** (removes VM, disk, IP, firewall rules, secret and budget; 30-day undo window):
```powershell
gcloud projects delete vipers-hospital-demo
```

**Or delete resources one by one:**
```powershell
gcloud compute instances delete vipers-hospital-vm --zone=africa-south1-a --project=vipers-hospital-demo --quiet   # VM + its disk
gcloud compute addresses delete vipers-hospital-ip --region=africa-south1 --project=vipers-hospital-demo --quiet    # static IP
gcloud secrets delete deepseek-api-key --project=vipers-hospital-demo --quiet
gcloud billing budgets list --billing-account=01D668-8878F1-940DCD --format="value(name)" --filter="displayName:VIPERS"   # then: gcloud billing budgets delete <id> --billing-account=01D668-8878F1-940DCD
```

## 5. Restore PaperAid's billing (important)

To free a billing slot (the trial account allows 3 linked projects), billing was **unlinked from `paperaid-ca172`** (the live PaperAid Firebase / Cloud Run project) on 25 Oct 2026. Its Cloud Run API and worker are paused until billing is restored. After deleting or unlinking the demo project:
```powershell
gcloud billing projects unlink vipers-hospital-demo          # skip if you deleted the project
gcloud billing projects link paperaid-ca172 --billing-account=01D668-8878F1-940DCD --account=omodingisaac111@gmail.com
```
Don't leave PaperAid unlinked for long: Google may delete resources in projects that stay without billing.

## 6. Other housekeeping

- **Rotate the DeepSeek API key** in the DeepSeek dashboard (it was shared in a chat session).
- Namecheap: remove the `demo` and `billing` A records for motionimprints.tech if you added them.
- Local leftovers: `F:\MY FILES\DATA SCIENCE\CLINIC SYSTEM\bahmni-docker` is an empty, broken clone from the very first attempt; it's safe to delete.

## What to keep for the Hetzner / offline installs

This folder (`vipers-hospital-deploy`) contains everything reusable: install scripts, Compose override, branding, help content, the AI add-on, tests and documentation. It contains **no passwords or API keys**: secrets are generated fresh on each new server.
