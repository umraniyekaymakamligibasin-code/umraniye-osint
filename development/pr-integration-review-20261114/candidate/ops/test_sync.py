import importlib.util,pathlib,tempfile,subprocess
spec=importlib.util.spec_from_file_location('sync',pathlib.Path(__file__).with_name('github_sync.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
    root=pathlib.Path(d)/'source';root.mkdir();m.ROOTS={'app':str(root)}
    (root/'ok.py').write_text('print(1)')
    (root/'.env').write_text('TOKEN=never-export')
    (root/'data.sqlite').write_bytes(b'private')
    (root/'venv').mkdir();(root/'venv'/'bad.py').write_text('private')
    (root/'alias.py').symlink_to(root/'.env')
    assert set(m.snapshot())=={'app/ok.py'}
    (root/'bad.py').write_text('-----BEGIN '+'OPENSSH PRIVATE KEY-----')
    try:m.snapshot();raise AssertionError('Secret accepted')
    except RuntimeError:pass
    (root/'bad.py').unlink()
    origin=pathlib.Path(d)/'remote.git'
    subprocess.run(['git','init','--bare','--initial-branch=main',str(origin)],check=True,capture_output=True)
    m.REPO=pathlib.Path(d)/'repo';m.BASE=pathlib.Path(d)
    subprocess.run(['git','clone',str(origin),str(m.REPO)],check=True,capture_output=True)
    m.run('git','config','user.name','Test');m.run('git','config','user.email','test@example.invalid')
    (m.REPO/'README.md').write_text('preserve')
    m.run('git','add','.');m.run('git','commit','-m','seed');m.run('git','push','origin','main')
    m.sync(m.snapshot());assert (m.REPO/'app/ok.py').exists()
    (root/'ok.py').unlink();(root/'next.py').write_text('print(2)')
    m.sync(m.snapshot());assert not (m.REPO/'app/ok.py').exists()
    assert (m.REPO/'README.md').read_text()=='preserve'
    assert m.run('git','rev-parse','HEAD')==m.run('git','rev-parse','origin/main')
print('PASS: source exclusions, symlinks, secret blocking, commits, deletions, push, unrelated file preservation')
