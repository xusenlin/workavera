package tools

import "testing"

func TestNormalizeEscapedText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"literal newlines", `line1\nline2`, "line1\nline2"},
		{"literal double newline", `a.\n\nb`, "a.\n\nb"},
		{"literal crlf", `a\r\nb`, "a\nb"},
		{"literal tab", `a\tb`, "a\tb"},
		{"plain text untouched", "just text", "just text"},
		{"already has real newline is untouched", "line1\nkeep \\n literal", "line1\nkeep \\n literal"},
		{"no backslash untouched", "no escapes here", "no escapes here"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeEscapedText(tc.in); got != tc.want {
				t.Fatalf("normalizeEscapedText(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizeEscapedTextPtr(t *testing.T) {
	if got := normalizeEscapedTextPtr(nil); got != nil {
		t.Fatalf("nil pointer should stay nil, got %v", got)
	}
	in := `x\ny`
	got := normalizeEscapedTextPtr(&in)
	if got == nil || *got != "x\ny" {
		t.Fatalf("pointer normalize failed, got %v", got)
	}
}
