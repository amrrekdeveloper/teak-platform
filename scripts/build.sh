#!/bin/bash
set -e
npm run build
# Building must not push, copy, or destructively reconcile a database.
# Required additive migrations run at application startup.
