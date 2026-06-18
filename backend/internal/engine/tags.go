// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package engine

import (
	"strings"

	pb "github.com/secureagentics/Adrian/backend/internal/proto"
)

// SecurityTag classifies the security-relevant behaviour of one
// classified event. Tags are derived deterministically from the
// paired event structure (tool names, pair type, I/O hints) and
// attached to AttackNodes for graph pattern matching.
type SecurityTag string

const (
	TagSecretRead   SecurityTag = "SecretRead"
	TagDatabaseRead SecurityTag = "DatabaseRead"
	TagExternalHTTP SecurityTag = "ExternalHTTP"
	TagMCPToolCall  SecurityTag = "MCPToolCall"
	TagFileRead     SecurityTag = "FileRead"
	TagFileWrite    SecurityTag = "FileWrite"
	TagEmailSend    SecurityTag = "EmailSend"
	TagLLMToolCall  SecurityTag = "LLMToolCall"
)

// extractSecurityTags derives security tags from a paired event.
// Multiple tags may apply to one event (e.g. an MCP tool that reads
// secrets). Tags are sorted lexicographically for stable matching.
func extractSecurityTags(ev *pb.PairedEvent) []SecurityTag {
	if ev == nil {
		return nil
	}
	var tags []SecurityTag
	seen := make(map[SecurityTag]struct{})

	add := func(t SecurityTag) {
		if _, ok := seen[t]; ok {
			return
		}
		seen[t] = struct{}{}
		tags = append(tags, t)
	}

	switch ev.PairType {
	case pb.PairType_PAIR_TYPE_LLM:
		llm := ev.GetLlm()
		if llm != nil && len(llm.ToolCalls) > 0 {
			add(TagLLMToolCall)
			for _, tc := range llm.ToolCalls {
				for _, t := range tagsFromToolName(tc.GetName()) {
					add(t)
				}
				for _, t := range tagsFromContent(tc.GetArgs()) {
					add(t)
				}
			}
		}
	case pb.PairType_PAIR_TYPE_TOOL:
		tool := ev.GetTool()
		if tool == nil {
			break
		}
		name := tool.GetToolName()
		for _, t := range tagsFromToolName(name) {
			add(t)
		}
		combined := tool.GetInput() + " " + tool.GetOutput()
		for _, t := range tagsFromContent(combined) {
			add(t)
		}
	}

	return tags
}

// tagsFromToolName maps a tool name (lowercased) to security tags.
func tagsFromToolName(name string) []SecurityTag {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return nil
	}
	var out []SecurityTag

	if containsAny(n, "mcp", "modelcontextprotocol") {
		out = append(out, TagMCPToolCall)
	}
	if containsAny(n,
		"secret", "credential", "password", "passwd", "api_key", "apikey",
		"token", "env_var", "getenv", "vault", "keychain", "ssm", "secretsmanager",
	) {
		out = append(out, TagSecretRead)
	}
	if containsAny(n,
		"sql", "database", "db_", "db-", "postgres", "mysql", "sqlite",
		"mongodb", "redis", "query", "execute_sql", "run_query",
	) {
		out = append(out, TagDatabaseRead)
	}
	if containsAny(n,
		"http", "fetch", "request", "curl", "webhook", "httpx", "urllib",
		"requests", "post", "get_url", "api_call", "rest",
	) {
		out = append(out, TagExternalHTTP)
	}
	if containsAny(n, "read_file", "file_read", "readfile", "cat_file", "load_file") {
		out = append(out, TagFileRead)
	}
	if containsAny(n, "write_file", "file_write", "writefile", "save_file", "create_file") {
		out = append(out, TagFileWrite)
	}
	if containsAny(n, "email", "smtp", "send_mail", "sendmail", "mailgun", "ses") {
		out = append(out, TagEmailSend)
	}
	return out
}

// tagsFromContent inspects tool args / I/O text for secondary signals.
func tagsFromContent(content string) []SecurityTag {
	c := strings.ToLower(content)
	if c == "" || strings.TrimSpace(c) == "" {
		return nil
	}
	var out []SecurityTag
	if containsAny(c,
		"password", "api_key", "apikey", "secret", "token", "credential",
		"aws_access", "private_key", "bearer ",
	) {
		out = append(out, TagSecretRead)
	}
	if containsAny(c, "http://", "https://") {
		out = append(out, TagExternalHTTP)
	}
	if containsAny(c, "select ", "insert ", "update ", "delete from") {
		out = append(out, TagDatabaseRead)
	}
	return out
}

func containsAny(s string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(s, n) {
			return true
		}
	}
	return false
}
