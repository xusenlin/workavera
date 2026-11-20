package configs

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

const (
	SandboxEnabledKey     = "sandbox.enabled"
	SandboxImageKey       = "sandbox.image"
	SandboxNetworkKey     = "sandbox.network"
	SandboxLimitsKey      = "sandbox.limits"
	SandboxIdleTimeoutKey = "sandbox.idle_timeout_minutes"

	DefaultSandboxImage = "ghcr.io/xusenlin/workavera-sandbox:4"
)

// SandboxLimits are the resource limits of every sandbox container. Memory
// is a byte count with a k, m, or g unit, as docker accepts it.
type SandboxLimits struct {
	Memory string  `json:"memory"`
	CPUs   float64 `json:"cpus"`
	PIDs   int     `json:"pids"`
}

// SandboxConfig is the instance-wide sandbox configuration. Each key falls
// back to its default when its record is missing.
type SandboxConfig struct {
	Enabled            bool
	Image              string
	Network            bool
	Limits             SandboxLimits
	IdleTimeoutMinutes int
}

func DefaultSandboxConfig() SandboxConfig {
	return SandboxConfig{
		Enabled:            true,
		Image:              DefaultSandboxImage,
		Network:            true,
		Limits:             SandboxLimits{Memory: "1g", CPUs: 2, PIDs: 512},
		IdleTimeoutMinutes: 60,
	}
}

// IsSandboxKey reports whether key is one of the sandbox configuration keys.
func IsSandboxKey(key string) bool {
	switch key {
	case SandboxEnabledKey, SandboxImageKey, SandboxNetworkKey, SandboxLimitsKey, SandboxIdleTimeoutKey:
		return true
	}
	return false
}

// Sandbox reads the sandbox configuration. Saved values were validated on
// save, so a value that still fails to parse is treated like a missing one.
func Sandbox(app core.App) SandboxConfig {
	config := DefaultSandboxConfig()
	records, err := app.FindAllRecords(CollectionName)
	if err != nil {
		return config
	}
	for _, record := range records {
		key := record.GetString("key")
		if !IsSandboxKey(key) {
			continue
		}
		_ = applySandboxValue(&config, key, []byte(record.GetString("value")))
	}
	return config
}

// ValidateSandboxValue checks the raw JSON value of a sandbox key.
func ValidateSandboxValue(key string, raw []byte) error {
	config := DefaultSandboxConfig()
	return applySandboxValue(&config, key, raw)
}

func applySandboxValue(config *SandboxConfig, key string, raw []byte) error {
	switch key {
	case SandboxEnabledKey, SandboxNetworkKey:
		var value bool
		if err := json.Unmarshal(raw, &value); err != nil {
			return errors.New("must be true or false")
		}
		if key == SandboxEnabledKey {
			config.Enabled = value
		} else {
			config.Network = value
		}
	case SandboxImageKey:
		var value string
		if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" || strings.ContainsAny(value, " \t\r\n") || strings.HasPrefix(value, "-") {
			return errors.New(`must be an image reference string, such as "` + DefaultSandboxImage + `"`)
		}
		config.Image = value
	case SandboxLimitsKey:
		limits, err := parseSandboxLimits(raw)
		if err != nil {
			return err
		}
		config.Limits = limits
	case SandboxIdleTimeoutKey:
		var value float64
		if err := json.Unmarshal(raw, &value); err != nil || value != float64(int(value)) || value < 0 || (value > 0 && value < 5) {
			return errors.New("must be 0 or a whole number of at least 5")
		}
		config.IdleTimeoutMinutes = int(value)
	}
	return nil
}

var memoryPattern = regexp.MustCompile(`^([0-9]+)([kmg])$`)

func parseSandboxLimits(raw []byte) (SandboxLimits, error) {
	var value struct {
		Memory *string  `json:"memory"`
		CPUs   *float64 `json:"cpus"`
		PIDs   *float64 `json:"pids"`
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return SandboxLimits{}, errors.New(`must be an object such as {"memory": "1g", "cpus": 2, "pids": 512}`)
	}
	if value.Memory == nil || value.CPUs == nil || value.PIDs == nil {
		return SandboxLimits{}, errors.New("memory, cpus, and pids are all required")
	}
	memory := strings.ToLower(strings.TrimSpace(*value.Memory))
	bytes, ok := MemoryBytes(memory)
	if !ok || bytes < 256*1024*1024 {
		return SandboxLimits{}, errors.New(`memory must be a size with a k, m, or g unit of at least 256m, such as "1g"`)
	}
	if *value.CPUs <= 0 {
		return SandboxLimits{}, errors.New("cpus must be greater than 0")
	}
	if *value.PIDs != float64(int(*value.PIDs)) || *value.PIDs < 64 {
		return SandboxLimits{}, errors.New("pids must be a whole number of at least 64")
	}
	return SandboxLimits{Memory: memory, CPUs: *value.CPUs, PIDs: int(*value.PIDs)}, nil
}

// MemoryBytes parses a memory size with a k, m, or g unit.
func MemoryBytes(value string) (int64, bool) {
	match := memoryPattern.FindStringSubmatch(strings.ToLower(value))
	if match == nil {
		return 0, false
	}
	number, err := strconv.ParseInt(match[1], 10, 64)
	if err != nil {
		return 0, false
	}
	shift := map[string]uint{"k": 10, "m": 20, "g": 30}[match[2]]
	if number > (1<<62)>>shift {
		return 0, false
	}
	return number << shift, true
}

// validateRecord rejects an invalid sandbox or Chat value before it is
// saved, so an administrator sees the error in the dashboard right away.
func validateRecord(event *core.RecordEvent) error {
	key := event.Record.GetString("key")
	raw := []byte(event.Record.GetString("value"))
	var err error
	switch {
	case IsSandboxKey(key):
		err = ValidateSandboxValue(key, raw)
	case key == ChatMaxStepsKey:
		_, err = parseChatMaxSteps(raw)
	case key == ResourcesMaxFileSizeKey:
		_, err = parseResourcesMaxFileSize(raw)
	}
	if err != nil {
		return validation.Errors{"value": validation.NewError("validation_invalid_config_value", fmt.Sprintf("Invalid %s: %s.", key, err))}
	}
	return event.Next()
}
