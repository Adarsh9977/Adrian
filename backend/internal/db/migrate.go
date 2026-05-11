// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

// applyMigrations walks fsys for `*.sql` files and execs each one in
// lexical order. Migrations are idempotent (CREATE TABLE IF NOT EXISTS
// + INSERT OR IGNORE), so re-running on a populated database is a
// no-op. Returns the list of files applied.
func applyMigrations(db *sql.DB, fsys fs.FS) ([]string, error) {
	var names []string
	err := fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".sql") {
			return nil
		}
		names = append(names, path)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(names)

	for _, name := range names {
		body, err := fs.ReadFile(fsys, name)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			return nil, fmt.Errorf("exec %s: %w", name, err)
		}
	}
	return names, nil
}
