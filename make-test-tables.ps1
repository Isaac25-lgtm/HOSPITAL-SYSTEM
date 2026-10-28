# Build markdown tables from the acceptance-test JSON results (evidence\results\*.json) for TEST_RESULTS.md.
param([string]$Dir = (Join-Path $PSScriptRoot 'evidence\results'))
$titles = [ordered]@{
  'reception' = 'Registration (receptionist)'; 'doctor' = 'Consultation (doctor)'; 'lab' = 'Laboratory'
  'appointments-documents' = 'Appointments and patient documents'; 'billing' = 'Billing (cashier, Crater)'
  'admin' = 'Administration (demo administrator)'; 'walkthrough-session' = 'Walkthrough, logout and re-login'
  'help-ai' = 'Contextual help and Ask Vipers AI'; 'ux' = 'User experience (4 viewports)'; 'performance' = 'Performance'
  'mobile' = 'Phone (390 x 844, touch)'; 'security' = 'Security checks'
}
$total = 0; $passed = 0
foreach ($k in $titles.Keys) {
  $f = Join-Path $Dir "$k.json"; if (-not (Test-Path $f)) { continue }
  $rows = Get-Content $f -Raw | ConvertFrom-Json
  $p = @($rows | Where-Object { $_.pass }).Count; $total += $rows.Count; $passed += $p
  "### $($titles[$k]) - $p/$($rows.Count) passed`n"
  "| Check | Result | Notes |"; "|---|---|---|"
  foreach ($r in $rows) { "| $($r.step -replace '\|','/') | $(if ($r.pass) {'PASS'} else {'**FAIL**'}) | $(($r.note -replace '\|','/' -replace '\s+',' ').Trim()) |" }
  ""
}
"**Total: $passed / $total checks passed.**"
