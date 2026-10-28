# Control-terminal helper: runs commands/scripts ON the VIPERS HOSPITAL cloud VM (never locally).
# Usage:
#   .\vm.ps1 cmd "docker ps"                 # run a shell command on the VM
#   .\vm.ps1 run .\scripts\01-install.sh     # copy a script to the VM and run it with sudo
#   .\vm.ps1 put <localfile> <remotepath>    # copy a file to the VM
#   .\vm.ps1 get <remotepath> <localfile>    # copy a file from the VM
param(
  [Parameter(Mandatory)][ValidateSet('cmd','run','put','get')][string]$Mode,
  [Parameter(Mandatory)][string]$Target,
  [string]$Extra = ''
)
$Project = if ($env:VIPERS_PROJECT) { $env:VIPERS_PROJECT } else { 'vipers-hospital-demo' }
$Zone    = if ($env:VIPERS_ZONE)    { $env:VIPERS_ZONE }    else { 'africa-south1-a' }
$Vm      = if ($env:VIPERS_VM)      { $env:VIPERS_VM }      else { 'vipers-hospital-vm' }
$common  = @("--project=$Project", "--zone=$Zone", '--tunnel-through-iap', '--quiet', '--strict-host-key-checking=no')
$noise   = 'python.exe|At C:|~~~|CategoryInfo|FullyQualified|gcloud.ps1|RemoteException|host key is not cached|no guarantee that the server|think it is\.|fingerprint is:|ssh-ed25519 255|If you trust this host|cache and carry on|If you want to carry on|without adding|the key to the cache|If you do not trust|abandon the|Store key in cache|compute\.\d+ \(port 22\)|FATAL ERROR: Remote side unexpectedly'

function Invoke-Gcloud([string[]]$a) { & gcloud @a 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -notmatch $noise } }

switch ($Mode) {
  'cmd' { Invoke-Gcloud (@('compute','ssh',$Vm) + $common + @("--command=$Target")) }
  'put' { Invoke-Gcloud (@('compute','scp') + $common + @($Target, "${Vm}:$Extra")) }
  'get' { Invoke-Gcloud (@('compute','scp') + $common + @("${Vm}:$Target", $Extra)) }
  'run' {
    $name = Split-Path $Target -Leaf
    Invoke-Gcloud (@('compute','scp') + $common + @($Target, "${Vm}:/tmp/$name")) | Out-Null
    Invoke-Gcloud (@('compute','ssh',$Vm) + $common + @("--command=sed -i -e 's/\r$//' -e '1s/^\xEF\xBB\xBF//' /tmp/$name && sudo bash /tmp/$name $Extra"))
  }
}
