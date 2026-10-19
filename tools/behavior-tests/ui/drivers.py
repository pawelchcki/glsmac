"""Isolated original Wine/X11 and reproduction Chromium drivers."""

import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile

from original import EXECUTABLE_SHA256, EXECUTABLE_SIZE
from protocol import ProtocolError


ROOT = Path(__file__).resolve().parents[3]


def terminate(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def line_from(process, timeout=60):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(timeout):
            raise ProtocolError("UI driver timed out")
        line = process.stdout.readline()
    if not line:
        raise ProtocolError(f"UI driver exited with code {process.poll()}; inspect its log")
    return line


class OriginalDriver:
    def __init__(self, assets, wine, work):
        self.directory = tempfile.TemporaryDirectory(prefix="smac-ui-")
        self.work = Path(self.directory.name)
        self.log = open(work / "original-driver.log", "w")
        self.xserver = self.process = None
        self.display_pipe = None
        self.wine = Path(wine).resolve()
        self.server = self.wine.with_name("wineserver")
        executable = assets / "terranx.exe"
        if (executable.stat().st_size != EXECUTABLE_SIZE
                or hashlib.sha256(executable.read_bytes()).hexdigest() != EXECUTABLE_SHA256):
            self.close()
            raise ProtocolError("unsupported original executable fingerprint")
        try:
            # Private copies also isolate incidental game writes and saves.
            shutil.copytree(assets, self.work / "game")
            (self.work / "runtime").mkdir(mode=0o700)
            self.env = dict(os.environ, WINEPREFIX=str(self.work / "prefix"), WINEDEBUG="-all",
                            XDG_RUNTIME_DIR=str(self.work / "runtime"), WINEARCH="win64",
                            WINEDLLOVERRIDES="mscoree,mshtml=d;winemenubuilder.exe=d;winewayland.drv=d")
            read_fd, write_fd = os.pipe()
            try:
                self.xserver = subprocess.Popen(
                    ["Xvfb", "-displayfd", str(write_fd), "-noreset", "-screen", "0", "1024x768x24",
                     "-nolisten", "tcp", "-ac"], pass_fds=(write_fd,), stderr=self.log)
                os.close(write_fd)
                write_fd = None
                self.display_pipe = os.fdopen(read_fd, "r")
                read_fd = None
                with selectors.DefaultSelector() as selector:
                    selector.register(self.display_pipe, selectors.EVENT_READ)
                    if not selector.select(10):
                        raise ProtocolError("private Xvfb display did not start")
                display = self.display_pipe.readline().strip()
                if not display.isdecimal():
                    raise ProtocolError("private Xvfb display failed to initialize")
                self.env["DISPLAY"] = ":" + display
            finally:
                if read_fd is not None:
                    os.close(read_fd)
                if write_fd is not None:
                    os.close(write_fd)
            version = subprocess.check_output([str(self.wine), "--version"], env=self.env, text=True, timeout=10).strip()
            # Finish prefix creation before applying per-case time limits.
            # Killing wineboot halfway through leaves an unusable prefix.
            subprocess.run([str(self.wine), "wineboot", "--init"], env=self.env,
                           stdout=self.log, stderr=self.log, check=True, timeout=120)
            # Bind UI observations to their local asset dataset as well as EXE.
            digest = hashlib.sha256()
            for path in sorted((self.work / "game").rglob("*")):
                if path.is_file():
                    digest.update(path.relative_to(self.work / "game").as_posix().encode() + b"\0")
                    digest.update(hashlib.sha256(path.read_bytes()).digest())
            self.metadata = {"name": "smacx-original-ui", "kind": "original-executable",
                             "executable_sha256": EXECUTABLE_SHA256, "adapter_version": 1,
                             "engine": "wine-xvfb", "engine_version": version,
                             "assets_sha256": digest.hexdigest()}
        except BaseException:
            self.close()
            raise

    def reset(self):
        # Restart the game process, retaining only Wine's OS services. Shutting
        # the entire prefix down per case would repeatedly boot Windows.
        if self.process and self.process.poll() is None:
            self.process.kill()
            self.process.wait(timeout=5)
        (self.work / "game/Alpha Centauri.Ini").write_text(
            "[Alpha Centauri]\nDirectDraw=0\nds3d=0\neax=0\nDisableOpeningMovie=1\nVideo Mode=1024\n"
            "[PREFERENCES]\nForceOldVoxelAlgorithm=1\n")
        self.process = subprocess.Popen([str(self.wine), str(self.work / "game/terranx.exe")],
                                        cwd=self.work / "game", env=self.env,
                                        stdout=self.log, stderr=self.log)

    def snapshot(self, path):
        if self.process.poll() is not None:
            raise ProtocolError("original game exited; inspect original-driver.log")
        subprocess.run(["import", "-window", "root", str(path)], env=self.env,
                       check=True, timeout=10, stderr=self.log)

    def click(self, x, y):
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "1", "mousemove", "10", "10"],
                       env=self.env, check=True, timeout=10, stderr=self.log)

    def key(self, key):
        subprocess.run(["xdotool", "key", "--clearmodifiers", {"Escape": "Escape", "Enter": "Return",
                       "ArrowUp": "Up", "ArrowDown": "Down", "Home": "Home", "End": "End"}[key]],
                       env=self.env, check=True, timeout=10, stderr=self.log)

    def close(self):
        if hasattr(self, "env"):
            try:
                subprocess.run([str(self.server), "-k"], env=self.env, timeout=10,
                               stdout=self.log, stderr=self.log, check=False)
            except (OSError, subprocess.TimeoutExpired) as error:
                self.log.write(f"Wine cleanup: {error}\n")
        terminate(self.process)
        terminate(self.xserver)
        if self.display_pipe:
            self.display_pipe.close()
        self.log.close()
        self.directory.cleanup()


class BrowserDriver:
    def __init__(self, assets, build, work):
        self.server = self.process = None
        self.log = open(work / "browser-driver.log", "w")
        try:
            # Test current production scripts without relinking the cached engine.
            self.scripts = {path.relative_to(ROOT).as_posix(): path.read_text(encoding="utf-8")
                            for path in sorted((ROOT / "GLSMAC_data/default").rglob("*.gls.js"))}
            self.server = subprocess.Popen(["python3", "tools/serve-wasm.py", str(build), "--port", "0",
                                            "--assets", str(assets)], cwd=ROOT,
                                           stdout=subprocess.PIPE, stderr=self.log, text=True)
            import re
            match = re.search(r"http://127\.0\.0\.1:\d+", line_from(self.server))
            if not match:
                raise ProtocolError("asset server did not announce its address")
            self.origin = match[0]
            self.process = subprocess.Popen(["node", str(Path(__file__).with_name("browser.mjs"))],
                                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                            stderr=self.log, text=True, bufsize=1)
            self.metadata = {"name": "glsmac-browser-ui", "kind": "candidate", "target": "browser",
                             "scripts_sha256": hashlib.sha256(json.dumps(self.scripts, sort_keys=True).encode()).hexdigest(),
                             "loader_sha256": hashlib.sha256((build / "GLSMAC.js").read_bytes()).hexdigest(),
                             "runtime_sha256": hashlib.sha256((build / "GLSMAC.wasm").read_bytes()).hexdigest()}
        except BaseException:
            self.close()
            raise

    def send(self, **request):
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        response = json.loads(line_from(self.process))
        if response.get("ok") is not True:
            raise ProtocolError(response.get("error", "invalid browser response"))

    def reset(self):
        self.send(op="reset", origin=self.origin, scripts=self.scripts)

    def snapshot(self, path):
        self.send(op="snapshot", path=str(path))

    def click(self, x, y):
        self.send(op="click", x=x, y=y)

    def key(self, key):
        self.send(op="key", key=key)

    def close(self):
        if self.process:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                terminate(self.process)
        terminate(self.server)
        self.log.close()
