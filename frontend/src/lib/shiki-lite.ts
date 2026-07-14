// Curated shiki bundle, wired in as an alias for "shiki" in vite.config.ts.
// Mirrors shiki/dist/bundle-full.mjs but registers only the languages and
// themes below, so the build embeds ~2MB of grammars instead of the full
// ~10MB set. Unlisted languages gracefully fall back to plain text in
// streamdown. Keep the @shikijs/* dependency versions in package.json on the
// same major as the shiki version required by @streamdown/code.
import {
  createBundledHighlighter,
  createSingletonShorthands,
  guessEmbeddedLanguages,
} from "@shikijs/core"
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript"

export * from "@shikijs/core"

export const bundledLanguagesInfo = [
  { id: "c", name: "C", import: () => import("@shikijs/langs/c") },
  {
    id: "cpp",
    name: "C++",
    aliases: ["c++"],
    import: () => import("@shikijs/langs/cpp"),
  },
  {
    id: "csharp",
    name: "C#",
    aliases: ["c#", "cs"],
    import: () => import("@shikijs/langs/csharp"),
  },
  { id: "css", name: "CSS", import: () => import("@shikijs/langs/css") },
  { id: "diff", name: "Diff", import: () => import("@shikijs/langs/diff") },
  {
    id: "docker",
    name: "Dockerfile",
    aliases: ["dockerfile"],
    import: () => import("@shikijs/langs/docker"),
  },
  { id: "go", name: "Go", import: () => import("@shikijs/langs/go") },
  { id: "html", name: "HTML", import: () => import("@shikijs/langs/html") },
  { id: "java", name: "Java", import: () => import("@shikijs/langs/java") },
  {
    id: "javascript",
    name: "JavaScript",
    aliases: ["js", "cjs", "mjs"],
    import: () => import("@shikijs/langs/javascript"),
  },
  { id: "json", name: "JSON", import: () => import("@shikijs/langs/json") },
  { id: "jsx", name: "JSX", import: () => import("@shikijs/langs/jsx") },
  {
    id: "kotlin",
    name: "Kotlin",
    aliases: ["kt", "kts"],
    import: () => import("@shikijs/langs/kotlin"),
  },
  {
    id: "markdown",
    name: "Markdown",
    aliases: ["md"],
    import: () => import("@shikijs/langs/markdown"),
  },
  { id: "php", name: "PHP", import: () => import("@shikijs/langs/php") },
  {
    id: "python",
    name: "Python",
    aliases: ["py"],
    import: () => import("@shikijs/langs/python"),
  },
  {
    id: "ruby",
    name: "Ruby",
    aliases: ["rb"],
    import: () => import("@shikijs/langs/ruby"),
  },
  {
    id: "rust",
    name: "Rust",
    aliases: ["rs"],
    import: () => import("@shikijs/langs/rust"),
  },
  { id: "scss", name: "SCSS", import: () => import("@shikijs/langs/scss") },
  {
    id: "shellscript",
    name: "Shell",
    aliases: ["bash", "sh", "shell", "zsh"],
    import: () => import("@shikijs/langs/shellscript"),
  },
  { id: "sql", name: "SQL", import: () => import("@shikijs/langs/sql") },
  { id: "swift", name: "Swift", import: () => import("@shikijs/langs/swift") },
  { id: "toml", name: "TOML", import: () => import("@shikijs/langs/toml") },
  {
    id: "tsx",
    name: "TSX",
    import: () => import("@shikijs/langs/tsx"),
  },
  {
    id: "typescript",
    name: "TypeScript",
    aliases: ["ts", "cts", "mts"],
    import: () => import("@shikijs/langs/typescript"),
  },
  { id: "vue", name: "Vue", import: () => import("@shikijs/langs/vue") },
  { id: "xml", name: "XML", import: () => import("@shikijs/langs/xml") },
  {
    id: "yaml",
    name: "YAML",
    aliases: ["yml"],
    import: () => import("@shikijs/langs/yaml"),
  },
] as const

export const bundledLanguagesBase = Object.fromEntries(
  bundledLanguagesInfo.map((lang) => [lang.id, lang.import])
)

export const bundledLanguagesAlias = Object.fromEntries(
  bundledLanguagesInfo.flatMap((lang) =>
    ("aliases" in lang ? lang.aliases : []).map((alias) => [
      alias,
      lang.import,
    ])
  )
)

export const bundledLanguages = {
  ...bundledLanguagesBase,
  ...bundledLanguagesAlias,
}

export const bundledThemes = {
  "github-light": () => import("@shikijs/themes/github-light"),
  "github-dark": () => import("@shikijs/themes/github-dark"),
}

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine({ forgiving: true }),
})

export const {
  codeToHtml,
  codeToHast,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = createSingletonShorthands(createHighlighter, { guessEmbeddedLanguages })
