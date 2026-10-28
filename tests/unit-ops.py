"""Local shell fault tests; never runs Docker, gcloud, iptables or live operations."""
from pathlib import Path
import gzip, hashlib, io, os, re, subprocess, tarfile, tempfile

ROOT = Path(__file__).resolve().parents[1]
BASH = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'
def bash(code, *args):
    def shellpath(p):
        return re.sub(r'^([A-Za-z]):', lambda m: '/' + m[1].lower(), str(p).replace('\\', '/'))
    return subprocess.run([BASH, '-c', code, 'test', *map(shellpath, args)], capture_output=True, text=True)

# Run the real check function in its real strict-shell context, with a simulated HTTP failure.
tenant = (ROOT / 'scripts/tenant-firstboot.sh').read_text()
need = next(line for line in tenant.splitlines() if line.startswith('need()'))
r = bash('set -Eeuo pipefail; trap "exit 91" ERR; ' + need + '; printf 403 | need policy; echo UNSAFE')
assert r.returncode != 0 and 'UNSAFE' not in r.stdout
print('PASS | failed setup pipeline aborts parent')

# Exercise firewall command construction using fake tools; no host firewall is touched.
with tempfile.TemporaryDirectory(prefix='vipers-firewall-') as tmp:
    d = Path(tmp)
    for tool in ['ip', 'iptables', 'ip6tables']:
        content = '#!/bin/bash\n'
        if tool == 'ip': content += 'echo "default via 10.0.0.1 dev eth0"\n'
        else: content += 'echo "$(basename "$0") $*" >> "$FIREWALL_TEST_LOG"\nif [[ "$2" = -C ]]; then if [[ "$3" = INPUT || "$3" = FORWARD ]]; then grep -qF "$(basename "$0") -w -I $3 1" "$FIREWALL_TEST_LOG"; else grep -qF "$(basename "$0") -w -A VIPERS-BOOT -p $5" "$FIREWALL_TEST_LOG"; fi; else exit 0; fi\n'
        (d/tool).write_text(content, newline='\n'); (d/tool).chmod(0o755)
    log = d/'calls'
    script = 'export PATH="$1:$PATH" FIREWALL_TEST_LOG="$2"; bash "$3" block'
    result = bash(script, d, log, ROOT/'scripts/trial-firewall.sh')
    assert result.returncode == 0, result.stderr
    calls = log.read_text()
    for tool in ['iptables', 'ip6tables']:
        for proto in ['tcp', 'udp']:
            assert f'{tool} -w -A VIPERS-BOOT -p {proto} -m multiport --dports 80,443 -j DROP' in calls
        for chain in ['INPUT', 'FORWARD']:
            assert f'{tool} -w -I {chain} 1 -i eth0 -j VIPERS-BOOT' in calls
    print('PASS | quarantine covers IPv4/IPv6 INPUT/FORWARD TCP and UDP using mocked tools')

with tempfile.TemporaryDirectory(prefix='vipers-ops-') as tmp:
    d = Path(tmp)
    names = ['openmrs.sql.gz', 'crater.sql.gz', 'crater_atomfeed.sql.gz', 'bahmni-document-images.tgz', 'bahmni-patient-images.tgz', 'bahmni-lab-results.tgz', 'bahmni-uploaded-files.tgz', 'crater-app-data.tgz', 'bahmni-clinical-forms.tgz']
    for name in names:
        if name.endswith('.sql.gz'):
            (d / name).write_bytes(gzip.compress(b'-- complete test dump\n'))
        else:
            with tarfile.open(d / name, 'w:gz') as t:
                data = b'fictional document'; item = tarfile.TarInfo('example'); item.size = len(data); t.addfile(item, io.BytesIO(data))
    (d / 'CONTENTS').write_text('\n'.join(names + ['CONTENTS']) + '\n', newline='\n')
    (d / 'MANIFEST').write_text(''.join(hashlib.sha256((d/n).read_bytes()).hexdigest() + '  ' + n + '\n' for n in names + ['CONTENTS']), newline='\n')
    def verify():
        r = bash('source "$1"; verify_backup "$2"', ROOT/'scripts/backup-verify.sh', d)
        return r.returncode
    assert verify() == 0
    for name in names + ['MANIFEST', 'CONTENTS']:
        file = d / name; content = file.read_bytes(); file.unlink()
        assert verify() != 0, name
        file.write_bytes(content)
    (d/'openmrs.sql.gz').write_bytes(gzip.compress(b'changed but still valid gzip'))
    assert verify() != 0
    print('PASS | complete backup accepted; every missing component and changed dump rejected')

# Execute real auth helper with a mock curl; distinguish rejection from broken transport/server.
auth = (ROOT/'scripts/auth-check.sh').as_posix()
for status, body, transport, expected in [('200','{"authenticated":true}',0,0), ('200','{"authenticated":false}',0,1), ('401','{}',0,1), ('500','{}',0,2), ('000','',7,2), ('200','not-json',0,2)]:
    import json
    # jq may not be installed on the workstation. Backups above use native Git tools only.
    if bash('command -v jq').returncode != 0:
        print('SKIP | auth HTTP outcome runtime cases: jq unavailable locally'); break
    script = 'source "$1"; curl() { while [[ "$1" != -o ]]; do shift; done; printf "%s" "$3" > "$2"; printf "%s" "$4"; return "$5"; };'
    # Use a separate wrapper below so mock parameters cannot be confused with curl options.
    script = 'source "$1"; mock_body=$2; mock_status=$3; mock_rc=$4; curl() { while [[ "$1" != -o ]]; do shift; done; printf "%s" "$mock_body" > "$2"; printf "%s" "$mock_status"; return "$mock_rc"; }; omrs_auth u p http://fake'
    assert bash(script, auth, body, status, transport).returncode == expected
else:
    print('PASS | explicit authentication rejection distinguished from server/transport/malformed responses')

for file in (ROOT/'scripts').glob('*.sh'):
    r = subprocess.run([BASH, '-n'], input=file.read_text().replace('\r',''), text=True, capture_output=True)
    assert r.returncode == 0, (file.name, r.stderr)
print('PASS | all shell files parse')
