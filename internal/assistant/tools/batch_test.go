package tools

import (
	"errors"
	"testing"
)

func TestExecuteBatchSupportsOneItem(t *testing.T) {
	result, err := executeBatch([]int{4}, func(_ int, item int) (any, error) {
		return item * 2, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.OK || result.Total != 1 || result.Succeeded != 1 || result.Failed != 0 {
		t.Fatalf("unexpected single-item result: %#v", result)
	}
}

func TestExecuteBatchReportsPartialFailure(t *testing.T) {
	result, err := executeBatch([]int{1, 2, 3}, func(_ int, item int) (any, error) {
		if item == 2 {
			return nil, errors.New("failed item")
		}
		return item, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Total != 3 || result.Succeeded != 2 || result.Failed != 1 {
		t.Fatalf("unexpected partial result: %#v", result)
	}
	if result.Results[1].OK || result.Results[1].Error != "failed item" {
		t.Fatalf("missing per-item error: %#v", result.Results[1])
	}
}

func TestExecuteBatchValidatesSize(t *testing.T) {
	if _, err := executeBatch([]int{}, func(_ int, item int) (any, error) { return item, nil }); err == nil {
		t.Fatal("empty batch must fail")
	}
	tooMany := make([]int, maxMutationBatchSize+1)
	if _, err := executeBatch(tooMany, func(_ int, item int) (any, error) { return item, nil }); err == nil {
		t.Fatal("oversized batch must fail")
	}
}
