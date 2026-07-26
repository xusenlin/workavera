package mcpclient

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

// maxRefDepth bounds $ref expansion. A schema that needs more nesting than
// this — in practice, a recursive one — cannot be represented after Fantasy
// rebuilds it, so the tool is reported as unsupported instead of stored.
const maxRefDepth = 8

var errUnsupportedSchema = errors.New("input schema uses references that cannot be resolved")

// flattenSchema converts an upstream inputSchema into the properties and
// required list stored on a locked definition.
//
// Fantasy rebuilds every tool schema as {type, properties, required} and does
// not resolve JSON Schema references (see prepareTools in fantasy's agent.go),
// so any $defs sibling of the root would be dropped and leave $ref pointers
// dangling. Expanding them here means what we store is exactly what the model
// will be shown.
func flattenSchema(raw any) (map[string]any, []string, error) {
	schema, ok := toObject(raw)
	if !ok {
		// A tool with no meaningful input schema still takes no arguments.
		return map[string]any{}, []string{}, nil
	}

	defs := map[string]any{}
	for _, key := range []string{"$defs", "definitions"} {
		if section, ok := toObject(schema[key]); ok {
			for name, value := range section {
				defs[key+"/"+name] = value
			}
		}
	}

	properties := map[string]any{}
	if raw, ok := toObject(schema["properties"]); ok {
		for name, value := range raw {
			expanded, err := expandRefs(value, defs, 0)
			if err != nil {
				return nil, nil, err
			}
			properties[name] = expanded
		}
	}

	required := []string{}
	if values, ok := schema["required"].([]any); ok {
		for _, value := range values {
			if name, ok := value.(string); ok {
				required = append(required, name)
			}
		}
	}
	return properties, required, nil
}

// expandRefs replaces local $ref pointers with the schema they name.
func expandRefs(node any, defs map[string]any, depth int) (any, error) {
	if depth > maxRefDepth {
		return nil, errUnsupportedSchema
	}
	switch value := node.(type) {
	case map[string]any:
		if ref, ok := value["$ref"].(string); ok {
			target, err := resolveRef(ref, defs)
			if err != nil {
				return nil, err
			}
			expanded, err := expandRefs(target, defs, depth+1)
			if err != nil {
				return nil, err
			}
			// Keyword siblings of $ref (title, description) stay on the
			// expanded schema so the model keeps the upstream wording.
			merged, ok := toObject(expanded)
			if !ok {
				return expanded, nil
			}
			result := make(map[string]any, len(merged)+len(value))
			for key, item := range merged {
				result[key] = item
			}
			for key, item := range value {
				if key == "$ref" {
					continue
				}
				result[key] = item
			}
			return result, nil
		}
		result := make(map[string]any, len(value))
		for key, item := range value {
			if key == "$defs" || key == "definitions" {
				continue
			}
			expanded, err := expandRefs(item, defs, depth)
			if err != nil {
				return nil, err
			}
			result[key] = expanded
		}
		return result, nil
	case []any:
		result := make([]any, 0, len(value))
		for _, item := range value {
			expanded, err := expandRefs(item, defs, depth)
			if err != nil {
				return nil, err
			}
			result = append(result, expanded)
		}
		return result, nil
	default:
		return node, nil
	}
}

func resolveRef(ref string, defs map[string]any) (any, error) {
	trimmed := strings.TrimPrefix(ref, "#/")
	if trimmed == ref {
		// Remote and anchor references would need a loader we deliberately
		// do not provide.
		return nil, errUnsupportedSchema
	}
	target, ok := defs[trimmed]
	if !ok {
		return nil, errUnsupportedSchema
	}
	return target, nil
}

// definitionSchema rebuilds the object schema a locked definition represents.
// It mirrors what Fantasy sends to the model, so validating against it means
// validating against exactly what the model was shown.
func definitionSchema(tool ToolDefinition) map[string]any {
	properties := tool.Parameters
	if properties == nil {
		properties = map[string]any{}
	}
	required := tool.Required
	if required == nil {
		required = []string{}
	}
	return map[string]any{
		"type":       "object",
		"properties": properties,
		"required":   required,
	}
}

// validateArguments checks model-produced arguments against the locked schema.
//
// This runs before any network request for two reasons: malformed model output
// never reaches upstream, and — because the arguments provably match what the
// model was shown — an upstream parameter rejection becomes evidence that the
// locked definition has drifted rather than that the model guessed wrong.
// Fantasy only checks that required keys are present, so the full check
// belongs here.
func validateArguments(tool ToolDefinition, arguments map[string]any) error {
	raw, err := json.Marshal(definitionSchema(tool))
	if err != nil {
		return err
	}
	schema := new(jsonschema.Schema)
	if err := json.Unmarshal(raw, schema); err != nil {
		return err
	}
	resolved, err := schema.Resolve(nil)
	if err != nil {
		return err
	}
	return resolved.Validate(arguments)
}

// definitionHash digests the parts of a tool the user reviews. A refresh that
// leaves the hash unchanged keeps the user's enable and approval choices; a
// changed hash sends the tool back for review.
func definitionHash(description string, properties map[string]any, required []string) (string, error) {
	payload, err := json.Marshal(map[string]any{
		"description": description,
		"properties":  properties,
		"required":    required,
	})
	if err != nil {
		return "", fmt.Errorf("could not hash tool definition: %w", err)
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

func toObject(value any) (map[string]any, bool) {
	object, ok := value.(map[string]any)
	return object, ok
}
