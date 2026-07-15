// Phase 0 spike: verify BlockNote markdown round-trip stability for the docs
// editor migration. Run with: node scripts/blocknote-roundtrip-spike.mjs
import { ServerBlockNoteEditor } from "@blocknote/server-util"

const fixtures = {
  headings: `# 一级标题

## 二级标题 Heading

### 三级标题`,

  "inline-marks": `这是 **加粗**、*斜体*、~~删除线~~、\`行内代码\` 和 [链接](https://example.com)。

Mixed **bold with 中文** and *italic 文本*.`,

  lists: `- 第一项
- 第二项
  - 嵌套项 2.1
  - 嵌套项 2.2
- 第三项

1. 有序一
2. 有序二
   1. 嵌套 2.1
3. 有序三`,

  "task-list": `- [ ] 待办事项一
- [x] 已完成事项
- [ ] 待办 **加粗内容**`,

  table: `| 名称 | 数量 | 说明 |
| --- | --- | --- |
| 苹果 | 3 | 新鲜 |
| 香蕉 | 5 | **打折** |`,

  "code-block": `\`\`\`go
func main() {
	fmt.Println("hello, 世界")
}
\`\`\`

\`\`\`typescript
const x: number = 42
\`\`\`

\`\`\`
plain text fence
\`\`\``,

  blockquote: `> 这是一段引用
> 引用第二行

普通段落。`,

  divider: `第一段

---

第二段`,

  image: `前文段落。

![示例图片](https://example.com/a.png)

![](/api/files/doc_assets/abc123/pic.jpg)`,

  "mixed-doc": `# 项目周报

本周完成了 **文档模块** 的重构，详见 [设计稿](https://example.com/design)。

## 进展

1. 完成编辑器选型
2. 完成往返测试
   - 覆盖表格
   - 覆盖代码块

## 风险

> Markdown 往返可能有格式重排。

\`\`\`js
console.log("done")
\`\`\`

| 任务 | 状态 |
| --- | --- |
| 选型 | 完成 |

- [x] 评审通过
- [ ] 上线`,
}

function indent(text) {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")
}

function firstDifference(a, b) {
  const aLines = a.split("\n")
  const bLines = b.split("\n")
  const max = Math.max(aLines.length, bLines.length)
  for (let i = 0; i < max; i++) {
    if (aLines[i] !== bLines[i]) {
      return `    line ${i + 1}:\n      in : ${JSON.stringify(aLines[i] ?? "<missing>")}\n      out: ${JSON.stringify(bLines[i] ?? "<missing>")}`
    }
  }
  return "    (whitespace-only difference)"
}

const editor = ServerBlockNoteEditor.create()

let identical = 0
let normalized = 0
let unstable = 0

for (const [name, source] of Object.entries(fixtures)) {
  const blocks1 = await editor.tryParseMarkdownToBlocks(source)
  const pass1 = await editor.blocksToMarkdownLossy(blocks1)
  const blocks2 = await editor.tryParseMarkdownToBlocks(pass1)
  const pass2 = await editor.blocksToMarkdownLossy(blocks2)

  const sourceTrim = source.trim()
  const pass1Trim = pass1.trim()
  const pass2Trim = pass2.trim()

  if (pass1Trim !== pass2Trim) {
    unstable++
    console.log(`✗ ${name}: UNSTABLE (pass1 !== pass2, keeps drifting)`)
    console.log(firstDifference(pass1Trim, pass2Trim))
  } else if (sourceTrim === pass1Trim) {
    identical++
    console.log(`✓ ${name}: identical round-trip`)
  } else {
    normalized++
    console.log(`~ ${name}: normalized once, then stable`)
    console.log(firstDifference(sourceTrim, pass1Trim))
    console.log("  --- pass1 output ---")
    console.log(indent(pass1Trim))
  }
}

console.log(
  `\nSummary: ${identical} identical, ${normalized} normalized-but-stable, ${unstable} UNSTABLE / ${Object.keys(fixtures).length} fixtures`
)
if (unstable > 0) process.exitCode = 1
