// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package engine

import (
	"fmt"
	"strings"
)

// ChainMatch is the result of a successful attack-sequence rule.
type ChainMatch struct {
	RuleID      string
	RuleName    string
	MADCode     string
	Description string
	MatchedTags []SecurityTag
}

// AttackRule defines an ordered tag sequence that, when observed in
// the behaviour graph within MaxSpan nodes, escalates a benign (M0)
// per-event verdict to a higher-risk MAD code.
type AttackRule struct {
	ID         string
	Name       string
	Sequence   []SecurityTag
	MaxSpan    int    // max nodes spanned (0 = entire graph)
	EscalateTo string // target M-code (M3/M4)
}

// defaultAttackRules are built-in attack-chain patterns. Each rule
// correlates individually benign tool actions into a higher-risk
// composite verdict.
var defaultAttackRules = []AttackRule{
	{
		ID:         "exfil-secret-http",
		Name:       "Secret read followed by external HTTP",
		Sequence:   []SecurityTag{TagSecretRead, TagExternalHTTP},
		MaxSpan:    5,
		EscalateTo: "M3.c",
	},
	{
		ID:         "exfil-db-http",
		Name:       "Database read followed by external HTTP",
		Sequence:   []SecurityTag{TagDatabaseRead, TagExternalHTTP},
		MaxSpan:    5,
		EscalateTo: "M3.c",
	},
	{
		ID:         "exfil-secret-db-http",
		Name:       "Secret + database read followed by external HTTP",
		Sequence:   []SecurityTag{TagSecretRead, TagDatabaseRead, TagExternalHTTP},
		MaxSpan:    8,
		EscalateTo: "M4.a",
	},
	{
		ID:         "exfil-file-http",
		Name:       "File read followed by external HTTP",
		Sequence:   []SecurityTag{TagFileRead, TagExternalHTTP},
		MaxSpan:    5,
		EscalateTo: "M3.c",
	},
	{
		ID:         "exfil-secret-email",
		Name:       "Secret read followed by email send",
		Sequence:   []SecurityTag{TagSecretRead, TagEmailSend},
		MaxSpan:    5,
		EscalateTo: "M3.c",
	},
	{
		ID:         "mcp-secret-exfil",
		Name:       "MCP tool secret access followed by external HTTP",
		Sequence:   []SecurityTag{TagMCPToolCall, TagSecretRead, TagExternalHTTP},
		MaxSpan:    8,
		EscalateTo: "M3.b",
	},
	{
		ID:         "privilege-db-write",
		Name:       "Secret read followed by database access",
		Sequence:   []SecurityTag{TagSecretRead, TagDatabaseRead},
		MaxSpan:    6,
		EscalateTo: "M3.d",
	},
}

// RuleEngine evaluates behaviour graphs against attack-sequence rules.
type RuleEngine struct {
	rules []AttackRule
}

// NewRuleEngine returns an engine with the built-in rule set.
func NewRuleEngine() *RuleEngine {
	return &RuleEngine{rules: defaultAttackRules}
}

// Evaluate runs all rules against the graph and returns the highest-
// severity match, or nil when no rule fires. currentMAD is the
// per-event classifier verdict; rules only escalate when the current
// tier is strictly lower than the rule's EscalateTo tier.
func (re *RuleEngine) Evaluate(g BehaviorGraph, currentMAD string) *ChainMatch {
	if re == nil || len(g.Nodes) == 0 {
		return nil
	}
	currentTier := madTier(currentMAD)
	var best *ChainMatch
	bestTier := currentTier

	for _, rule := range re.rules {
		if madTier(rule.EscalateTo) <= currentTier {
			continue // rule cannot improve on current verdict
		}
		if match := matchSequence(g, rule); match != nil {
			tier := madTier(match.MADCode)
			if tier > bestTier {
				best = match
				bestTier = tier
			}
		}
	}
	return best
}

// matchSequence checks whether rule.Sequence appears as an ordered
// subsequence across node tag sets within MaxSpan nodes.
func matchSequence(g BehaviorGraph, rule AttackRule) *ChainMatch {
	if len(rule.Sequence) == 0 || len(g.Nodes) == 0 {
		return nil
	}
	maxSpan := rule.MaxSpan
	if maxSpan <= 0 {
		maxSpan = len(g.Nodes)
	}

	// Try every start position; find the earliest completion within span.
	for start := 0; start < len(g.Nodes); start++ {
		end, ok := findSubsequence(g, rule.Sequence, start, maxSpan)
		if !ok {
			continue
		}
		return &ChainMatch{
			RuleID:      rule.ID,
			RuleName:    rule.Name,
			MADCode:     rule.EscalateTo,
			Description: fmt.Sprintf("attack chain %q matched nodes %d–%d", rule.Name, start, end),
			MatchedTags: append([]SecurityTag(nil), rule.Sequence...),
		}
	}
	return nil
}

// findSubsequence locates an ordered tag subsequence starting at
// startSeq, consuming at most maxSpan nodes (inclusive of start).
func findSubsequence(g BehaviorGraph, seq []SecurityTag, startSeq, maxSpan int) (endSeq int, ok bool) {
	need := 0
	lastMatched := startSeq - 1
	limit := startSeq + maxSpan - 1
	if limit >= len(g.Nodes) {
		limit = len(g.Nodes) - 1
	}

	for i := startSeq; i <= limit && need < len(seq); i++ {
		tags := nodeTagSet(&g, i)
		if tags == nil {
			continue
		}
		if _, has := tags[seq[need]]; has {
			lastMatched = i
			need++
		}
	}
	if need < len(seq) {
		return 0, false
	}
	return lastMatched, true
}

// madTier maps an M-code to a numeric severity for comparison.
// Unknown codes default to tier 0 (benign).
func madTier(code string) int {
	if code == "" {
		return 0
	}
	switch {
	case strings.HasPrefix(code, "M4"):
		return 4
	case strings.HasPrefix(code, "M3"):
		return 3
	case strings.HasPrefix(code, "M2"):
		return 2
	case strings.HasPrefix(code, "M0"):
		return 0
	default:
		return 0
	}
}

// applyChainEscalation upgrades verdict when a chain rule fires and
// the rule's tier exceeds the per-event classifier tier.
func applyChainEscalation(verdict *Verdict, match *ChainMatch) {
	if verdict == nil || match == nil {
		return
	}
	if madTier(match.MADCode) <= madTier(verdict.MADCode) {
		return
	}
	verdict.EscalatedFrom = verdict.MADCode
	verdict.MADCode = match.MADCode
	verdict.Classification = madCodeToClassification(match.MADCode)
	verdict.ChainRuleID = match.RuleID
	verdict.ChainRuleName = match.RuleName
	prefix := fmt.Sprintf("[attack-chain: %s] ", match.Description)
	if verdict.Reasoning != "" {
		verdict.Reasoning = prefix + verdict.Reasoning
	} else {
		verdict.Reasoning = strings.TrimSpace(prefix)
	}
}
