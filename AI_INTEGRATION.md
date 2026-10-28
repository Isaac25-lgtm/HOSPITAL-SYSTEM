# Ask Vipers AI – integration notes

Ask Vipers AI is a **navigation helper** for VIPERS HOSPITAL. It explains where to click and which steps to follow. It is **not** a clinical decision tool: it is intended to avoid diagnoses, treatment/dosing and result interpretation. Its prompt is not a clinical safety guarantee; the helper does not write patient records.

## How it works

```
Browser (vipers.js)                    vipers-addons (Node 22, on the server)           DeepSeek API
  ? Help panel  ── help.json ──────►   (static, no AI call)
  Ask Vipers AI ── POST /vipers-ai/api/chat {question, page, role, last 4 turns} ─►
                                        1. clinical-advice filter  -> polite refusal
                                        2. patient-identifier filter -> not sent, warning
                                        3. static FAQ match (help.json) -> answer, 0 tokens
                                        4. answer cache              -> answer, 0 tokens
                                        5. limits (per-IP, daily, total) -> fallback text
                                        6. small prompt: page help + top-3 FAQs ───────► deepseek-flash
                                                                          ◄──────────── <=300 tokens
```

- **Model:** `deepseek-flash` (confirmed in the live `/models` list on 25 Oct 2026). Endpoint: `https://api.deepseek.com/chat/completions` (OpenAI-compatible).
- **Context sent:** current screen id (e.g. `lab-results`), role name (e.g. `Doctor`), the question, at most the last 4 chat turns, and the verified help steps for that screen. Free-text forwarding is disabled by default (AI_ALLOW_FREE_TEXT=false). With explicit opt-in, question/history and filtered screen labels reach the provider; regex filters cannot guarantee removal of identifiers.
- **Page awareness:** the browser reports the screen id; the server adds that screen's verified steps, so "How do I enter results?" on the Lab screen gets lab steps.
- **Answer length:** system prompt asks for at most 170 words; hard cap `AI_MAX_OUTPUT_TOKENS=300`.

## The API key

- Stored only in **Google Secret Manager**, secret `deepseek-api-key` in project `vipers-hospital-demo` (region africa-south1).
- The VM's service account `vipers-vm@` has permissions described in docs/SECURITY-AUDIT.md; the controller requires instance-management rights, and trials still inherit that identity unless TRIAL_SA is configured.
- vipers-addons fetches the key from Secret Manager via the VM metadata server and re-reads it at least hourly. It is never written to disk, logs, the browser or the kit.
- Verified in testing: no `sk-…` pattern appears in any page, script, asset or status response, and the browser never contacts DeepSeek.

**Rotate the key (no rebuild):**
```powershell
# on your PC (gcloud is already signed in)
'NEW-KEY-HERE' | Out-File -NoNewline -Encoding ascii $env:TEMP\k.txt
gcloud secrets versions add deepseek-api-key --data-file=$env:TEMP\k.txt --project=vipers-hospital-demo
Remove-Item $env:TEMP\k.txt
.\vipers.ps1 restart vipers-addons      # picks up the new key immediately (otherwise within 1 hour)
```
Then revoke the old key in the DeepSeek dashboard. **The original key was pasted into a chat session, so please rotate it after the demo.**

## Cost controls (all in `/opt/vipers/edge/edge.env`)

| Setting | Demo value | Effect |
|---|---|---|
| `AI_ENABLED` | `true` | `false` = static help only (offline installs) |
| `AI_DAILY_TOKEN_LIMIT` | 250 000 | after this, users get the Help fallback until midnight UTC |
| `AI_TOTAL_TOKEN_LIMIT` | 1 500 000 | lifetime ceiling for the demo |
| `AI_MAX_OUTPUT_TOKENS` | 300 | per answer |
| `AI_IP_PER_MINUTE` / `AI_IP_PER_DAY` | 6 / 80 | per public IP |

Usage is persisted in the `addons-data` volume (`ai-usage.json`). Live status (no secrets): `https://<demo host>/vipers-ai/api/status` after passing the gate.

**Measured during testing:** 4 new questions averaged **~410 input + ~270 output tokens** and **~3.0 s** to answer. The DeepSeek balance stayed at $3.09 (cost below $0.01). Common questions are answered from static help with **zero tokens**.

## Safety filters

| Request | Handling |
|---|---|
| Dosing, treatment, diagnosis, result interpretation, "is BP 180/110 high?" | Declined locally, no AI call |
| Text with phone numbers, patient IDs (e.g. ABC200002), dates of birth, e-mails, "patient John Okello" | Not sent to AI; user is asked to rephrase without identifiers |
| Anything that slips through | DeepSeek system prompt also forbids medical advice (verified: it declined a borderline question) |

Logs record only page, role, token counts and timing, never the question text.

## For a hospital installation (future)

- **Offline:** set `AI_ENABLED=false`. The ? Help panel, quick tips, walkthrough and the full guide (`/vipers-assets/help.html`) all work without internet.
- **Own provider:** any OpenAI-compatible API works. Set `AI_URL`, `AI_MODEL`, and provide the key with `AI_API_KEY_FILE=/run/secrets/ai_key` (a root-only file mounted into the container) instead of `AI_GCP_SECRET`. Nothing is hard-coded to Motion Imprints' DeepSeek account.
- Help content lives in `edge/addons/public/help.json` and can be edited without rebuilding (mounted read-only into the container).

Free-text provider use now requires explicit AI_ALLOW_FREE_TEXT=true. Keep this off for real records pending privacy approval; filters are defence in depth. The unit AI suite opts in only against its fake provider.
