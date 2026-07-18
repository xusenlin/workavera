package tools

import (
	"encoding/json"
	"fmt"

	"charm.land/fantasy"
)

const maxMutationBatchSize = 50

type batchItemResult struct {
	Index  int    `json:"index"`
	OK     bool   `json:"ok"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

type batchResult struct {
	OK        bool              `json:"ok"`
	Total     int               `json:"total"`
	Succeeded int               `json:"succeeded"`
	Failed    int               `json:"failed"`
	Results   []batchItemResult `json:"results"`
}

func executeBatch[T any](items []T, execute func(index int, item T) (any, error)) (batchResult, error) {
	if len(items) == 0 {
		return batchResult{}, fmt.Errorf("items must contain at least one record")
	}
	if len(items) > maxMutationBatchSize {
		return batchResult{}, fmt.Errorf("items cannot contain more than %d records", maxMutationBatchSize)
	}

	result := batchResult{
		OK:      true,
		Total:   len(items),
		Results: make([]batchItemResult, 0, len(items)),
	}
	for index, item := range items {
		value, err := execute(index, item)
		if err != nil {
			result.OK = false
			result.Failed++
			result.Results = append(result.Results, batchItemResult{
				Index: index,
				OK:    false,
				Error: err.Error(),
			})
			continue
		}
		result.Succeeded++
		result.Results = append(result.Results, batchItemResult{
			Index:  index,
			OK:     true,
			Result: value,
		})
	}
	return result, nil
}

func batchToolResponse(result batchResult, err error) (fantasy.ToolResponse, error) {
	if err != nil {
		return fantasy.NewTextErrorResponse(err.Error()), nil
	}
	data, err := json.Marshal(result)
	if err != nil {
		return fantasy.NewTextErrorResponse("Failed to serialize batch result"), nil
	}
	return fantasy.NewTextResponse(string(data)), nil
}
