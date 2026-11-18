#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
uv venv --clear .venv-fixtures --python 3.13
uv pip install --python .venv-fixtures/bin/python -r tools/fixture-requirements.txt
uv run --no-project --python .venv-fixtures/bin/python tools/export_fixtures.py
