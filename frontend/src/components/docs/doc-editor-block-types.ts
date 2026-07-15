import {
  blockTypeSelectItems,
  useBlockNoteEditor,
  useDictionary,
  type BlockTypeSelectItem,
} from "@blocknote/react"

/**
 * Block types offered for conversion in the formatting toolbar and the drag
 * handle "Turn into" menu. Restricted to types present in the doc schema and
 * without toggle variants, whose collapsed state Markdown cannot persist.
 */
export function useMarkdownBlockTypeItems(): BlockTypeSelectItem[] {
  const editor = useBlockNoteEditor()
  const dict = useDictionary()
  return blockTypeSelectItems(dict).filter(
    (item) =>
      item.type in editor.schema.blockSchema && !item.props?.isToggleable
  )
}
