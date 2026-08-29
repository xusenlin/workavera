package reading

import (
	"bytes"
	"context"
	"errors"
	"net/url"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

const maxTrendingBytes = 4 * 1024 * 1024

type trendingRepo struct {
	Path        string
	Description string
	Language    string
	Stars       int
	PeriodStars int
}

// fetchTrendingCandidates reads GitHub's trending board for one language.
//
// GitHub publishes no API for it: the star gain over a day, week, or month
// exists only on this public page, so the page is what we read. The parse is
// deliberately shallow, and a redesign that breaks it surfaces as an error on
// the source rather than taking the rest of the panel down with it.
func fetchTrendingCandidates(ctx context.Context, source Source) ([]Candidate, error) {
	language := strings.ToLower(strings.TrimSpace(source.Language))
	if language == "" {
		return nil, errors.New("this trending source has no language")
	}

	endpoint := "https://github.com/trending/" + url.PathEscape(language) + "?since=" + url.QueryEscape(source.Since)
	data, _, err := fetchBytes(ctx, endpoint, "text/html", maxTrendingBytes)
	if err != nil {
		return nil, err
	}

	document, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	repos := parseTrending(document)
	if len(repos) == 0 {
		return nil, errors.New("GitHub returned no trending repositories for this language")
	}

	candidates := make([]Candidate, 0, len(repos))
	for _, repo := range repos {
		candidates = append(candidates, Candidate{
			SourceID:    source.ID,
			SourceName:  source.Name,
			Title:       repo.Path,
			URL:         "https://github.com/" + repo.Path,
			Description: repo.Description,
			Language:    repo.Language,
			Stars:       repo.Stars,
			PeriodStars: repo.PeriodStars,
			StarsPeriod: source.Since,
		})
	}
	return candidates, nil
}

func parseTrending(document *html.Node) []trendingRepo {
	var repos []trendingRepo
	forEachElement(document, func(node *html.Node) {
		if node.Data != "article" || !hasClass(node, "Box-row") {
			return
		}
		repo := trendingRepo{Path: headingRepositoryPath(node)}
		if repo.Path == "" {
			return
		}
		forEachElement(node, func(child *html.Node) {
			switch child.Data {
			case "a":
				if repo.Stars == 0 && strings.HasSuffix(attr(child, "href"), "/stargazers") {
					repo.Stars = leadingCount(elementText(child))
				}
			case "p":
				if repo.Description == "" {
					repo.Description = cleanFeedText(elementText(child), maxCandidateDetail)
				}
			case "span":
				if repo.Language == "" && attr(child, "itemprop") == "programmingLanguage" {
					repo.Language = elementText(child)
				}
				if repo.PeriodStars == 0 && hasClass(child, "float-sm-right") {
					repo.PeriodStars = leadingCount(elementText(child))
				}
			}
		})
		repos = append(repos, repo)
	})
	return repos
}

// headingRepositoryPath reads owner/repo out of the row's heading link. Only
// the heading is searched because the rest of a row also links to two-segment
// paths, such as an owner's sponsor page.
func headingRepositoryPath(article *html.Node) string {
	var heading *html.Node
	forEachElement(article, func(node *html.Node) {
		if heading != nil {
			return
		}
		switch node.Data {
		case "h1", "h2", "h3":
			heading = node
		}
	})
	if heading == nil {
		return ""
	}

	path := ""
	forEachElement(heading, func(node *html.Node) {
		if path != "" || node.Data != "a" {
			return
		}
		href := attr(node, "href")
		if index := strings.IndexAny(href, "?#"); index >= 0 {
			href = href[:index]
		}
		segments := strings.Split(strings.Trim(href, "/"), "/")
		if len(segments) == 2 && segments[0] != "" && segments[1] != "" {
			path = segments[0] + "/" + segments[1]
		}
	})
	return path
}

func forEachElement(node *html.Node, visit func(*html.Node)) {
	if node.Type == html.ElementNode {
		visit(node)
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		forEachElement(child, visit)
	}
}

func attr(node *html.Node, name string) string {
	for _, attribute := range node.Attr {
		if attribute.Key == name {
			return attribute.Val
		}
	}
	return ""
}

func hasClass(node *html.Node, name string) bool {
	for _, class := range strings.Fields(attr(node, "class")) {
		if class == name {
			return true
		}
	}
	return false
}

func elementText(node *html.Node) string {
	var builder strings.Builder
	forEachText(node, func(text string) {
		builder.WriteString(text)
		builder.WriteByte(' ')
	})
	return normalizeWhitespace(builder.String())
}

func forEachText(node *html.Node, visit func(string)) {
	if node.Type == html.TextNode {
		visit(node.Data)
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		forEachText(child, visit)
	}
}

// leadingCount reads the number a trending row starts a fragment with, so
// "1,234 stars this week" and "12,345" both become an integer.
func leadingCount(value string) int {
	start := strings.IndexFunc(value, func(character rune) bool {
		return character >= '0' && character <= '9'
	})
	if start < 0 {
		return 0
	}
	digits := make([]byte, 0, len(value)-start)
	for index := start; index < len(value); index++ {
		character := value[index]
		if character >= '0' && character <= '9' {
			digits = append(digits, character)
			continue
		}
		if character == ',' {
			continue
		}
		break
	}
	count, err := strconv.Atoi(string(digits))
	if err != nil {
		return 0
	}
	return count
}
