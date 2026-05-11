// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

// Package migrations embeds the SQL migration files for the Adrian
// backend. The same files are also COPYed into the adrian-setup
// bootstrap image (deploy/Dockerfile.setup), where setup.py applies
// them on first run. The backend re-applies them at startup so
// upgrades after `git pull` work without a manual step; every
// migration is idempotent (CREATE TABLE IF NOT EXISTS, INSERT OR
// IGNORE).
package migrations

import "embed"

//go:embed *.sql
var Files embed.FS
