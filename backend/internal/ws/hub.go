// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package ws

import (
	"sync"

	"google.golang.org/protobuf/proto"

	pb "github.com/secureagentics/Adrian/backend/internal/proto"
)

// Hub is a process-local pub/sub keyed by session_id. The WS handler
// for each connected SDK registers a write channel; the REST review
// approve/reject path publishes a HITL-resolution Verdict frame to it.
//
// Single subscriber per session_id, re-Register replaces any prior
// channel (covers SDK reconnect during a hold). On disconnect the WS
// handler must call deregister to free the slot.
type Hub struct {
	mu   sync.Mutex
	subs map[string]chan []byte
}

// NewHub returns a fresh hub.
func NewHub() *Hub {
	return &Hub{subs: make(map[string]chan []byte)}
}

// Register adds a subscriber for sessionID and returns its write
// channel plus a deregister callback. The caller spawns a writer
// goroutine that drains the channel and calls conn.WriteMessage.
//
// If a prior subscriber exists for the same session_id, its channel
// is closed so its writer goroutine exits cleanly. (Concurrent
// connections under one session_id are not a normal case; an SDK
// reconnect during a hold is the realistic path.)
func (h *Hub) Register(sessionID string) (<-chan []byte, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if old, ok := h.subs[sessionID]; ok {
		close(old)
	}
	ch := make(chan []byte, 8)
	h.subs[sessionID] = ch

	deregister := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		// Only delete + close when the entry is still ours; a later
		// Register may have replaced it and already closed the prior
		// channel.
		if cur, ok := h.subs[sessionID]; ok && cur == ch {
			delete(h.subs, sessionID)
			close(ch)
		}
	}
	return ch, deregister
}

// Publish marshals and pushes a frame to the subscriber for sessionID.
// Returns true if delivered, false if no subscriber or the channel was
// full (dropped). REST callers log warn on false but still return 200
// to the dashboard, the hitl_queue row is the source of truth.
func (h *Hub) Publish(sessionID string, frame *pb.ServerFrame) bool {
	buf, err := proto.Marshal(frame)
	if err != nil {
		return false
	}
	h.mu.Lock()
	ch, ok := h.subs[sessionID]
	h.mu.Unlock()
	if !ok {
		return false
	}
	select {
	case ch <- buf:
		return true
	default:
		return false
	}
}
