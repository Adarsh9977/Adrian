// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package engine

import "time"

// EdgeType describes the relationship between two AttackNodes.
type EdgeType string

const (
	// EdgeSequential links the immediately prior node to the current
	// one in temporal order within the same (session, invocation,
	// agent_id) scope.
	EdgeSequential EdgeType = "sequential"
)

// AttackNode is one classified action in the behaviour graph, keyed
// by the parent window Key plus the event's event_id.
type AttackNode struct {
	EventID     string
	SessionID   string
	InvocationID string
	AgentID     string
	MADCode     string
	Tags        []SecurityTag
	Timestamp   time.Time
	// Seq is the monotonic index within this graph (0-based).
	Seq int
}

// AttackEdge links two nodes in the behaviour graph.
type AttackEdge struct {
	FromSeq int
	ToSeq   int
	Type    EdgeType
}

// BehaviorGraph holds the attack-chain state for one window key.
// Nodes and edges are trimmed together with the sliding-window
// history buffer so graph depth matches DefaultWindowSize.
type BehaviorGraph struct {
	Nodes []AttackNode
	Edges []AttackEdge
}

// AddNode appends a node and, when a prior node exists, a sequential
// edge from the previous node. Returns the new node's sequence index.
func (g *BehaviorGraph) AddNode(n AttackNode) int {
	if g == nil {
		return -1
	}
	n.Seq = len(g.Nodes)
	g.Nodes = append(g.Nodes, n)
	if n.Seq > 0 {
		g.Edges = append(g.Edges, AttackEdge{
			FromSeq: n.Seq - 1,
			ToSeq:   n.Seq,
			Type:    EdgeSequential,
		})
	}
	return n.Seq
}

// Trim retains only the last maxNodes nodes and rewrites edge indices
// so they remain valid. Edges whose endpoints fall outside the retained
// window are dropped.
func (g *BehaviorGraph) Trim(maxNodes int) {
	if g == nil || maxNodes <= 0 || len(g.Nodes) <= maxNodes {
		return
	}
	over := len(g.Nodes) - maxNodes
	g.Nodes = g.Nodes[over:]
	for i := range g.Nodes {
		g.Nodes[i].Seq = i
	}

	// Rebuild edges for the retained suffix.
	g.Edges = g.Edges[:0]
	for i := 1; i < len(g.Nodes); i++ {
		g.Edges = append(g.Edges, AttackEdge{
			FromSeq: i - 1,
			ToSeq:   i,
			Type:    EdgeSequential,
		})
	}
}

// Snapshot returns a deep copy of the graph for rule evaluation
// without holding the window lock longer than necessary.
func (g *BehaviorGraph) Snapshot() BehaviorGraph {
	if g == nil {
		return BehaviorGraph{}
	}
	out := BehaviorGraph{
		Nodes: make([]AttackNode, len(g.Nodes)),
		Edges: make([]AttackEdge, len(g.Edges)),
	}
	copy(out.Nodes, g.Nodes)
	copy(out.Edges, g.Edges)
	for i := range out.Nodes {
		if len(g.Nodes[i].Tags) > 0 {
			out.Nodes[i].Tags = append([]SecurityTag(nil), g.Nodes[i].Tags...)
		}
	}
	return out
}

// nodeTags returns the tag set of the node at seq as a map.
func nodeTagSet(g *BehaviorGraph, seq int) map[SecurityTag]struct{} {
	if g == nil || seq < 0 || seq >= len(g.Nodes) {
		return nil
	}
	set := make(map[SecurityTag]struct{}, len(g.Nodes[seq].Tags))
	for _, t := range g.Nodes[seq].Tags {
		set[t] = struct{}{}
	}
	return set
}
