package tools

import "strings"

// normalizeEscapedText restores literal escape sequences that language models
// sometimes emit in free-text fields — for example the two characters `\` and
// `n` instead of a real newline — into the characters they represent.
//
// It is deliberately conservative: if the text already contains a real line
// break it is assumed to be correctly formatted and returned untouched, so
// legitimate content that merely happens to include a backslash (code snippets,
// Windows paths, regexes) is not corrupted.
func normalizeEscapedText(s string) string {
	if strings.ContainsAny(s, "\n\r") {
		return s
	}
	if !strings.Contains(s, `\`) {
		return s
	}
	return strings.NewReplacer(
		`\r\n`, "\n",
		`\n`, "\n",
		`\r`, "\n",
		`\t`, "\t",
	).Replace(s)
}

// normalizeEscapedTextPtr applies normalizeEscapedText to an optional field,
// preserving a nil pointer (field omitted) versus an empty string (field
// cleared).
func normalizeEscapedTextPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := normalizeEscapedText(*s)
	return &v
}
