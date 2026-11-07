#!/usr/bin/env python3
"""Stare piksel-ikone su zamijenjene. Pokreće node scripts/make-icons.mjs."""
import subprocess
import sys

raise SystemExit(subprocess.call(["node", "scripts/make-icons.mjs"]))
