package reading

import "testing"

func TestParseFeedReadsRSSItems(t *testing.T) {
	document := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example</title>
    <item>
      <title>Show HN: a &amp; b</title>
      <link>https://example.com/one</link>
      <description>&lt;p&gt;Some  &lt;b&gt;marked up&lt;/b&gt; summary.&lt;/p&gt;</description>
      <pubDate>Mon, 25 Aug 2026 09:30:00 +0000</pubDate>
    </item>
    <item>
      <title>Second</title>
      <link>https://example.com/two</link>
      <content:encoded>Fallback body</content:encoded>
    </item>
  </channel>
</rss>`)

	entries, err := parseFeed(document)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	if entries[0].Title != "Show HN: a & b" {
		t.Fatalf("unexpected title: %q", entries[0].Title)
	}
	if entries[0].URL != "https://example.com/one" {
		t.Fatalf("unexpected url: %q", entries[0].URL)
	}
	if entries[0].Description != "Some marked up summary." {
		t.Fatalf("unexpected description: %q", entries[0].Description)
	}
	if entries[0].PublishedAt != "2026-08-25T09:30:00Z" {
		t.Fatalf("unexpected publish time: %q", entries[0].PublishedAt)
	}

	// content:encoded stands in when there is no description, and an entry
	// without a date keeps an empty one rather than failing the feed.
	if entries[1].Description != "Fallback body" || entries[1].PublishedAt != "" {
		t.Fatalf("unexpected fallback entry: %#v", entries[1])
	}
}

func TestParseFeedReadsAtomEntries(t *testing.T) {
	document := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>owner/repo Releases</title>
  <entry>
    <title>v1.2.0</title>
    <link rel="alternate" type="text/html" href="https://github.com/owner/repo/releases/tag/v1.2.0"/>
    <updated>2026-08-20T12:00:00Z</updated>
    <content type="html">Adds a thing.</content>
  </entry>
</feed>`)

	entries, err := parseFeed(document)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].URL != "https://github.com/owner/repo/releases/tag/v1.2.0" {
		t.Fatalf("unexpected url: %q", entries[0].URL)
	}
	if entries[0].Description != "Adds a thing." {
		t.Fatalf("unexpected description: %q", entries[0].Description)
	}
	if entries[0].PublishedAt != "2026-08-20T12:00:00Z" {
		t.Fatalf("unexpected publish time: %q", entries[0].PublishedAt)
	}
}

func TestParseFeedRejectsNonFeedDocuments(t *testing.T) {
	if _, err := parseFeed([]byte("<html><body>not a feed</body></html>")); err == nil {
		t.Fatal("expected an HTML page to be rejected as a feed")
	}
	if _, err := parseFeed(nil); err == nil {
		t.Fatal("expected an empty document to be rejected as a feed")
	}
}
