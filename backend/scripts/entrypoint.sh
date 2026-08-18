#!/bin/bash
set -e

# Self-heal ownership on the static dir every start — covers fresh volumes,
# restored backups, and new servers so no manual chown step is ever needed.
mkdir -p static/logos static/samples static/boms static/receipts static/lab_dips snapshots
chown -R appuser:appgroup static snapshots

exec gosu appuser "$@"
