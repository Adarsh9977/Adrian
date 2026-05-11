// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package ws

import (
	"testing"

	"google.golang.org/protobuf/proto"

	pb "github.com/secureagentics/Adrian/backend/internal/proto"
)

func TestHubPublishDeliversToSubscriber(t *testing.T) {
	h := NewHub()
	ch, dereg := h.Register("sess-1")
	defer dereg()

	frame := &pb.ServerFrame{Frame: &pb.ServerFrame_Verdict{Verdict: &pb.Verdict{
		EventId: "ev-1", SessionId: "sess-1", MadCode: "M3",
	}}}
	if !h.Publish("sess-1", frame) {
		t.Fatal("expected Publish to return true")
	}
	got := <-ch
	var decoded pb.ServerFrame
	if err := proto.Unmarshal(got, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	v := decoded.GetVerdict()
	if v == nil || v.EventId != "ev-1" || v.MadCode != "M3" {
		t.Fatalf("unexpected frame: %+v", decoded.Frame)
	}
}

func TestHubPublishNoSubscriberReturnsFalse(t *testing.T) {
	h := NewHub()
	ok := h.Publish("ghost", &pb.ServerFrame{
		Frame: &pb.ServerFrame_Verdict{Verdict: &pb.Verdict{}},
	})
	if ok {
		t.Fatal("expected Publish to return false when no subscriber")
	}
}

func TestHubReRegisterClosesPriorChannel(t *testing.T) {
	h := NewHub()
	first, _ := h.Register("sess-x")

	// New register replaces the slot; the old channel must close so a
	// writer goroutine reading from it exits cleanly.
	second, dereg := h.Register("sess-x")
	defer dereg()

	if _, ok := <-first; ok {
		t.Fatal("expected first channel closed after re-Register")
	}

	if !h.Publish("sess-x", &pb.ServerFrame{
		Frame: &pb.ServerFrame_Verdict{Verdict: &pb.Verdict{EventId: "ev-y"}},
	}) {
		t.Fatal("Publish to second subscriber should succeed")
	}
	got := <-second
	if len(got) == 0 {
		t.Fatal("expected non-empty frame delivered to second subscriber")
	}
}

func TestHubDeregisterRemovesEntry(t *testing.T) {
	h := NewHub()
	_, dereg := h.Register("sess-d")
	dereg()
	if h.Publish("sess-d", &pb.ServerFrame{
		Frame: &pb.ServerFrame_Verdict{Verdict: &pb.Verdict{}},
	}) {
		t.Fatal("expected Publish to return false after dereg")
	}
}
