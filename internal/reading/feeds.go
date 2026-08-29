package reading

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"golang.org/x/net/html/charset"
)

const (
	maxFeedBytes       = 4 * 1024 * 1024
	maxFeedItems       = 30
	maxCandidateDetail = 400
)

type feedEntry struct {
	Title       string
	URL         string
	Description string
	PublishedAt string
}

// rssDocument covers RSS 2.0, whose items sit under channel, and RSS 1.0,
// whose items sit directly under the RDF root. Exactly one of the two fields
// is populated by any given document.
type rssDocument struct {
	ChannelItems []rssItem `xml:"channel>item"`
	RootItems    []rssItem `xml:"item"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	Encoded     string `xml:"encoded"`
	PubDate     string `xml:"pubDate"`
	Date        string `xml:"date"`
}

type atomDocument struct {
	Entries []atomEntry `xml:"entry"`
}

type atomEntry struct {
	Title     string     `xml:"title"`
	Links     []atomLink `xml:"link"`
	Summary   string     `xml:"summary"`
	Content   string     `xml:"content"`
	Updated   string     `xml:"updated"`
	Published string     `xml:"published"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

// fetchFeedCandidates reads an RSS or Atom subscription and turns its entries
// into candidates. Nothing is stored: the user still picks what to keep.
func fetchFeedCandidates(ctx context.Context, source Source) ([]Candidate, error) {
	parsed, err := feedURL(source.URL)
	if err != nil {
		return nil, err
	}

	data, _, err := fetchBytes(ctx, parsed.String(), "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8", maxFeedBytes)
	if err != nil {
		return nil, err
	}

	entries, err := parseFeed(data)
	if err != nil {
		return nil, err
	}

	candidates := make([]Candidate, 0, len(entries))
	for _, entry := range entries {
		if entry.URL == "" || entry.Title == "" {
			continue
		}
		candidates = append(candidates, Candidate{
			SourceID:    source.ID,
			SourceName:  source.Name,
			Title:       entry.Title,
			URL:         entry.URL,
			Description: entry.Description,
			PublishedAt: entry.PublishedAt,
		})
		if len(candidates) >= maxFeedItems {
			break
		}
	}
	return candidates, nil
}

func parseFeed(data []byte) ([]feedEntry, error) {
	root, err := rootElement(data)
	if err != nil {
		return nil, err
	}

	switch root {
	case "rss", "RDF":
		var document rssDocument
		if err := decodeXML(data, &document); err != nil {
			return nil, err
		}
		items := document.ChannelItems
		if len(items) == 0 {
			items = document.RootItems
		}
		entries := make([]feedEntry, 0, len(items))
		for _, item := range items {
			entries = append(entries, feedEntry{
				Title:       cleanFeedText(item.Title, 0),
				URL:         strings.TrimSpace(item.Link),
				Description: cleanFeedText(firstNonEmpty(item.Description, item.Encoded), maxCandidateDetail),
				PublishedAt: parseFeedTime(firstNonEmpty(item.PubDate, item.Date)),
			})
		}
		return entries, nil
	case "feed":
		var document atomDocument
		if err := decodeXML(data, &document); err != nil {
			return nil, err
		}
		entries := make([]feedEntry, 0, len(document.Entries))
		for _, entry := range document.Entries {
			entries = append(entries, feedEntry{
				Title:       cleanFeedText(entry.Title, 0),
				URL:         atomEntryURL(entry.Links),
				Description: cleanFeedText(firstNonEmpty(entry.Summary, entry.Content), maxCandidateDetail),
				PublishedAt: parseFeedTime(firstNonEmpty(entry.Published, entry.Updated)),
			})
		}
		return entries, nil
	}
	return nil, fmt.Errorf("%q is not an RSS or Atom feed", root)
}

// rootElement reports the local name of the document element, which is what
// tells an RSS document from an Atom one.
func rootElement(data []byte) (string, error) {
	decoder := newXMLDecoder(data)
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return "", errors.New("the feed is empty")
		}
		if err != nil {
			return "", err
		}
		if start, ok := token.(xml.StartElement); ok {
			return start.Name.Local, nil
		}
	}
}

func decodeXML(data []byte, target any) error {
	return newXMLDecoder(data).Decode(target)
}

// newXMLDecoder tolerates the non-UTF-8 encodings feeds still ship with, which
// the standard decoder refuses outright.
func newXMLDecoder(data []byte) *xml.Decoder {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.Strict = false
	decoder.CharsetReader = charset.NewReaderLabel
	return decoder
}

func atomEntryURL(links []atomLink) string {
	for _, link := range links {
		if link.Rel == "alternate" || link.Rel == "" {
			if href := strings.TrimSpace(link.Href); href != "" {
				return href
			}
		}
	}
	for _, link := range links {
		if href := strings.TrimSpace(link.Href); href != "" {
			return href
		}
	}
	return ""
}

// cleanFeedText flattens the HTML feeds put in titles and summaries into the
// plain text a candidate card shows. A limit of 0 keeps the whole string.
func cleanFeedText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if strings.ContainsAny(value, "<&") {
		if text := htmlText(value); text != "" {
			value = text
		}
	}
	value = normalizeWhitespace(value)
	if limit > 0 {
		runes := []rune(value)
		if len(runes) > limit {
			value = strings.TrimSpace(string(runes[:limit])) + "…"
		}
	}
	return value
}

var feedTimeLayouts = []string{
	time.RFC1123Z,
	time.RFC1123,
	time.RFC3339,
	time.RFC822Z,
	time.RFC822,
	"2006-01-02T15:04:05Z0700",
	"2006-01-02 15:04:05",
	"2006-01-02",
}

// parseFeedTime normalizes the many date formats feeds use into RFC 3339, and
// reports an unparseable date as no date rather than failing the whole fetch.
func parseFeedTime(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	for _, layout := range feedTimeLayouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
