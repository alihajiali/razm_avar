"""Check helper lookup and launch the packaged macOS app before uploading it."""

import os
from pathlib import Path
import plistlib
import signal
import subprocess
import tempfile
import time


apps = list(Path("dist").glob("mac*/*.app"))
assert len(apps) == 1, f"Expected one packaged app, found {apps}"
contents = apps[0] / "Contents"
info = plistlib.loads((contents / "Info.plist").read_bytes())
name = info["CFBundleName"]
for suffix in ("", " (GPU)", " (Renderer)", " (Plugin)"):
    helper = contents / "Frameworks" / f"{name} Helper{suffix}.app"
    assert helper.is_dir(), f"Electron cannot find helper: {helper}"

env = os.environ.copy()
env.pop("ELECTRON_RUN_AS_NODE", None)
with tempfile.TemporaryFile() as log:
    process = subprocess.Popen(
        [str(contents / "MacOS" / info["CFBundleExecutable"]), "--enable-logging=stderr"],
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 12
        renderer_started = False
        while time.monotonic() < deadline:
            if process.poll() is not None:
                log.seek(0)
                raise AssertionError(
                    f"Packaged app exited with {process.returncode}:\n"
                    + log.read().decode(errors="replace")
                )
            processes = subprocess.check_output(["ps", "-axo", "command"], text=True)
            renderer_started |= str(contents.resolve()) in processes and any(
                str(contents.resolve()) in line and "--type=renderer" in line
                for line in processes.splitlines()
            )
            time.sleep(0.5)
        assert renderer_started, "Packaged app did not start its renderer"
        print("PASS: packaged macOS app launches, starts its renderer and stays running")
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
