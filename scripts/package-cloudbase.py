"""Package explicit runtime files, with a Unix executable bootstrap."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--current-only", action="store_true", help="Build only the candidate, without requiring the historical v5 snapshot")
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
output = root / "deliverables" / "cloudbase"
output.mkdir(parents=True, exist_ok=True)
current = root / "cloudfunctions" / "api-proxy"
backup = root / "backups" / "cloudbase-v5-20260930"

for name, index in [
    ("worldcup-api-v6.1-complete.zip", current / "index.js"),
    ("worldcup-api-v5-rollback.zip", backup / "index.js"),
]:
    if args.current_only and index.parent == backup:
        continue
    destination = output / name
    with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
        filenames = ["index.js", "package.json", "scf_bootstrap"]
        if index.parent == current:
            filenames.extend(["hot-sources.js", "sports-service.js", "sports-payload.js", "sportradar.js", "beijing-time.js"])
        for filename in filenames:
            source = index if filename == "index.js" else current / filename
            data = source.read_bytes().replace(b"\r\n", b"\n")
            info = ZipInfo(filename)
            info.create_system = 3
            info.external_attr = (0o100755 if filename == "scf_bootstrap" else 0o100644) << 16
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, data)
    with ZipFile(destination) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(filenames)
        assert archive.getinfo("scf_bootstrap").external_attr >> 16 & 0o111
        assert archive.read("scf_bootstrap").startswith(b"#!/bin/bash\n")
    print(f"{destination}\nSHA256 {hashlib.sha256(destination.read_bytes()).hexdigest()}")
