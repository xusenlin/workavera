import { SideMenuExtension } from "@blocknote/core/extensions"
import {
  DragHandleMenu,
  RemoveBlockItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from "@blocknote/react"

import { useMarkdownBlockTypeItems } from "@/components/docs/doc-editor-block-types"

/**
 * Drag handle menu for the docs editor. Replaces the default one, which
 * offers block colors that Markdown cannot persist, with a "Turn into"
 * conversion submenu.
 */
export function DocDragHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>Delete</RemoveBlockItem>
      <TurnIntoItem />
    </DragHandleMenu>
  )
}

function TurnIntoItem() {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()
  const items = useMarkdownBlockTypeItems()
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  })

  if (block === undefined) {
    return null
  }

  return (
    <Components.Generic.Menu.Root position="right" sub>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          Turn into
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub>
        {items.map((item) => {
          const Icon = item.icon
          const blockProps: Record<string, unknown> = block.props ?? {}
          const selected =
            block.type === item.type &&
            Object.entries(item.props ?? {}).every(
              ([key, value]) => blockProps[key] === value
            )
          return (
            <Components.Generic.Menu.Item
              key={item.name}
              className="bn-menu-item doc-turn-into-item"
              icon={<Icon size={16} />}
              checked={selected}
              onClick={() => {
                editor.updateBlock(block, {
                  type: item.type as never,
                  props: item.props as never,
                })
                editor.focus()
              }}
            >
              {item.name}
            </Components.Generic.Menu.Item>
          )
        })}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  )
}
