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
        else: content += 'echo "$(basename "$0") $*" >> "$FIREWALL_TEST_LOG"\nif [[ "$2" = -C ]]; then if [[ "$3" = INPUT || "$3" = FORWARD || "$3" = DOCKER-USER ]]; then grep -qF "$(basename "$0") -w -I $3 1" "$FIREWALL_TEST_LOG"; else grep -qF "$(basename "$0") -w -A VIPERS-BOOT -p $5" "$FIREWALL_TEST_LOG"; fi; else exit 0; fi\n'
        (d/tool).write_text(content, newline='\n'); (d/tool).chmod(0o755)
    log = d/'calls'
    script = 'export PATH="$1:$PATH" FIREWALL_TEST_LOG="$2"; bash "$3" block'
    result = bash(script, d, log, ROOT/'scripts/trial-firewall.sh')
    assert result.returncode == 0, result.stderr
    calls = log.read_text()
    for tool in ['iptables', 'ip6tables']:
        for proto in ['tcp', 'udp']:
            assert f'{tool} -w -A VIPERS-BOOT -p {proto} -m multiport --dports 80,443 -j DROP' in calls
        # DOCKER-USER: Docker places its own FORWARD jumps above ours, so the hook must also live in DOCKER-USER
        for chain in ['INPUT', 'FORWARD', 'DOCKER-USER']:
            assert f'{tool} -w -I {chain} 1 -i eth0 -j VIPERS-BOOT' in calls
    print('PASS | quarantine covers IPv4/IPv6 INPUT/FORWARD/DOCKER-USER TCP and UDP using mocked tools')

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

# F09: a missing edge.env (fresh install) or a file without the key falls back to "false" instead of aborting
edge = (ROOT/'scripts/03-edge.sh').read_text().replace('\r', '')
lines = [l for l in edge.splitlines() if l.startswith(('FREE_TEXT=', '[ "$FREE_TEXT" = true ]', 'KEEP='))]
assert len(lines) == 3, lines
with tempfile.TemporaryDirectory(prefix='vipers-edge-') as tmp:
    env = Path(tmp)/'edge.env'
    code = 'set -euo pipefail; ' + '; '.join(l.replace('/opt/vipers/edge/edge.env', '"$1"') for l in lines) + '; echo "FT=$FREE_TEXT KEEP=$KEEP"'
    r = bash(code, env)                                           # file missing
    assert r.returncode == 0 and 'FT=false' in r.stdout, (r.stdout, r.stderr)
    env.write_text('DEMO_HOSTS=x\n', newline='\n')                  # file without the key
    r = bash(code, env); assert r.returncode == 0 and 'FT=false' in r.stdout, r.stderr
    env.write_text('AI_ALLOW_FREE_TEXT=true\nTRIAL_IMAGE=img-v2\n', newline='\n')   # existing choice and portal settings kept
    r = bash(code, env); assert 'FT=true' in r.stdout and 'TRIAL_IMAGE=img-v2' in r.stdout, r.stdout
print('PASS | edge.env regeneration: missing file/key -> free text off; existing choice and TRIAL_* settings preserved')

# F12: dated (default-named) backup pointers expire after 14 days; named pointers such as baseline are kept
backup = (ROOT/'scripts/backup.sh').read_text().replace('\r', '')
prune = next(l for l in backup.splitlines() if l.startswith('find $B -maxdepth 1 -type l'))
with tempfile.TemporaryDirectory(prefix='vipers-ret-') as tmp:
    b = Path(tmp)
    r = bash('cd "$1" && mkdir -p .versions/g1 .versions/g2 && ln -s .versions/g1 20261001-0100.current && ln -s .versions/g2 baseline.current'
             ' && touch -h -d "20 days ago" 20261001-0100.current baseline.current && B="$1" && ' + prune + ' && ls -A', b)
    assert r.returncode == 0, r.stderr
    assert '20261001-0100.current' not in r.stdout and 'baseline.current' in r.stdout, r.stdout
print('PASS | dated backup pointers expire after 14 days; named backups (baseline) are kept')

# F02: setup completion is committed to disk before readiness is published
fb = (ROOT/'scripts/tenant-firstboot.sh').read_text()
assert fb.index('touch $T/configured') < fb.index('install -m 644 $T/site.json $P') and 'sync\ninstall -m 644 $T/site.json $P' in fb.replace('\r', '')
print('PASS | first boot commits completion (configured + sync) before publishing readiness')

# --- 29 Oct deep review (D01-D03). Run in a throwaway container (docs/TESTING.md): the demo scripts below are executed
# for real and must find no /opt/vipers and no Docker if a refusal ever failed.
def tar_into(path):
    with tarfile.open(path, 'w:gz') as t:
        data = b'fictional'; item = tarfile.TarInfo('fixture'); item.size = len(data); t.addfile(item, io.BytesIO(data))
def fixture_backup(b, extra_listed=()):
    names = ['openmrs.sql.gz', 'crater.sql.gz', 'crater_atomfeed.sql.gz', 'bahmni-document-images.tgz', 'bahmni-patient-images.tgz',
             'bahmni-lab-results.tgz', 'bahmni-uploaded-files.tgz', 'crater-app-data.tgz', 'bahmni-clinical-forms.tgz', *extra_listed]
    for name in names:
        if name.endswith('.sql.gz'): (b/name).write_bytes(gzip.compress(b'-- fictional dump\n'))
        else: tar_into(b/name)
    (b/'CONTENTS').write_text('\n'.join(names + ['CONTENTS']) + '\n', newline='\n')
    (b/'MANIFEST').write_text(''.join(hashlib.sha256((b/n).read_bytes()).hexdigest() + '  ' + n + '\n' for n in names + ['CONTENTS']), newline='\n')

# D01: a demo job queued behind the production switch re-reads the marker after it gets the lock, and refuses
with tempfile.TemporaryDirectory(prefix='vipers-d01-') as tmp:
    d = Path(tmp); (d/'bin').mkdir()
    # fake flock: the production switch finishes (writes its marker) while this job is waiting for the lock
    (d/'bin'/'flock').write_text('#!/bin/bash\nprintf "production\\n" > "$VIPERS_PROFILE_FILE"\nexit 0\n', newline='\n'); (d/'bin'/'flock').chmod(0o755)
    for script in ['reset-demo.sh', '05-demo-accounts.sh', '06-crater.sh', '09-expiry.sh']:
        (d/'profile').write_text('demo\n', newline='\n')
        r = bash('export PATH="$1:$PATH" VIPERS_PROFILE_FILE="$2" VIPERS_OPS_LOCK="$3" VIPERS_EXPECTED_HOST="$(hostname)" EXPIRY="2099-01-01 00:00"; bash "$4"',
                 d/'bin', d/'profile', d/'lock', ROOT/'scripts'/script)
        assert r.returncode != 0 and 'refusing: production' in r.stdout, (script, r.stdout[-300:], r.stderr[-300:])
    # a caller that already holds the lock (the guard) is not made to wait for it again, and the check still applies
    (d/'bin'/'flock').write_text('#!/bin/bash\necho "flock must not be called" >&2; exit 99\n', newline='\n')
    (d/'profile').write_text('production\n', newline='\n')
    r = bash('export PATH="$1:$PATH" VIPERS_PROFILE_FILE="$2" VIPERS_OPS_LOCK_HELD=1 VIPERS_EXPECTED_HOST="$(hostname)"; bash "$3"',
             d/'bin', d/'profile', ROOT/'scripts/05-demo-accounts.sh')
    assert r.returncode != 0 and 'refusing: production' in r.stdout and 'must not' not in r.stderr, (r.stdout, r.stderr)
print('PASS | reset/demo accounts/demo billing/expiry check production AFTER the maintenance lock (a queued job refuses)')

# D02: the verified inventory is the only thing a restore can use
src = ROOT/'scripts/backup-verify.sh'
verify = 'source "$1"; verify_backup "$2"'
with tempfile.TemporaryDirectory(prefix='vipers-d02-') as tmp:
    b = Path(tmp)/'b'; b.mkdir(); fixture_backup(b)
    r = bash(verify, src, b); assert r.returncode == 0, ('valid backup refused', r.stderr)
    (b/'bahmni-forms.tgz').write_bytes(b'corrupt and not in the manifest')
    r = bash(verify, src, b); assert r.returncode != 0 and 'unlisted' in r.stderr, ('unlisted corrupt archive accepted', r.stderr)
    (b/'bahmni-forms.tgz').unlink(); tar_into(b/'bahmni-forms.tgz')
    r = bash(verify, src, b); assert r.returncode != 0 and 'unlisted' in r.stderr, ('unlisted valid archive accepted', r.stderr)
    (b/'bahmni-forms.tgz').unlink(); (b/'.hidden').write_text('x')
    r = bash(verify, src, b); assert r.returncode != 0, 'unlisted hidden file accepted'
    (b/'.hidden').unlink(); (b/'subdir').mkdir()
    r = bash(verify, src, b); assert r.returncode != 0, 'directory entry accepted'
with tempfile.TemporaryDirectory(prefix='vipers-d02-') as tmp:
    b = Path(tmp)/'b'; b.mkdir(); fixture_backup(b, extra_listed=['bahmni-forms.tgz'])
    r = bash(verify, src, b); assert r.returncode == 0, ('listed optional volume refused', r.stderr)
with tempfile.TemporaryDirectory(prefix='vipers-d02-') as tmp:
    b = Path(tmp)/'b'; b.mkdir(); fixture_backup(b, extra_listed=['openmrs-data.tgz'])
    r = bash(verify, src, b); assert r.returncode != 0 and 'unknown volume' in r.stderr, ('listed unknown volume accepted', r.stderr)
reset = (ROOT/'scripts/reset-demo.sh').read_text()
assert '"$D"/*.tgz' not in reset and 'for v in $RESTORE_VOLS' in reset and reset.index('RESTORE_VOLS=') < reset.index('vipers dc stop')
# the web proxies resolve the restarted services again after the restore (restore drill, 29 Oct)
assert reset.index('vipers dc restart proxy crater-nginx') > reset.index('vipers up >/dev/null')
print('PASS | restore uses only the verified inventory: unlisted (corrupt or valid) archives, stray entries and unknown volumes are refused')

# D03: mount sources are files before the first start (also replacing an empty directory Docker made earlier)
with tempfile.TemporaryDirectory(prefix='vipers-d03-') as tmp:
    d = Path(tmp); (d/'bin').mkdir(); br = d/'branding'
    (d/'bin'/'docker').write_text('#!/bin/bash\ncase "$*" in *bahmni/reports*) printf "openmrs.service.password=default\\nother=1\\n";; '
                                  '*crater-nginx*) printf "server {\\n  access_log /var/log/nginx/access.log;\\n}\\n";; *) exit 1;; esac\n', newline='\n')
    (d/'bin'/'docker').chmod(0o755)
    run = lambda: bash('export PATH="$1:$PATH" VIPERS_BRANDING="$2"; bash "$3"', d/'bin', br, ROOT/'scripts/stage-mounts.sh')
    tpl, conf = br/'bahmni-reports.properties.template', br/'crater-nginx.conf'
    tpl.mkdir(parents=True); conf.mkdir()                      # what Docker leaves after a start without the files
    r = run(); assert r.returncode == 0, (r.stdout, r.stderr)
    assert tpl.is_file() and 'openmrs.service.password=${REPORTS_SERVICE_PASSWORD}' in tpl.read_text()
    assert conf.is_file() and 'access_log /var/log/nginx/access.log vipers_noquery;' in conf.read_text()
    tpl.write_text(tpl.read_text() + '# operator edit\n'); r = run()
    assert r.returncode == 0 and '# operator edit' in tpl.read_text(), 'existing file not kept'
    conf.unlink(); conf.mkdir(); (conf/'x').write_text('x'); r = run()
    assert r.returncode != 0 and 'non-empty directory' in r.stdout, (r.stdout, r.stderr)
cfg, vip = (ROOT/'scripts/02-configure.sh').read_text(), (ROOT/'scripts/vipers.sh').read_text()
assert 'stage-mounts.sh' in cfg and 'crater-nginx.conf' in vip and 'bahmni-reports.properties.template' in vip
print('PASS | mount sources staged as files before the first start (empty Docker-made directory replaced, edits kept, wrong type refused); vipers up refuses without them')

# production switch uses the stale-visit start action this OpenMRS version has (acceptance run, 29 Oct)
pm = (ROOT/'scripts/production-mode.sh').read_text()
assert '"action":"STARTTASK"' not in pm and '"action":"SCHEDULETASK"' in pm and 'stale-visit task did not start' in pm
print('PASS | production switch starts the stale-visit task with SCHEDULETASK and verifies it runs')
