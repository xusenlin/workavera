import type { FileUIPart, SourceDocumentUIPart } from "ai"
import { createContext, useContext, type RefObject } from "react"

export interface AttachmentsContext {
  files: (FileUIPart & { id: string })[]
  add: (files: File[] | FileList) => void
  remove: (id: string) => void
  clear: () => void
  openFileDialog: () => void
  fileInputRef: RefObject<HTMLInputElement | null>
}

export interface TextInputContext {
  value: string
  setInput: (value: string) => void
  clear: () => void
}

export interface PromptInputControllerProps {
  textInput: TextInputContext
  attachments: AttachmentsContext
  __registerFileInput: (
    ref: RefObject<HTMLInputElement | null>,
    open: () => void
  ) => void
}

export interface ReferencedSourcesContext {
  sources: (SourceDocumentUIPart & { id: string })[]
  add: (sources: SourceDocumentUIPart[] | SourceDocumentUIPart) => void
  remove: (id: string) => void
  clear: () => void
}

export const PromptInputController =
  createContext<PromptInputControllerProps | null>(null)
export const ProviderAttachmentsContext =
  createContext<AttachmentsContext | null>(null)
export const LocalAttachmentsContext = createContext<AttachmentsContext | null>(
  null
)
export const LocalReferencedSourcesContext =
  createContext<ReferencedSourcesContext | null>(null)

export const usePromptInputController = () => {
  const context = useContext(PromptInputController)
  if (!context) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use usePromptInputController()."
    )
  }
  return context
}

export const useProviderAttachments = () => {
  const context = useContext(ProviderAttachmentsContext)
  if (!context) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use useProviderAttachments()."
    )
  }
  return context
}

export const useOptionalPromptInputController = () =>
  useContext(PromptInputController)

export const usePromptInputAttachments = () => {
  const provider = useContext(ProviderAttachmentsContext)
  const local = useContext(LocalAttachmentsContext)
  const context = local ?? provider
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput or PromptInputProvider"
    )
  }
  return context
}

export const usePromptInputReferencedSources = () => {
  const context = useContext(LocalReferencedSourcesContext)
  if (!context) {
    throw new Error(
      "usePromptInputReferencedSources must be used within a LocalReferencedSourcesContext.Provider"
    )
  }
  return context
}
