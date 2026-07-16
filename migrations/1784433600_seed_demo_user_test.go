package migrations

import (
	"database/sql"
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestSeedDemoUser(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	record, err := app.FindRecordById(usersCollectionName, demoUserID)
	if err != nil {
		t.Fatal(err)
	}
	if record.Email() != demoUserEmail {
		t.Fatalf("unexpected demo email: %q", record.Email())
	}
	if record.GetString("name") != demoUserName {
		t.Fatalf("unexpected demo name: %q", record.GetString("name"))
	}
	if !record.Verified() || !record.EmailVisibility() {
		t.Fatal("demo user should be verified with a visible email")
	}
	if !record.ValidatePassword(demoUserPassword) {
		t.Fatal("demo user password does not match the documented credential")
	}

	if err := seedDemoUser(app); err != nil {
		t.Fatalf("seed demo user twice: %v", err)
	}
	if count, err := app.CountRecords(usersCollectionName); err != nil || count != 1 {
		t.Fatalf("expected one user after repeated seed, got count=%d err=%v", count, err)
	}

	if err := removeDemoUser(app); err != nil {
		t.Fatalf("remove demo user: %v", err)
	}
	if _, err := app.FindRecordById(usersCollectionName, demoUserID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected demo user to be removed, got %v", err)
	}
}

func TestSeedDemoUserSkipsNonEmptyUsersCollection(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if err := removeDemoUser(app); err != nil {
		t.Fatal(err)
	}

	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	existing := core.NewRecord(users)
	existing.SetEmail("owner@example.com")
	existing.SetPassword("owner-password")
	existing.SetVerified(true)
	existing.Set("name", "Existing Owner")
	if err := app.Save(existing); err != nil {
		t.Fatal(err)
	}

	if err := seedDemoUser(app); err != nil {
		t.Fatalf("seed with existing user: %v", err)
	}
	if count, err := app.CountRecords(usersCollectionName); err != nil || count != 1 {
		t.Fatalf("expected existing user to remain alone, got count=%d err=%v", count, err)
	}
	if _, err := app.FindRecordById(usersCollectionName, demoUserID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected demo user to be skipped, got %v", err)
	}
}
