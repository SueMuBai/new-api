/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Copy, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  DataTableBulkActions,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { getEnabledModels } from '@/features/channels/api'
import { safeJsonParse } from '../utils/json-parser'
import {
  buildModelSnapshots,
  getModeLabel,
  getModeVariant,
  getPriceDetail,
  getPriceSummary,
  type ModelPricingSnapshot,
} from './model-pricing-snapshots'
import { formatPricingNumber } from './pricing-format'

export type ModelPricingCoverageMode = 'missing-pricing' | 'unused-pricing'

export type ModelPricingCoverageValues = {
  ModelPrice: string
  ModelRatio: string
  CacheRatio: string
  CreateCacheRatio: string
  CompletionRatio: string
  ImageRatio: string
  AudioRatio: string
  AudioCompletionRatio: string
  ExposeRatioEnabled: boolean
  BillingMode: string
  BillingExpr: string
}

type ModelPricingCoverageOperationsProps = {
  mode: ModelPricingCoverageMode
  values: ModelPricingCoverageValues
  onCommit: (values: ModelPricingCoverageValues) => Promise<void>
  isSaving: boolean
}

type NumericPricingField =
  | 'ModelPrice'
  | 'ModelRatio'
  | 'CacheRatio'
  | 'CreateCacheRatio'
  | 'CompletionRatio'
  | 'ImageRatio'
  | 'AudioRatio'
  | 'AudioCompletionRatio'

type StringPricingField = 'BillingMode' | 'BillingExpr'

type PricingMaps = Record<NumericPricingField, Record<string, number>> &
  Record<StringPricingField, Record<string, string>>

type MissingPricingRow = {
  name: string
}

const numericPricingFields: NumericPricingField[] = [
  'ModelPrice',
  'ModelRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'CompletionRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
]

const stringPricingFields: StringPricingField[] = ['BillingMode', 'BillingExpr']

const allPricingFields = [...numericPricingFields, ...stringPricingFields]

const normalizeModelName = (name: string) => name.trim()

const sortByName = (a: string, b: string) => a.localeCompare(b)

const numericDraftRegex = /^(\d+(\.\d*)?|\.\d*)?$/

function parseInputPrice(inputPrice: string) {
  if (inputPrice.trim() === '') return null
  const priceNumber = Number(inputPrice)
  if (!Number.isFinite(priceNumber) || priceNumber < 0) return null
  return priceNumber
}

function stringifyMap<T extends number | string>(map: Record<string, T>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
    ),
    null,
    2
  )
}

function parsePricingMaps(values: ModelPricingCoverageValues): PricingMaps {
  return {
    ModelPrice: safeJsonParse<Record<string, number>>(values.ModelPrice, {
      fallback: {},
      silent: true,
    }),
    ModelRatio: safeJsonParse<Record<string, number>>(values.ModelRatio, {
      fallback: {},
      silent: true,
    }),
    CacheRatio: safeJsonParse<Record<string, number>>(values.CacheRatio, {
      fallback: {},
      silent: true,
    }),
    CreateCacheRatio: safeJsonParse<Record<string, number>>(
      values.CreateCacheRatio,
      {
        fallback: {},
        silent: true,
      }
    ),
    CompletionRatio: safeJsonParse<Record<string, number>>(
      values.CompletionRatio,
      {
        fallback: {},
        silent: true,
      }
    ),
    ImageRatio: safeJsonParse<Record<string, number>>(values.ImageRatio, {
      fallback: {},
      silent: true,
    }),
    AudioRatio: safeJsonParse<Record<string, number>>(values.AudioRatio, {
      fallback: {},
      silent: true,
    }),
    AudioCompletionRatio: safeJsonParse<Record<string, number>>(
      values.AudioCompletionRatio,
      {
        fallback: {},
        silent: true,
      }
    ),
    BillingMode: safeJsonParse<Record<string, string>>(values.BillingMode, {
      fallback: {},
      silent: true,
    }),
    BillingExpr: safeJsonParse<Record<string, string>>(values.BillingExpr, {
      fallback: {},
      silent: true,
    }),
  }
}

function serializePricingValues(
  values: ModelPricingCoverageValues,
  maps: PricingMaps
): ModelPricingCoverageValues {
  return {
    ...values,
    ModelPrice: stringifyMap(maps.ModelPrice),
    ModelRatio: stringifyMap(maps.ModelRatio),
    CacheRatio: stringifyMap(maps.CacheRatio),
    CreateCacheRatio: stringifyMap(maps.CreateCacheRatio),
    CompletionRatio: stringifyMap(maps.CompletionRatio),
    ImageRatio: stringifyMap(maps.ImageRatio),
    AudioRatio: stringifyMap(maps.AudioRatio),
    AudioCompletionRatio: stringifyMap(maps.AudioCompletionRatio),
    BillingMode: stringifyMap(maps.BillingMode),
    BillingExpr: stringifyMap(maps.BillingExpr),
  }
}

function deleteModelPricingFromMaps(maps: PricingMaps, names: string[]) {
  for (const name of names) {
    for (const field of allPricingFields) {
      delete maps[field][name]
    }
  }
}

function copySourcePricing(
  values: ModelPricingCoverageValues,
  sourceName: string,
  targetNames: string[]
) {
  const maps = parsePricingMaps(values)

  for (const targetName of targetNames) {
    deleteModelPricingFromMaps(maps, [targetName])

    for (const field of numericPricingFields) {
      if (Object.prototype.hasOwnProperty.call(maps[field], sourceName)) {
        maps[field][targetName] = maps[field][sourceName]
      }
    }
    for (const field of stringPricingFields) {
      if (Object.prototype.hasOwnProperty.call(maps[field], sourceName)) {
        maps[field][targetName] = maps[field][sourceName]
      }
    }
  }

  return serializePricingValues(values, maps)
}

function setInputPricePricing(
  values: ModelPricingCoverageValues,
  targetNames: string[],
  inputPrice: string
) {
  const priceNumber = parseInputPrice(inputPrice)
  if (priceNumber === null) return null

  const maps = parsePricingMaps(values)
  const ratio = Number(formatPricingNumber(priceNumber / 2))

  for (const targetName of targetNames) {
    deleteModelPricingFromMaps(maps, [targetName])
    maps.ModelRatio[targetName] = ratio
  }

  return serializePricingValues(values, maps)
}

function deletePricing(
  values: ModelPricingCoverageValues,
  targetNames: string[]
) {
  const maps = parsePricingMaps(values)
  deleteModelPricingFromMaps(maps, targetNames)
  return serializePricingValues(values, maps)
}

function buildPricingRows(values: ModelPricingCoverageValues) {
  return buildModelSnapshots({
    modelPrice: values.ModelPrice,
    modelRatio: values.ModelRatio,
    cacheRatio: values.CacheRatio,
    createCacheRatio: values.CreateCacheRatio,
    completionRatio: values.CompletionRatio,
    imageRatio: values.ImageRatio,
    audioRatio: values.AudioRatio,
    audioCompletionRatio: values.AudioCompletionRatio,
    billingMode: values.BillingMode,
    billingExpr: values.BillingExpr,
  }).sort((a, b) => a.name.localeCompare(b.name))
}

function SelectionCheckbox({
  checked,
  indeterminate,
  onCheckedChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(value) => onCheckedChange(Boolean(value))}
      aria-label={label}
      className='translate-y-[2px]'
    />
  )
}

export function ModelPricingCoverageOperations({
  mode,
  values,
  onCommit,
  isSaving,
}: ModelPricingCoverageOperationsProps) {
  const { t } = useTranslation()
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [sourceName, setSourceName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTargetNames, setDialogTargetNames] = useState<string[]>([])
  const [dialogInputPrice, setDialogInputPrice] = useState('')
  const [missingRowSelection, setMissingRowSelection] =
    useState<RowSelectionState>({})
  const [missingSorting, setMissingSorting] = useState<SortingState>([])
  const [missingGlobalFilter, setMissingGlobalFilter] = useState('')
  const [missingPagination, setMissingPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })

  const enabledModelsQuery = useQuery({
    queryKey: ['enabled-channel-models'],
    queryFn: getEnabledModels,
  })

  const pricingRows = useMemo(() => buildPricingRows(values), [values])
  const pricingNames = useMemo(
    () => new Set(pricingRows.map((row) => normalizeModelName(row.name))),
    [pricingRows]
  )
  const channelModelNames = useMemo(() => {
    const enabledModels =
      enabledModelsQuery.data?.success && enabledModelsQuery.data.data
        ? enabledModelsQuery.data.data
        : []

    return Array.from(
      new Set(enabledModels.map((name) => normalizeModelName(name)))
    )
      .filter(Boolean)
      .sort(sortByName)
  }, [enabledModelsQuery.data])
  const channelNameSet = useMemo(
    () => new Set(channelModelNames),
    [channelModelNames]
  )

  const missingModels = useMemo(
    () => channelModelNames.filter((name) => !pricingNames.has(name)),
    [channelModelNames, pricingNames]
  )
  const missingRows = useMemo(
    () => missingModels.map((name) => ({ name })),
    [missingModels]
  )
  const unusedRows = useMemo(
    () => pricingRows.filter((row) => !channelNameSet.has(row.name)),
    [channelNameSet, pricingRows]
  )
  const itemNames = useMemo(
    () =>
      mode === 'missing-pricing'
        ? missingModels
        : unusedRows.map((row) => row.name),
    [missingModels, mode, unusedRows]
  )
  const unusedRowByName = useMemo(
    () => new Map(unusedRows.map((row) => [row.name, row])),
    [unusedRows]
  )
  const hasChannelModelData =
    enabledModelsQuery.isSuccess && Boolean(enabledModelsQuery.data?.success)
  const isChannelModelUnavailable =
    enabledModelsQuery.isError ||
    (enabledModelsQuery.isSuccess && !enabledModelsQuery.data?.success)

  const effectiveSelectedNames = useMemo(
    () => selectedNames.filter((name) => itemNames.includes(name)),
    [itemNames, selectedNames]
  )
  const effectiveSourceName =
    sourceName && pricingRows.some((row) => row.name === sourceName)
      ? sourceName
      : (pricingRows[0]?.name ?? '')
  const selectedSet = useMemo(
    () => new Set(effectiveSelectedNames),
    [effectiveSelectedNames]
  )
  const allSelected =
    itemNames.length > 0 && itemNames.every((name) => selectedSet.has(name))
  const someSelected = effectiveSelectedNames.length > 0 && !allSelected

  const updateSelection = useCallback((name: string, checked: boolean) => {
    setSelectedNames((current) => {
      if (checked) return Array.from(new Set([...current, name]))
      return current.filter((item) => item !== name)
    })
  }, [])

  const setAllSelected = useCallback(
    (checked: boolean) => {
      setSelectedNames(checked ? itemNames : [])
    },
    [itemNames]
  )

  const openPricingDialog = useCallback(
    (names: string[]) => {
      const nextTargetNames = Array.from(new Set(names.filter(Boolean)))
      if (nextTargetNames.length === 0) {
        toast.error(t('Select at least one model'))
        return
      }

      setDialogTargetNames(nextTargetNames)
      setDialogInputPrice('')
      setDialogOpen(true)
    },
    [t]
  )

  const commitValues = useCallback(
    async (
      nextValues: ModelPricingCoverageValues,
      action: 'apply' | 'delete',
      count: number
    ) => {
      await onCommit(nextValues)
      setSelectedNames([])
      setMissingRowSelection({})
      toast.success(
        action === 'delete'
          ? t('Deleted pricing for {{count}} models', { count })
          : t('Applied pricing to {{count}} models', { count })
      )
    },
    [onCommit, t]
  )

  const applySource = useCallback(
    async (names: string[]) => {
      if (names.length === 0) {
        toast.error(t('Select at least one model'))
        return
      }
      if (!effectiveSourceName) {
        toast.error(t('Select a source model first'))
        return
      }

      await commitValues(
        copySourcePricing(values, effectiveSourceName, names),
        'apply',
        names.length
      )
      setDialogOpen(false)
    },
    [commitValues, effectiveSourceName, t, values]
  )

  const applyInputPrice = useCallback(
    async (names: string[], inputPrice: string) => {
      if (names.length === 0) {
        toast.error(t('Select at least one model'))
        return
      }

      const nextValues = setInputPricePricing(values, names, inputPrice)
      if (!nextValues) {
        toast.error(t('Enter a valid input price first'))
        return
      }

      await commitValues(nextValues, 'apply', names.length)
      setDialogOpen(false)
    },
    [commitValues, t, values]
  )

  const deleteSelectedPricing = useCallback(
    async (names: string[]) => {
      if (names.length === 0) {
        toast.error(t('Select at least one model'))
        return
      }

      await commitValues(deletePricing(values, names), 'delete', names.length)
    },
    [commitValues, t, values]
  )

  const missingColumns = useMemo<ColumnDef<MissingPricingRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <SelectionCheckbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
            label={t('Select all')}
          />
        ),
        cell: ({ row }) => (
          <SelectionCheckbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value)}
            label={t('Select row')}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { label: t('Select') },
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model name')} />
        ),
        cell: ({ row }) => (
          <div className='font-medium break-all'>{row.original.name}</div>
        ),
        enableHiding: false,
      },
      {
        id: 'actions',
        header: () => <div className='text-right'>{t('Actions')}</div>,
        cell: ({ row }) => (
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => openPricingDialog([row.original.name])}
              aria-label={t('Edit')}
              title={t('Edit')}
            >
              <Pencil data-icon='inline-start' />
            </Button>
          </div>
        ),
        enableHiding: false,
      },
    ],
    [openPricingDialog, t]
  )

  const missingTable = useReactTable({
    data: missingRows,
    columns: missingColumns,
    getRowId: (row) => row.name,
    state: {
      rowSelection: missingRowSelection,
      sorting: missingSorting,
      globalFilter: missingGlobalFilter,
      pagination: missingPagination,
    },
    enableRowSelection: true,
    onRowSelectionChange: setMissingRowSelection,
    onSortingChange: setMissingSorting,
    onGlobalFilterChange: setMissingGlobalFilter,
    onPaginationChange: setMissingPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const searchValue = String(filterValue).toLowerCase()
      return row.original.name.toLowerCase().includes(searchValue)
    },
  })

  const title =
    mode === 'missing-pricing'
      ? t('Channel models missing pricing')
      : t('Pricing without channel models')
  const description =
    mode === 'missing-pricing'
      ? t(
          'Quickly configure enabled channel models that do not have model pricing.'
        )
      : t(
          'Quickly delete pricing entries for models that are not enabled in channels.'
        )

  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-wrap items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h3 className='text-base font-medium'>{title}</h3>
            <StatusBadge
              label={String(itemNames.length)}
              variant={itemNames.length > 0 ? 'warning' : 'success'}
              copyable={false}
              showDot={false}
            />
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>{description}</p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {isChannelModelUnavailable
              ? t('Unable to load enabled channel models.')
              : enabledModelsQuery.isLoading
                ? t('Loading current models...')
                : t('{{count}} enabled channel models', {
                    count: channelModelNames.length,
                  })}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => void enabledModelsQuery.refetch()}
          disabled={enabledModelsQuery.isFetching}
        >
          <RefreshCw
            data-icon='inline-start'
            className={cn(enabledModelsQuery.isFetching && 'animate-spin')}
          />
          {t('Refresh')}
        </Button>
      </div>

      {mode === 'missing-pricing' ? (
        <>
          {!hasChannelModelData ? (
            <div className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'>
              {enabledModelsQuery.isLoading
                ? t('Loading current models...')
                : t('Unable to load enabled channel models.')}
            </div>
          ) : missingRows.length === 0 ? (
            <div className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'>
              {t('No channel models are missing pricing.')}
            </div>
          ) : (
            <div className='flex min-w-0 flex-col gap-3'>
              <DataTableToolbar
                table={missingTable}
                searchPlaceholder={t('Search models...')}
                hideViewOptions
              />

              {missingTable.getRowModel().rows.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center'>
                  {t('No models match your search')}
                </div>
              ) : (
                <div className='min-h-0 overflow-auto rounded-md border'>
                  <table className='w-full caption-bottom text-sm tabular-nums'>
                    <thead>
                      {missingTable.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id} className='border-b'>
                          {headerGroup.headers.map((header) => (
                            <th
                              key={header.id}
                              colSpan={header.colSpan}
                              className={cn(
                                'bg-background text-foreground sticky top-0 z-10 h-10 px-2 text-left align-middle text-sm font-medium whitespace-nowrap',
                                header.column.id === 'actions' &&
                                  'right-0 z-30 w-24 min-w-24 text-right shadow-[-10px_0_14px_-14px_hsl(var(--foreground))]'
                              )}
                            >
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {missingTable.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          data-state={
                            row.getIsSelected() ? 'selected' : undefined
                          }
                          className='hover:bg-muted/50 data-[state=selected]:bg-muted group border-b transition-colors'
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td
                              key={cell.id}
                              className={cn(
                                'p-2 align-middle text-sm whitespace-nowrap',
                                cell.column.id === 'actions' &&
                                  'bg-background group-hover:bg-muted/50 group-data-[state=selected]:bg-muted sticky right-0 z-10 w-24 min-w-24 shadow-[-10px_0_14px_-14px_hsl(var(--foreground))]'
                              )}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {missingTable.getRowModel().rows.length > 0 && (
                <DataTablePagination table={missingTable} />
              )}

              <DataTableBulkActions
                table={missingTable}
                entityName={t('model')}
              >
                <Button
                  type='button'
                  size='sm'
                  onClick={() =>
                    openPricingDialog(
                      missingTable
                        .getFilteredSelectedRowModel()
                        .rows.map((row) => row.original.name)
                    )
                  }
                >
                  <Pencil data-icon='inline-start' />
                  {t('Configure selected')}
                </Button>
              </DataTableBulkActions>
            </div>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className='sm:max-w-lg'>
              <DialogHeader>
                <DialogTitle>
                  {t('Configure missing model pricing')}
                </DialogTitle>
                <DialogDescription>
                  {t('{{count}} selected models', {
                    count: dialogTargetNames.length,
                  })}
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <Field>
                  <FieldLabel>{t('Source model')}</FieldLabel>
                  <NativeSelect
                    className='w-full'
                    value={effectiveSourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    disabled={pricingRows.length === 0 || isSaving}
                  >
                    {pricingRows.length === 0 ? (
                      <NativeSelectOption value=''>
                        {t('No model prices configured')}
                      </NativeSelectOption>
                    ) : (
                      pricingRows.map((row) => (
                        <NativeSelectOption key={row.name} value={row.name}>
                          {row.name}
                        </NativeSelectOption>
                      ))
                    )}
                  </NativeSelect>
                  <FieldDescription>
                    {t(
                      'Copy the selected source model pricing to every target model.'
                    )}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>{t('Input price')}</FieldLabel>
                  <Input
                    inputMode='decimal'
                    value={dialogInputPrice}
                    placeholder='3'
                    onChange={(event) => {
                      const value = event.target.value
                      if (numericDraftRegex.test(value)) {
                        setDialogInputPrice(value)
                      }
                    }}
                    disabled={isSaving}
                  />
                  <FieldDescription>
                    {t('USD price per 1M input tokens.')}
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <DialogFooter>
                <DialogClose render={<Button variant='outline' />}>
                  {t('Cancel')}
                </DialogClose>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => void applySource(dialogTargetNames)}
                  disabled={
                    isSaving ||
                    dialogTargetNames.length === 0 ||
                    !effectiveSourceName
                  }
                >
                  <Copy data-icon='inline-start' />
                  {t('Copy source pricing')}
                </Button>
                <Button
                  type='button'
                  onClick={() =>
                    void applyInputPrice(dialogTargetNames, dialogInputPrice)
                  }
                  disabled={
                    isSaving ||
                    dialogTargetNames.length === 0 ||
                    dialogInputPrice.trim() === ''
                  }
                >
                  <Save data-icon='inline-start' />
                  {t('Apply input price')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <div className='flex justify-end'>
            <Button
              type='button'
              size='sm'
              variant='destructive'
              onClick={() => void deleteSelectedPricing(effectiveSelectedNames)}
              disabled={isSaving || effectiveSelectedNames.length === 0}
            >
              <Trash2 data-icon='inline-start' />
              {t('Delete selected')}
            </Button>
          </div>

          {!hasChannelModelData ? (
            <div className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'>
              {enabledModelsQuery.isLoading
                ? t('Loading current models...')
                : t('Unable to load enabled channel models.')}
            </div>
          ) : itemNames.length === 0 ? (
            <div className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'>
              {t('No unused model pricing entries.')}
            </div>
          ) : (
            <div className='overflow-hidden rounded-md border'>
              <table className='w-full caption-bottom text-sm'>
                <thead>
                  <tr className='border-b'>
                    <th className='bg-background h-10 w-10 px-3 text-left align-middle'>
                      <SelectionCheckbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onCheckedChange={setAllSelected}
                        label={t('Select all')}
                      />
                    </th>
                    <th className='bg-background h-10 px-3 text-left align-middle font-medium whitespace-nowrap'>
                      {t('Model name')}
                    </th>
                    <th className='bg-background h-10 px-3 text-left align-middle font-medium whitespace-nowrap'>
                      {t('Mode')}
                    </th>
                    <th className='bg-background h-10 px-3 text-left align-middle font-medium whitespace-nowrap'>
                      {t('Price summary')}
                    </th>
                    <th className='bg-background h-10 px-3 text-right align-middle font-medium whitespace-nowrap'>
                      {t('Actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemNames.map((name) => {
                    const row = unusedRowByName.get(name)
                    return (
                      <tr key={name} className='hover:bg-muted/50 border-b'>
                        <td className='p-3 align-middle'>
                          <SelectionCheckbox
                            checked={selectedSet.has(name)}
                            onCheckedChange={(checked) =>
                              updateSelection(name, checked)
                            }
                            label={t('Select row')}
                          />
                        </td>
                        <td className='p-3 align-middle font-medium break-all'>
                          {name}
                        </td>
                        <td className='p-3 align-middle whitespace-nowrap'>
                          {row && (
                            <StatusBadge
                              label={t(getModeLabel(row.billingMode))}
                              variant={getModeVariant(row.billingMode)}
                              copyable={false}
                              showDot={false}
                              className='px-0'
                            />
                          )}
                        </td>
                        <td className='p-3 align-middle'>
                          {row && <PricingSummary row={row} />}
                        </td>
                        <td className='p-3 align-middle'>
                          <div className='flex justify-end gap-2'>
                            <Button
                              type='button'
                              size='sm'
                              variant='destructive'
                              onClick={() => void deleteSelectedPricing([name])}
                              disabled={isSaving}
                            >
                              <Trash2 data-icon='inline-start' />
                              {t('Delete')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PricingSummary({ row }: { row: ModelPricingSnapshot }) {
  const { t } = useTranslation()

  return (
    <div className='flex min-w-[180px] flex-col gap-1'>
      <span className='font-medium'>{getPriceSummary(row, t)}</span>
      <span className='text-muted-foreground max-w-[320px] truncate text-xs'>
        {getPriceDetail(row, t)}
      </span>
    </div>
  )
}
