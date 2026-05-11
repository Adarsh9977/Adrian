// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package ws

import (
	"github.com/secureagentics/Adrian/backend/internal/store"
)

// session is per-connection state. Created at WS upgrade time, populated
// from the LoginAck round-trip, consumed by the read loop.
type session struct {
	apiKey      *store.APIKey
	sessionID   string
	llmProvider string
	llmModel    string
	loggedIn    bool
}

// agentProfileID returns the bound agent_profile_id (or nil if the
// API key has none). Threaded into the events / verdicts inserts.
func (s *session) agentProfileID() *string {
	if s.apiKey == nil {
		return nil
	}
	return s.apiKey.AgentProfileID
}
