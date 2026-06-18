// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package engine

import (
	"testing"
	"time"
)

func TestBehaviorGraphAddAndTrim(t *testing.T) {
	var g BehaviorGraph
	g.AddNode(AttackNode{EventID: "a", Tags: []SecurityTag{TagSecretRead}})
	g.AddNode(AttackNode{EventID: "b", Tags: []SecurityTag{TagExternalHTTP}})

	if len(g.Nodes) != 2 {
		t.Fatalf("nodes = %d, want 2", len(g.Nodes))
	}
	if len(g.Edges) != 1 || g.Edges[0].FromSeq != 0 || g.Edges[0].ToSeq != 1 {
		t.Errorf("edges = %+v, want one sequential 0->1", g.Edges)
	}

	for i := 0; i < 5; i++ {
		g.AddNode(AttackNode{EventID: "x"})
	}
	g.Trim(4)
	if len(g.Nodes) != 4 {
		t.Errorf("after trim nodes = %d, want 4", len(g.Nodes))
	}
	if g.Nodes[0].Seq != 0 || g.Nodes[3].Seq != 3 {
		t.Errorf("seq not rewritten: %+v", g.Nodes)
	}
	if len(g.Edges) != 3 {
		t.Errorf("edges after trim = %d, want 3", len(g.Edges))
	}
}

func TestBehaviorGraphSnapshot(t *testing.T) {
	var g BehaviorGraph
	g.AddNode(AttackNode{EventID: "a", Tags: []SecurityTag{TagSecretRead}})
	snap := g.Snapshot()
	snap.Nodes[0].Tags[0] = TagDatabaseRead
	if g.Nodes[0].Tags[0] != TagSecretRead {
		t.Error("snapshot must not alias node tags")
	}
}

func TestWindowRecordNodeAndEvaluate(t *testing.T) {
	w := NewSlidingWindow(WindowOpts{Size: 8, TTL: time.Hour})
	k := Key{SessionID: "s", InvocationID: "i", AgentID: "a"}
	h := w.Acquire(k)
	defer h.Release()

	h.RecordNode(k, "ev-1", "M0", []SecurityTag{TagSecretRead})
	h.RecordNode(k, "ev-2", "M0", []SecurityTag{TagExternalHTTP})

	match := h.EvaluateChain("M0")
	if match == nil {
		t.Fatal("expected chain match for secret->http")
	}
	if match.MADCode != "M3.c" {
		t.Errorf("MADCode = %q, want M3.c", match.MADCode)
	}
}
