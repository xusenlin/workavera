import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Download01Icon,
  FileUploadIcon,
  FolderLibraryIcon,
  Link04Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  Search02Icon,
} from "@hugeicons/core-free-icons"

import {
  DeleteResourceDialog,
  RenameResourceDialog,
  ResourceLinksDialog,
} from "@/components/resources/resource-dialogs"
import { ResourceIcon } from "@/components/resources/resource-icon"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatBytes,
  formatLabel,
  formatSizeLimit,
  openResourceFile,
  RESOURCE_ACCEPT,
  RESOURCE_TYPE_FILTERS,
  resourceErrorMessage,
  useResourceMaxSize,
  validateResourceFile,
  type Resource,
  type ResourceTypeFilter,
} from "@/lib/resources"
import { RESOURCES_PER_PAGE, useResourcesStore } from "@/store/resources"

type DialogKind = "rename" | "delete" | "links"

function formatCreated(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function ResourcesPage() {
  const resources = useResourcesStore((state) => state.resources)
  const loading = useResourcesStore((state) => state.loading)
  const error = useResourcesStore((state) => state.error)
  const type = useResourcesStore((state) => state.type)
  const page = useResourcesStore((state) => state.page)
  const totalItems = useResourcesStore((state) => state.totalItems)
  const totalPages = useResourcesStore((state) => state.totalPages)
  const fetchResources = useResourcesStore((state) => state.fetchResources)
  const upload = useResourcesStore((state) => state.upload)
  const [query, setQuery] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState(0)
  const maxSize = useResourceMaxSize()
  const [dialog, setDialog] = useState<{
    kind: DialogKind
    resource: Resource
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchResources({ query, page: 1 }).finally(() => setLoaded(true))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [fetchResources, query])

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      const invalid = validateResourceFile(file, maxSize)
      if (invalid) {
        toast.error(`${file.name}: ${invalid}`)
        continue
      }
      setUploading((count) => count + 1)
      try {
        await upload(file)
        toast.success(`Uploaded ${file.name}`)
      } catch (uploadError) {
        toast.error(
          `${file.name}: ${resourceErrorMessage(uploadError, "Upload failed.")}`
        )
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  const open = (resource: Resource, download: boolean) => {
    void openResourceFile(resource, download).catch((openError: unknown) => {
      toast.error(resourceErrorMessage(openError, "Could not open the file."))
    })
  }

  const dialogFor = (kind: DialogKind) =>
    dialog?.kind === kind ? dialog.resource : null
  const closeDialog = (isOpen: boolean) => {
    if (!isOpen) setDialog(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon
              icon={FolderLibraryIcon}
              strokeWidth={2}
              className="size-4"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
          <span className="text-sm text-muted-foreground">{totalItems}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a file once, then attach it in Chat with the + button or by
          typing #.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <HugeiconsIcon
            icon={Search02Icon}
            strokeWidth={2}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name…"
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onValueChange={(value) =>
            void fetchResources({
              type: value as ResourceTypeFilter,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-40" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPE_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={inputRef}
          type="file"
          accept={RESOURCE_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ""
            void uploadFiles(files)
          }}
        />
        <Button
          className="ml-auto"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
        >
          {uploading > 0 ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={FileUploadIcon} strokeWidth={2} />
          )}
          {uploading > 0 ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loaded && loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">
            {query.trim() || type !== "all"
              ? "No matching resources"
              : "No resources yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {query.trim() || type !== "all"
              ? "Try a different name or type."
              : `Upload documents, text, code, data, images, or archives up to ${formatSizeLimit(maxSize)}.`}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Name</TableHead>
                <TableHead className="hidden sm:table-cell">Format</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource) => (
                <TableRow key={resource.id}>
                  <TableCell className="max-w-0 min-w-0">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 text-left"
                      onClick={() => open(resource, false)}
                    >
                      <ResourceIcon
                        mediaType={resource.media_type}
                        className="text-muted-foreground"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:underline">
                          {resource.display_name}
                        </span>
                        {resource.display_name !== resource.original_name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {resource.original_name}
                          </span>
                        )}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatLabel(resource.media_type)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                    {formatBytes(resource.size)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatCreated(resource.created)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${resource.display_name}`}
                        >
                          <HugeiconsIcon
                            icon={MoreHorizontalIcon}
                            strokeWidth={2}
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => open(resource, true)}>
                          <HugeiconsIcon
                            icon={Download01Icon}
                            strokeWidth={2}
                          />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setDialog({ kind: "rename", resource })
                          }
                        >
                          <HugeiconsIcon
                            icon={PencilEdit02Icon}
                            strokeWidth={2}
                          />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDialog({ kind: "links", resource })}
                        >
                          <HugeiconsIcon icon={Link04Icon} strokeWidth={2} />
                          Download links
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setDialog({ kind: "delete", resource })
                          }
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {(page - 1) * RESOURCES_PER_PAGE + 1}–
              {(page - 1) * RESOURCES_PER_PAGE + resources.length} of{" "}
              {totalItems}
            </span>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text="Prev"
                    onClick={() => void fetchResources({ page: page - 1 })}
                    className={
                      page <= 1 || loading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                <span className="flex items-center px-2 text-xs text-muted-foreground tabular-nums">
                  {page} / {Math.max(1, totalPages)}
                </span>
                <PaginationItem>
                  <PaginationNext
                    text="Next"
                    onClick={() => void fetchResources({ page: page + 1 })}
                    className={
                      page >= totalPages || loading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}

      <RenameResourceDialog
        key={`rename-${dialogFor("rename")?.id}`}
        resource={dialogFor("rename")}
        onOpenChange={closeDialog}
      />
      <DeleteResourceDialog
        resource={dialogFor("delete")}
        onOpenChange={closeDialog}
      />
      <ResourceLinksDialog
        key={`links-${dialogFor("links")?.id}`}
        resource={dialogFor("links")}
        onOpenChange={closeDialog}
      />
    </div>
  )
}
