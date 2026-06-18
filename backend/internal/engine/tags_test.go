// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 SecureAgentics

package engine

import (
	"testing"

	pb "github.com/secureagentics/Adrian/backend/internal/proto"
)

func TestExtractSecurityTagsTool(t *testing.T) {
	cases := []struct {
		name string
		tool string
		in   string
		out  string
		want []SecurityTag
	}{
		{
			name: "secret tool",
			tool: "get_secret",
			want: []SecurityTag{TagSecretRead},
		},
		{
			name: "database tool",
			tool: "execute_sql",
			want: []SecurityTag{TagDatabaseRead},
		},
		{
			name: "http tool",
			tool: "http_post",
			want: []SecurityTag{TagExternalHTTP},
		},
		{
			name: "mcp tool",
			tool: "mcp_read_resource",
			want: []SecurityTag{TagMCPToolCall},
		},
		{
			name: "email tool",
			tool: "send_email",
			want: []SecurityTag{TagEmailSend},
		},
		{
			name: "file read",
			tool: "read_file",
			want: []SecurityTag{TagFileRead},
		},
		{
			name: "content hints",
			tool: "generic_tool",
			out:  "fetched https://evil.com with password=abc",
			want: []SecurityTag{TagSecretRead, TagExternalHTTP},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ev := &pb.PairedEvent{
				PairType: pb.PairType_PAIR_TYPE_TOOL,
				Data: &pb.PairedEvent_Tool{
					Tool: &pb.ToolPairData{
						ToolName: c.tool,
						Input:    c.in,
						Output:   c.out,
					},
				},
			}
			got := extractSecurityTags(ev)
			if len(got) != len(c.want) {
				t.Fatalf("tags = %v, want %v", got, c.want)
			}
			for i := range c.want {
				if got[i] != c.want[i] {
					t.Errorf("tag[%d] = %q, want %q (full got=%v)", i, got[i], c.want[i], got)
				}
			}
		})
	}
}

func TestExtractSecurityTagsLLM(t *testing.T) {
	ev := &pb.PairedEvent{
		PairType: pb.PairType_PAIR_TYPE_LLM,
		Data: &pb.PairedEvent_Llm{
			Llm: &pb.LlmPairData{
				ToolCalls: []*pb.ToolCall{
					{Name: "fetch", Args: `{"url":"https://x.com"}`},
				},
			},
		},
	}
	got := extractSecurityTags(ev)
	if len(got) < 2 {
		t.Fatalf("expected LLMToolCall + ExternalHTTP, got %v", got)
	}
	if got[0] != TagLLMToolCall {
		t.Errorf("first tag = %q, want LLMToolCall", got[0])
	}
}

func TestExtractSecurityTagsNil(t *testing.T) {
	if got := extractSecurityTags(nil); got != nil {
		t.Errorf("nil event should yield nil tags, got %v", got)
	}
}
