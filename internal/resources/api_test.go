package resources

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

type apiTestServer struct {
	app     *tests.TestApp
	handler http.Handler
}

func newAPITestServer(t *testing.T, appURL string) *apiTestServer {
	t.Helper()
	app := newTestApp(t)
	app.Settings().Meta.AppURL = appURL
	Register(app)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(event *core.ServeEvent) error { return event.Next() }); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return &apiTestServer{app: app, handler: handler}
}

func (s *apiTestServer) token(t *testing.T, user *core.Record) string {
	t.Helper()
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func (s *apiTestServer) request(t *testing.T, token, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(payload)
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response := httptest.NewRecorder()
	s.handler.ServeHTTP(response, request)
	return response
}

func (s *apiTestServer) upload(t *testing.T, token, name string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if name != "" {
		part, err := writer.CreateFormFile("file", name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/resources", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Authorization", token)
	response := httptest.NewRecorder()
	s.handler.ServeHTTP(response, request)
	return response
}

func decodeJSON[T any](t *testing.T, response *httptest.ResponseRecorder) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(response.Body.Bytes(), &value); err != nil {
		t.Fatalf("decode %s: %v", response.Body.String(), err)
	}
	return value
}

func TestResourceAPIUploadRecordsRulesAndDelete(t *testing.T) {
	server := newAPITestServer(t, "https://workavera.example")
	owner := createTestUser(t, server.app, "api-owner@example.com")
	other := createTestUser(t, server.app, "api-other@example.com")
	ownerToken, otherToken := server.token(t, owner), server.token(t, other)

	if response := server.upload(t, ownerToken, "", nil); response.Code != http.StatusBadRequest || decodeJSON[map[string]any](t, response)["code"] != CodeFileRequired {
		t.Fatalf("missing file: %d %s", response.Code, response.Body.String())
	}
	if response := server.upload(t, ownerToken, "empty.txt", nil); decodeJSON[map[string]any](t, response)["code"] != CodeFileEmpty {
		t.Fatalf("empty file: %d %s", response.Code, response.Body.String())
	}
	if response := server.upload(t, "", "notes.txt", []byte("hello")); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous upload must be rejected: %d", response.Code)
	}

	uploaded := server.upload(t, ownerToken, "notes.txt", []byte("hello resources"))
	if uploaded.Code != http.StatusOK {
		t.Fatalf("upload: %d %s", uploaded.Code, uploaded.Body.String())
	}
	if body := uploaded.Body.String(); strings.Contains(body, "sha256") {
		t.Fatalf("upload response leaked the hash: %s", body)
	}
	resource := decodeJSON[Resource](t, uploaded)

	listed := server.request(t, ownerToken, http.MethodGet, "/api/collections/user_resources/records?fields=id,display_name,url", nil)
	if listed.Code != http.StatusOK || !strings.Contains(listed.Body.String(), `"url":"/api/files/user_resources/`+resource.ID) {
		t.Fatalf("records list must include the computed url: %d %s", listed.Code, listed.Body.String())
	}
	viewed := server.request(t, ownerToken, http.MethodGet, "/api/collections/user_resources/records/"+resource.ID, nil)
	if strings.Contains(viewed.Body.String(), "sha256") {
		t.Fatalf("records view leaked the hash: %s", viewed.Body.String())
	}
	if response := server.request(t, otherToken, http.MethodGet, "/api/collections/user_resources/records/"+resource.ID, nil); response.Code != http.StatusNotFound {
		t.Fatalf("another user viewed the resource: %d", response.Code)
	}

	renamed := server.request(t, ownerToken, http.MethodPatch, "/api/collections/user_resources/records/"+resource.ID, map[string]any{"display_name": "  Meeting notes\n "})
	if renamed.Code != http.StatusOK || decodeJSON[map[string]any](t, renamed)["display_name"] != "Meeting notes" {
		t.Fatalf("rename: %d %s", renamed.Code, renamed.Body.String())
	}
	for field, value := range map[string]any{"original_name": "x.txt", "size": 1, "media_type": "text/html", "owner": other.Id} {
		response := server.request(t, ownerToken, http.MethodPatch, "/api/collections/user_resources/records/"+resource.ID, map[string]any{field: value})
		if response.Code == http.StatusOK {
			t.Fatalf("changing %s must be rejected: %s", field, response.Body.String())
		}
	}
	if response := server.request(t, otherToken, http.MethodPatch, "/api/collections/user_resources/records/"+resource.ID, map[string]any{"display_name": "stolen"}); response.Code != http.StatusNotFound {
		t.Fatalf("another user renamed the resource: %d", response.Code)
	}
	if response := server.request(t, ownerToken, http.MethodPost, "/api/collections/user_resources/records", map[string]any{"display_name": "x"}); response.Code == http.StatusOK {
		t.Fatal("the Records API must not create resources")
	}

	if response := server.request(t, otherToken, http.MethodDelete, "/api/resources/"+resource.ID, nil); response.Code != http.StatusNotFound {
		t.Fatalf("another user deleted the resource: %d", response.Code)
	}
	if response := server.request(t, ownerToken, http.MethodDelete, "/api/resources/"+resource.ID, nil); response.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", response.Code, response.Body.String())
	}
	if _, err := server.app.FindRecordById(CollectionName, resource.ID); err == nil {
		t.Fatal("resource still exists after delete")
	}
}

func TestDownloadLeasesAreShortLivedIndependentAndRevocable(t *testing.T) {
	server := newAPITestServer(t, "https://workavera.example/")
	owner := createTestUser(t, server.app, "lease-owner@example.com")
	other := createTestUser(t, server.app, "lease-other@example.com")
	ownerToken, otherToken := server.token(t, owner), server.token(t, other)
	content := []byte("the signed contract")
	resource := decodeJSON[Resource](t, server.upload(t, ownerToken, "合同 v2.txt", content))
	before, err := server.app.FindRecordById(CollectionName, resource.ID)
	if err != nil {
		t.Fatal(err)
	}

	if response := server.request(t, ownerToken, http.MethodPost, "/api/resources/"+resource.ID+"/download-leases", map[string]any{"purpose": "user requested"}); decodeJSON[map[string]any](t, response)["code"] != CodeInvalidInput {
		t.Fatalf("a vague purpose must be rejected: %d %s", response.Code, response.Body.String())
	}
	if response := server.request(t, otherToken, http.MethodPost, "/api/resources/"+resource.ID+"/download-leases", map[string]any{"purpose": "Send the contract to the signing service"}); response.Code != http.StatusNotFound {
		t.Fatalf("another user created a lease: %d", response.Code)
	}

	createLease := func() LeaseResult {
		t.Helper()
		response := server.request(t, ownerToken, http.MethodPost, "/api/resources/"+resource.ID+"/download-leases", map[string]any{"purpose": "Send the contract to the signing service"})
		if response.Code != http.StatusOK {
			t.Fatalf("create lease: %d %s", response.Code, response.Body.String())
		}
		return decodeJSON[LeaseResult](t, response)
	}
	first, second := createLease(), createLease()
	if !strings.HasPrefix(first.URL, "https://workavera.example/api/resource-downloads/") || first.URL == second.URL || first.LeaseID == "" {
		t.Fatalf("unexpected leases: %#v %#v", first, second)
	}
	expiresAt, err := time.Parse(time.RFC3339, first.ExpiresAt)
	if err != nil || expiresAt.Sub(time.Now()) > LeaseLifetime || expiresAt.Sub(time.Now()) < LeaseLifetime-time.Minute {
		t.Fatalf("lease must expire in five minutes: %s", first.ExpiresAt)
	}
	stored, err := server.app.FindRecordById(LeasesCollectionName, first.LeaseID)
	if err != nil || strings.Contains(first.URL, stored.GetString("token_hash")) {
		t.Fatalf("lease must store only the token hash: %v", err)
	}
	if listed := server.request(t, ownerToken, http.MethodGet, "/api/collections/resource_download_leases/records", nil); strings.Contains(listed.Body.String(), "token_hash") {
		t.Fatalf("lease list leaked the token hash: %s", listed.Body.String())
	}

	download := func(rawURL, method string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(method, strings.TrimPrefix(rawURL, "https://workavera.example"), nil)
		response := httptest.NewRecorder()
		server.handler.ServeHTTP(response, request)
		return response
	}
	fetched := download(first.URL, http.MethodGet)
	if fetched.Code != http.StatusOK || !bytes.Equal(fetched.Body.Bytes(), content) {
		t.Fatalf("download: %d %q", fetched.Code, fetched.Body.String())
	}
	if fetched.Header().Get("Cache-Control") != "private, no-store" || fetched.Header().Get("Content-Type") != "text/plain" || !strings.Contains(fetched.Header().Get("Content-Disposition"), "attachment") || fetched.Header().Get("Location") != "" {
		t.Fatalf("unexpected download headers: %#v", fetched.Header())
	}
	if head := download(first.URL, http.MethodHead); head.Code != http.StatusOK || head.Body.Len() != 0 {
		t.Fatalf("HEAD: %d %d bytes", head.Code, head.Body.Len())
	}

	if response := server.request(t, otherToken, http.MethodDelete, "/api/resource-download-leases/"+first.LeaseID, nil); response.Code != http.StatusNoContent {
		t.Fatalf("revoking a foreign lease must look like success: %d", response.Code)
	}
	if download(first.URL, http.MethodGet).Code != http.StatusOK {
		t.Fatal("another user's revoke must not affect the lease")
	}
	for range 2 {
		if response := server.request(t, ownerToken, http.MethodDelete, "/api/resource-download-leases/"+first.LeaseID, nil); response.Code != http.StatusNoContent {
			t.Fatalf("revoke: %d %s", response.Code, response.Body.String())
		}
	}
	revoked := download(first.URL, http.MethodGet)
	if revoked.Code != http.StatusNotFound || strings.Contains(revoked.Body.String(), resource.ID) {
		t.Fatalf("a revoked lease must look not found: %d %s", revoked.Code, revoked.Body.String())
	}
	if download(second.URL, http.MethodGet).Code != http.StatusOK {
		t.Fatal("revoking one lease must not affect another")
	}
	invalid := download("https://workavera.example/api/resource-downloads/not-a-token/x.txt", http.MethodGet)
	if invalid.Code != http.StatusNotFound || invalid.Body.String() != revoked.Body.String() {
		t.Fatalf("invalid and revoked tokens must answer alike: %s vs %s", invalid.Body.String(), revoked.Body.String())
	}

	lease, err := server.app.FindRecordById(LeasesCollectionName, second.LeaseID)
	if err != nil {
		t.Fatal(err)
	}
	lease.Set("expires_at", time.Now().Add(-time.Second))
	if err := server.app.Save(lease); err != nil {
		t.Fatal(err)
	}
	if expired := download(second.URL, http.MethodGet); expired.Code != http.StatusNotFound || expired.Body.String() != revoked.Body.String() {
		t.Fatalf("an expired lease must look not found: %d", expired.Code)
	}
	if err := deleteExpiredLeases(server.app); err != nil {
		t.Fatal(err)
	}
	if _, err := server.app.FindRecordById(LeasesCollectionName, second.LeaseID); err == nil {
		t.Fatal("cleanup must delete expired leases")
	}

	after, err := server.app.FindRecordById(CollectionName, resource.ID)
	if err != nil || !after.GetDateTime("updated").Equal(before.GetDateTime("updated")) {
		t.Fatalf("leases must never touch the resource record: %v", err)
	}

	third := createLease()
	if response := server.request(t, ownerToken, http.MethodDelete, "/api/resources/"+resource.ID, nil); response.Code != http.StatusNoContent {
		t.Fatalf("delete resource: %d", response.Code)
	}
	if download(third.URL, http.MethodGet).Code != http.StatusNotFound {
		t.Fatal("deleting a resource must invalidate its leases")
	}
	if count, err := server.app.CountRecords(LeasesCollectionName, dbx.HashExp{"resource": resource.ID}); err != nil || count != 0 {
		t.Fatalf("leases must be deleted with their resource: %d %v", count, err)
	}
}

func TestDownloadLeasesRequireAnHTTPSApplicationURL(t *testing.T) {
	server := newAPITestServer(t, "http://workavera.example")
	owner := createTestUser(t, server.app, "lease-http@example.com")
	token := server.token(t, owner)
	resource := decodeJSON[Resource](t, server.upload(t, token, "notes.txt", []byte("hello")))
	response := server.request(t, token, http.MethodPost, "/api/resources/"+resource.ID+"/download-leases", map[string]any{"purpose": "Send the notes to the translation service"})
	if response.Code != http.StatusConflict || decodeJSON[map[string]any](t, response)["code"] != CodeDownloadLinksUnavailable {
		t.Fatalf("plain HTTP deployments must not issue leases: %d %s", response.Code, response.Body.String())
	}

	server.app.Settings().Meta.AppURL = "http://127.0.0.1:8090"
	if response := server.request(t, token, http.MethodPost, "/api/resources/"+resource.ID+"/download-leases", map[string]any{"purpose": "Send the notes to the translation service"}); response.Code != http.StatusOK {
		t.Fatalf("loopback development URLs must be allowed: %d %s", response.Code, response.Body.String())
	}
}
