# VIPERS HOSPITAL - manage the cloud demo from this Windows PC (no local installs; uses gcloud).
#
#   .\vipers.ps1 status          # VM state, containers, memory/disk, HTTP checks
#   .\vipers.ps1 logs [service]  # last 200 log lines (e.g. openmrs, crater-php, caddy, vipers-addons)
#   .\vipers.ps1 restart [svc]   # restart one service, or the whole application
#   .\vipers.ps1 stop-app        # stop the application containers (VM keeps running)
#   .\vipers.ps1 start-app       # start the application containers
#   .\vipers.ps1 vm-stop         # stop the VM: compute charges stop (disk + IP still billed)
#   .\vipers.ps1 vm-start        # start the VM: the app comes back by itself in ~5 minutes
#   .\vipers.ps1 backup          # make a dated database + documents backup on the VM
#   .\vipers.ps1 reset-demo      # restore the clean demo dataset (baseline backup)
#   .\vipers.ps1 ssh             # open a shell on the VM
param([Parameter(Position = 0)][string]$Action = 'status', [Parameter(Position = 1)][string]$Arg = '')

$P = 'vipers-hospital-demo'; $Z = 'africa-south1-a'; $VM = 'vipers-hospital-vm'
$vmScript = Join-Path $PSScriptRoot 'vm.ps1'
function Remote([string]$cmd) { & $vmScript cmd $cmd }

switch ($Action) {
  'status'    { "VM: " + (gcloud compute instances describe $VM --project=$P --zone=$Z --format='value(status)' 2>$null)
                Remote "sudo vipers health 2>/dev/null | grep -v obsolete" }
  'logs'      { Remote "cd /opt/vipers/bahmni-docker/bahmni-lite && sudo vipers dc logs --tail=200 $Arg 2>/dev/null" }
  'restart'   { Remote "sudo vipers restart $Arg 2>&1 | grep -v obsolete" }
  'stop-app'  { Remote "sudo vipers down 2>&1 | grep -v obsolete" }
  'start-app' { Remote "sudo vipers up 2>&1 | grep -v obsolete | tail -3" }
  'vm-stop'   { gcloud compute instances stop $VM --project=$P --zone=$Z }
  'vm-start'  { gcloud compute instances start $VM --project=$P --zone=$Z; 'The application needs about 5 minutes to finish starting.' }
  'backup'    { Remote "sudo bash /opt/vipers/scripts/backup.sh 2>&1 | tail -3" }
  'reset-demo'{ $c = Read-Host 'This replaces ALL current demo data with the clean baseline. Type RESET to continue'
                if ($c -eq 'RESET') { Remote "sudo bash /opt/vipers/scripts/reset-demo.sh baseline" } else { 'Cancelled.' } }
  'ssh'       { gcloud compute ssh $VM --project=$P --zone=$Z --tunnel-through-iap }
  default     { Get-Content $PSCommandPath -TotalCount 14 | Select-Object -Skip 1 }
}
