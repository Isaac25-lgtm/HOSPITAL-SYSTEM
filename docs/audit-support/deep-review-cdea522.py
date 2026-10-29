"""Defect reproducer, not a release gate: zero means the documented defects were observed.
Uses disposable fixtures and real source fragments; no Docker, cloud, databases or host operations.
"""
from pathlib import Path
import gzip, hashlib, io, os, re, subprocess, tarfile, tempfile

ROOT = Path(__file__).resolve().parents[2]
BASH = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'

def shellpath(p):
    return re.sub(r'^([A-Za-z]):', lambda m: '/' + m[1].lower(), str(p).replace('\\', '/'))

def bash(code, *args):
    return subprocess.run([BASH, '-c', code, 'fixture', *map(shellpath, args)], capture_output=True, text=True)

scratch = ROOT / '.audit-tmp'
scratch.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='deep-review-', dir=scratch) as tmp:
    d = Path(tmp)
    backup = d / 'backup'; backup.mkdir()
    names = ['openmrs.sql.gz', 'crater.sql.gz', 'crater_atomfeed.sql.gz',
             'bahmni-document-images.tgz', 'bahmni-patient-images.tgz', 'bahmni-lab-results.tgz',
             'bahmni-uploaded-files.tgz', 'crater-app-data.tgz', 'bahmni-clinical-forms.tgz']
    for name in names:
        if name.endswith('.sql.gz'):
            (backup / name).write_bytes(gzip.compress(b'-- fictional complete dump\n'))
        else:
            with tarfile.open(backup / name, 'w:gz') as archive:
                content = b'fictional'; item = tarfile.TarInfo('fixture'); item.size = len(content)
                archive.addfile(item, io.BytesIO(content))
    (backup/'CONTENTS').write_text('\n'.join(names+['CONTENTS'])+'\n', newline='\n')
    (backup/'MANIFEST').write_text(''.join(hashlib.sha256((backup/n).read_bytes()).hexdigest()+'  '+n+'\n' for n in names+['CONTENTS']), newline='\n')
    verify = 'source "$1"; verify_backup "$2"'
    result = bash(verify, ROOT/'scripts/backup-verify.sh', backup)
    assert result.returncode == 0, (result.stdout, result.stderr)
    (backup/'bahmni-forms.tgz').write_bytes(b'not a valid archive and not in the manifest')
    result = bash(verify, ROOT/'scripts/backup-verify.sh', backup)
    assert result.returncode == 0, (result.stdout, result.stderr)
    # Execute only the real loop's selection, never its Docker extraction/destruction command.
    reset = (ROOT/'scripts/reset-demo.sh').read_text()
    selector = next(line for line in reset.splitlines() if line.startswith('for f in '))
    result = bash('D=$1; '+selector+' printf "%s\\n" "$f"; done', backup)
    assert result.returncode == 0 and 'bahmni-forms.tgz' in result.stdout, (result.stdout, result.stderr)
    print('REPRODUCED: verifier accepts an unmanifested corrupt archive that the restore loop selects')

    # Simulate the blocking flock returning only after the production switch wrote its marker.
    # This uses the actual profile-check/lock lines in their actual source order.
    profile = d/'profile'; profile.write_text('demo\n', newline='\n')
    profile_line = next(line for line in reset.splitlines() if line.startswith('[ "$(cat '))
    lock_line = next(line for line in reset.splitlines() if line.startswith('exec 9>'))
    lock_line = lock_line.replace('/run/vipers-ops.lock', '"$2"')
    code = ('set -euo pipefail; export VIPERS_PROFILE_FILE=$1; '
            'flock() { printf "production\\n" > "$VIPERS_PROFILE_FILE"; return 0; }; '
            + profile_line + '\n' + lock_line + '\n'
            + 'printf "RESTORE_CONTINUES_WITH_PROFILE="; cat "$VIPERS_PROFILE_FILE"')
    result = bash(code, profile, d/'lock')
    assert result.returncode == 0 and 'RESTORE_CONTINUES_WITH_PROFILE=production' in result.stdout, (result.stdout, result.stderr)
    print('REPRODUCED: reset passes its profile check, waits, then continues after production activation')
