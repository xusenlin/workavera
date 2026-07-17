package chat

import (
	"context"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

const maxRunDuration = 10 * time.Minute

type service struct {
	app    core.App
	runner workagent.Runner

	mu   sync.Mutex
	runs map[string]*activeRun
}

type activeRun struct {
	id             string
	ownerID        string
	conversationID string
	cancel         context.CancelFunc

	mu      sync.Mutex
	history []workagent.StreamChunk
	notify  chan struct{}
	done    bool

	approvals map[string]*pendingApproval
}

func newService(app core.App, runner workagent.Runner) *service {
	return &service{app: app, runner: runner, runs: make(map[string]*activeRun)}
}

func (s *service) registerRun(run *activeRun) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.runs[run.id]; exists {
		return false
	}
	for _, active := range s.runs {
		if active.conversationID == run.conversationID {
			return false
		}
	}
	s.runs[run.id] = run
	return true
}

func (s *service) removeRun(run *activeRun) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.runs[run.id] == run {
		delete(s.runs, run.id)
	}
}

func (s *service) findRun(id, ownerID string) *activeRun {
	s.mu.Lock()
	run := s.runs[id]
	s.mu.Unlock()
	if run == nil || run.ownerID != ownerID {
		return nil
	}
	return run
}

func (s *service) cancelRun(id, ownerID string) bool {
	run := s.findRun(id, ownerID)
	if run == nil {
		return false
	}
	run.cancel()
	return true
}

func (s *service) cancelAll() {
	s.mu.Lock()
	runs := make([]*activeRun, 0, len(s.runs))
	for _, run := range s.runs {
		runs = append(runs, run)
	}
	s.mu.Unlock()
	for _, run := range runs {
		run.cancel()
	}
}

func newActiveRun(id, ownerID, conversationID string, cancel context.CancelFunc) *activeRun {
	return &activeRun{
		id:             id,
		ownerID:        ownerID,
		conversationID: conversationID,
		cancel:         cancel,
		notify:         make(chan struct{}),
		approvals:      make(map[string]*pendingApproval),
	}
}

func (r *activeRun) readFrom(index int) ([]workagent.StreamChunk, bool, <-chan struct{}) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if index < 0 {
		index = 0
	}
	if index > len(r.history) {
		index = len(r.history)
	}
	chunks := append([]workagent.StreamChunk(nil), r.history[index:]...)
	return chunks, r.done, r.notify
}

func (r *activeRun) publish(chunk workagent.StreamChunk) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.done {
		return
	}
	r.history = append(r.history, chunk)
	close(r.notify)
	r.notify = make(chan struct{})
}

func (r *activeRun) finish() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.done {
		return
	}
	r.done = true
	r.approvals = make(map[string]*pendingApproval)
	close(r.notify)
}
