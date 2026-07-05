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
	id      string
	ownerID string
	cancel  context.CancelFunc

	mu          sync.Mutex
	subscribers map[chan workagent.StreamChunk]struct{}
	done        bool
}

func newService(app core.App, runner workagent.Runner) *service {
	return &service{app: app, runner: runner, runs: make(map[string]*activeRun)}
}

func (s *service) registerRun(run *activeRun) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.id] = run
}

func (s *service) removeRun(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.runs, id)
}

func (s *service) cancelRun(id, ownerID string) bool {
	s.mu.Lock()
	run := s.runs[id]
	s.mu.Unlock()
	if run == nil || run.ownerID != ownerID {
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

func newActiveRun(id, ownerID string, cancel context.CancelFunc) *activeRun {
	return &activeRun{id: id, ownerID: ownerID, cancel: cancel, subscribers: make(map[chan workagent.StreamChunk]struct{})}
}

func (r *activeRun) subscribe() chan workagent.StreamChunk {
	ch := make(chan workagent.StreamChunk, 256)
	r.mu.Lock()
	if r.done {
		close(ch)
	} else {
		r.subscribers[ch] = struct{}{}
	}
	r.mu.Unlock()
	return ch
}

func (r *activeRun) unsubscribe(ch chan workagent.StreamChunk) {
	r.mu.Lock()
	delete(r.subscribers, ch)
	r.mu.Unlock()
}

func (r *activeRun) publish(chunk workagent.StreamChunk) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for ch := range r.subscribers {
		select {
		case ch <- chunk:
		default:
			delete(r.subscribers, ch)
			close(ch)
		}
	}
}

func (r *activeRun) finish() {
	r.mu.Lock()
	r.done = true
	for ch := range r.subscribers {
		close(ch)
		delete(r.subscribers, ch)
	}
	r.mu.Unlock()
}
