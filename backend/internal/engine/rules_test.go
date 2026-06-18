// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package engine

import "testing"

func TestMadTier(t *testing.T) {
	cases := map[string]int{
		"M0": 0, "M0.a": 0,
		"M2": 2, "M2.a": 2,
		"M3": 3, "M3.c": 3,
		"M4": 4, "M4.a": 4,
		"": 0, "bogus": 0,
	}
	for code, want := range cases {
		if got := madTier(code); got != want {
			t.Errorf("madTier(%q) = %d, want %d", code, got, want)
		}
	}
}

func TestMatchSequenceSecretHTTP(t *testing.T) {
	re := NewRuleEngine()
	var g BehaviorGraph
	g.AddNode(AttackNode{Tags: []SecurityTag{TagSecretRead}})
	g.AddNode(AttackNode{Tags: []SecurityTag{TagExternalHTTP}})

	match := re.Evaluate(g, "M0")
	if match == nil {
		t.Fatal("expected match")
	}
	if match.MADCode != "M3.c" {
		t.Errorf("MADCode = %q, want M3.c", match.MADCode)
	}
	if match.RuleID != "exfil-secret-http" {
		t.Errorf("RuleID = %q, want exfil-secret-http", match.RuleID)
	}
}

func TestMatchSequenceNoEscalateWhenAlreadyM3(t *testing.T) {
	re := NewRuleEngine()
	var g BehaviorGraph
	g.AddNode(AttackNode{Tags: []SecurityTag{TagSecretRead}})
	g.AddNode(AttackNode{Tags: []SecurityTag{TagExternalHTTP}})

	match := re.Evaluate(g, "M3.f")
	if match != nil {
		t.Errorf("should not escalate when already M3, got %+v", match)
	}
}

func TestMatchSequenceTripleChain(t *testing.T) {
	re := NewRuleEngine()
	var g BehaviorGraph
	g.AddNode(AttackNode{Tags: []SecurityTag{TagSecretRead}})
	g.AddNode(AttackNode{Tags: nil}) // benign intermediate
	g.AddNode(AttackNode{Tags: []SecurityTag{TagDatabaseRead}})
	g.AddNode(AttackNode{Tags: []SecurityTag{TagExternalHTTP}})

	match := re.Evaluate(g, "M0")
	if match == nil {
		t.Fatal("expected triple-chain match")
	}
	if match.MADCode != "M4.a" {
		t.Errorf("MADCode = %q, want M4.a", match.MADCode)
	}
}

func TestMatchSequenceRespectsMaxSpan(t *testing.T) {
	re := NewRuleEngine()
	var g BehaviorGraph
	g.AddNode(AttackNode{Tags: []SecurityTag{TagSecretRead}})
	for i := 0; i < 10; i++ {
		g.AddNode(AttackNode{Tags: nil})
	}
	g.AddNode(AttackNode{Tags: []SecurityTag{TagExternalHTTP}})

	match := re.Evaluate(g, "M0")
	if match != nil {
		t.Errorf("secret and http too far apart; got match %+v", match)
	}
}

func TestApplyChainEscalation(t *testing.T) {
	v := &Verdict{MADCode: "M0", Classification: "benign", Reasoning: "model said M0"}
	match := &ChainMatch{
		RuleID:      "exfil-secret-http",
		RuleName:    "Secret read followed by external HTTP",
		MADCode:     "M3.c",
		Description: "attack chain matched",
	}
	applyChainEscalation(v, match)
	if v.MADCode != "M3.c" {
		t.Errorf("MADCode = %q, want M3.c", v.MADCode)
	}
	if v.EscalatedFrom != "M0" {
		t.Errorf("EscalatedFrom = %q, want M0", v.EscalatedFrom)
	}
	if v.Classification != "block" {
		t.Errorf("Classification = %q, want block", v.Classification)
	}
	if v.ChainRuleID != "exfil-secret-http" {
		t.Errorf("ChainRuleID = %q", v.ChainRuleID)
	}
}

func TestApplyChainEscalationNoDowngrade(t *testing.T) {
	v := &Verdict{MADCode: "M4.e", Classification: "block"}
	match := &ChainMatch{MADCode: "M3.c", Description: "test"}
	applyChainEscalation(v, match)
	if v.MADCode != "M4.e" {
		t.Errorf("should not downgrade M4.e to M3.c, got %q", v.MADCode)
	}
}
