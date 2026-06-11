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
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type PaginationState,
  type VisibilityState,
} from '@tanstack/react-table'
import { Eye, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatBytes, formatTimestampToDate, formatUseTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DataTableColumnHeader, DataTablePage } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { LongText } from '@/components/long-text'
import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from '@/features/usage-logs/components/logs-filter-toolbar'
import { getDefaultTimeRange } from '@/features/usage-logs/lib/utils'
import { getApiRequestLogs } from '../api'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import type { ApiRequestLog, GetApiRequestLogsParams } from '../types'

const apiRequestLogSettingsSchema = z.object({
  ApiRequestLogBodySizeKB: z.number().int().min(0),
  ApiRequestLogRequestCompactionLimitMB: z.number().int().min(0),
})

type ApiRequestLogSettingsValues = z.infer<typeof apiRequestLogSettingsSchema>

type ApiRequestLogsSectionProps = {
  defaultBodySizeKB: number
  defaultRequestCompactionLimitMB: number
}

type ApiRequestLogFilterValues = {
  startTime?: Date
  endTime?: Date
  userId?: string
  username?: string
  tokenName?: string
  modelName?: string
  channelId?: string
  path?: string
  statusCode?: string
  requestId?: string
  upstreamRequestId?: string
}

const EMPTY_LOGS: ApiRequestLog[] = []

function toTimestampSeconds(date?: Date) {
  return date ? Math.floor(date.getTime() / 1000) : undefined
}

function getDefaultFilters(): ApiRequestLogFilterValues {
  const { start, end } = getDefaultTimeRange()
  return { startTime: start, endTime: end }
}

function cleanText(value?: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function buildApiRequestLogParams(
  filters: ApiRequestLogFilterValues,
  pagination: PaginationState
): GetApiRequestLogsParams {
  return {
    p: pagination.pageIndex + 1,
    page_size: pagination.pageSize,
    user_id: cleanText(filters.userId),
    username: cleanText(filters.username),
    token_name: cleanText(filters.tokenName),
    model_name: cleanText(filters.modelName),
    channel_id: cleanText(filters.channelId),
    path: cleanText(filters.path),
    status_code: cleanText(filters.statusCode),
    request_id: cleanText(filters.requestId),
    upstream_request_id: cleanText(filters.upstreamRequestId),
    start_timestamp: toTimestampSeconds(filters.startTime),
    end_timestamp: toTimestampSeconds(filters.endTime),
  }
}

function getStatusVariant(statusCode: number): StatusVariant {
  if (statusCode >= 500) return 'danger'
  if (statusCode >= 400) return 'warning'
  if (statusCode >= 200 && statusCode < 300) return 'success'
  return 'neutral'
}

function hasActiveFilters(filters: ApiRequestLogFilterValues) {
  return Boolean(
    filters.userId ||
    filters.username ||
    filters.tokenName ||
    filters.modelName ||
    filters.channelId ||
    filters.path ||
    filters.statusCode ||
    filters.requestId ||
    filters.upstreamRequestId
  )
}

function BodyBlock(props: {
  title: string
  body: string
  truncated: boolean
  compactionFailed: boolean
}) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const body = props.body || ''
  const bodySize =
    typeof TextEncoder === 'undefined'
      ? body.length
      : new TextEncoder().encode(body).length

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <div className='flex min-w-0 items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <h4 className='text-sm font-medium'>{props.title}</h4>
          <StatusBadge
            label={formatBytes(bodySize)}
            variant='neutral'
            copyable={false}
          />
          {props.truncated && (
            <StatusBadge
              label={t('Truncated')}
              variant='warning'
              copyable={false}
            />
          )}
          {props.compactionFailed && (
            <StatusBadge
              label={t('Compaction failed')}
              variant='danger'
              copyable={false}
            />
          )}
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => copyToClipboard(body)}
          disabled={!body}
        >
          {t('Copy')}
        </Button>
      </div>
      <ScrollArea className='bg-muted/20 h-[280px] rounded-md border'>
        <pre className='min-h-full p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap'>
          {body || t('Empty')}
        </pre>
      </ScrollArea>
    </div>
  )
}

function DetailRow(props: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className='grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm'>
      <span className='text-muted-foreground text-xs'>{props.label}</span>
      <span
        className={cn(
          'min-w-0 text-xs break-all',
          props.mono && 'font-mono tabular-nums'
        )}
      >
        {props.value || '-'}
      </span>
    </div>
  )
}

function ApiRequestLogDetailDialog(props: {
  log: ApiRequestLog | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const log = props.log

  return (
    <Dialog
      open={Boolean(log)}
      onOpenChange={props.onOpenChange}
      title={t('API request log details')}
      contentClassName='sm:max-w-5xl'
      contentHeight='min(72vh, 760px)'
    >
      {log && (
        <div className='flex min-w-0 flex-col gap-4'>
          <div className='bg-muted/20 grid gap-2 rounded-md border p-3 sm:grid-cols-2'>
            <DetailRow
              label={t('Time')}
              value={formatTimestampToDate(log.created_at)}
              mono
            />
            <DetailRow
              label={t('User')}
              value={`${log.username || '-'} (#${log.user_id})`}
              mono
            />
            <DetailRow
              label={t('Token Name')}
              value={log.token_name || `#${log.token_id || '-'}`}
              mono
            />
            <DetailRow label={t('Model')} value={log.model_name} mono />
            <DetailRow
              label={t('Channel ID')}
              value={log.channel_id || '-'}
              mono
            />
            <DetailRow
              label={t('Status Code')}
              value={log.status_code || '-'}
              mono
            />
            <DetailRow
              label={t('Duration')}
              value={formatUseTime(log.use_time || 0)}
              mono
            />
            <DetailRow
              label={t('Stream')}
              value={log.is_stream ? t('Yes') : t('No')}
            />
            <DetailRow label={t('IP')} value={log.ip} mono />
            <DetailRow
              label={t('Request ID')}
              value={log.request_id || '-'}
              mono
            />
            <DetailRow
              label={t('Upstream Request ID')}
              value={log.upstream_request_id || '-'}
              mono
            />
            <DetailRow
              label={t('Path')}
              value={log.method ? `${log.method} ${log.path || '-'}` : log.path}
              mono
            />
            <DetailRow label={t('Query')} value={log.query} mono />
          </div>
          <div className='grid min-w-0 gap-4 lg:grid-cols-2'>
            <BodyBlock
              title={t('Request Body')}
              body={log.request_body}
              truncated={Boolean(log.request_truncated)}
              compactionFailed={Boolean(log.request_compaction_failed)}
            />
            <BodyBlock
              title={t('Response Body')}
              body={log.response_body}
              truncated={Boolean(log.response_truncated)}
              compactionFailed={Boolean(log.response_compaction_failed)}
            />
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function ApiRequestLogsSection(props: ApiRequestLogsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const settingsForm = useForm<ApiRequestLogSettingsValues>({
    resolver: zodResolver(apiRequestLogSettingsSchema),
    defaultValues: {
      ApiRequestLogBodySizeKB: props.defaultBodySizeKB,
      ApiRequestLogRequestCompactionLimitMB:
        props.defaultRequestCompactionLimitMB,
    },
  })
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [filters, setFilters] =
    useState<ApiRequestLogFilterValues>(getDefaultFilters)
  const [appliedFilters, setAppliedFilters] =
    useState<ApiRequestLogFilterValues>(getDefaultFilters)
  const [selectedLog, setSelectedLog] = useState<ApiRequestLog | null>(null)

  const params = useMemo(
    () => buildApiRequestLogParams(appliedFilters, pagination),
    [appliedFilters, pagination]
  )

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['api-request-logs', params, t],
    queryFn: async () => {
      const result = await getApiRequestLogs(params)
      if (!result.success) {
        toast.error(result.message || t('Failed to load API request logs'))
        return { items: [], total: 0 }
      }
      return {
        items: result.data?.items ?? [],
        total: result.data?.total ?? 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  useEffect(() => {
    settingsForm.reset({
      ApiRequestLogBodySizeKB: props.defaultBodySizeKB,
      ApiRequestLogRequestCompactionLimitMB:
        props.defaultRequestCompactionLimitMB,
    })
  }, [
    props.defaultBodySizeKB,
    props.defaultRequestCompactionLimitMB,
    settingsForm,
  ])

  const handleSettingsSubmit = async (values: ApiRequestLogSettingsValues) => {
    const updates: Array<{ key: string; value: number }> = []
    if (values.ApiRequestLogBodySizeKB !== props.defaultBodySizeKB) {
      updates.push({
        key: 'ApiRequestLogBodySizeKB',
        value: values.ApiRequestLogBodySizeKB,
      })
    }
    if (
      values.ApiRequestLogRequestCompactionLimitMB !==
      props.defaultRequestCompactionLimitMB
    ) {
      updates.push({
        key: 'ApiRequestLogRequestCompactionLimitMB',
        value: values.ApiRequestLogRequestCompactionLimitMB,
      })
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  const columns = useMemo<ColumnDef<ApiRequestLog>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[150px] flex-col gap-0.5'>
            <span className='font-mono text-xs tabular-nums'>
              {formatTimestampToDate(row.original.created_at)}
            </span>
            <span className='text-muted-foreground font-mono text-xs'>
              #{row.original.log_id || row.original.id}
            </span>
          </div>
        ),
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('User')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[140px] flex-col gap-0.5'>
            <LongText className='max-w-[160px] font-medium'>
              {row.original.username || '-'}
            </LongText>
            <span className='text-muted-foreground font-mono text-xs'>
              ID {row.original.user_id}
            </span>
          </div>
        ),
        meta: { label: t('User') },
      },
      {
        accessorKey: 'token_name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Token Name')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[120px] flex-col gap-0.5'>
            <LongText className='max-w-[150px]'>
              {row.original.token_name || '-'}
            </LongText>
            <span className='text-muted-foreground font-mono text-xs'>
              #{row.original.token_id || '-'}
            </span>
          </div>
        ),
        meta: { label: t('Token Name'), mobileHidden: true },
      },
      {
        accessorKey: 'model_name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[140px] flex-col gap-1'>
            <LongText className='max-w-[180px]'>
              {row.original.model_name || '-'}
            </LongText>
            <StatusBadge
              label={`${t('Channel ID')}: ${row.original.channel_id || '-'}`}
              variant='neutral'
              copyable={false}
            />
          </div>
        ),
        meta: { label: t('Model') },
      },
      {
        accessorKey: 'path',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Path')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[220px] items-center gap-2'>
            {row.original.method && (
              <StatusBadge
                label={row.original.method}
                variant='info'
                copyable={false}
              />
            )}
            <LongText className='max-w-[260px] font-mono text-xs'>
              {row.original.path || '-'}
            </LongText>
          </div>
        ),
        meta: { label: t('Path') },
      },
      {
        accessorKey: 'status_code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) => (
          <StatusBadge
            label={String(row.original.status_code || '-')}
            variant={getStatusVariant(row.original.status_code)}
            copyable={false}
          />
        ),
        meta: { label: t('Status'), mobileBadge: true },
      },
      {
        accessorKey: 'use_time',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Duration')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[90px] flex-col gap-1'>
            <span className='font-mono text-xs tabular-nums'>
              {formatUseTime(row.original.use_time || 0)}
            </span>
            <StatusBadge
              label={row.original.is_stream ? t('Stream') : t('Non-stream')}
              variant={row.original.is_stream ? 'blue' : 'neutral'}
              copyable={false}
            />
          </div>
        ),
        meta: { label: t('Duration'), mobileHidden: true },
      },
      {
        accessorKey: 'request_id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Request ID')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-[160px] flex-col gap-1'>
            <LongText className='max-w-[180px] font-mono text-xs'>
              {row.original.request_id || '-'}
            </LongText>
            {row.original.upstream_request_id && (
              <LongText className='text-muted-foreground max-w-[180px] font-mono text-xs'>
                {row.original.upstream_request_id}
              </LongText>
            )}
          </div>
        ),
        meta: { label: t('Request ID'), mobileHidden: true },
      },
      {
        id: 'details',
        header: t('Details'),
        cell: ({ row }) => (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setSelectedLog(row.original)}
          >
            <Eye data-icon='inline-start' />
            {t('View')}
          </Button>
        ),
        enableSorting: false,
        meta: { label: t('Details') },
      },
    ],
    [t]
  )

  const logs = data?.items ?? EMPTY_LOGS
  const table = useReactTable({
    data: logs,
    columns,
    state: {
      pagination,
      columnVisibility,
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: Math.ceil((data?.total || 0) / pagination.pageSize),
  })

  useEffect(() => {
    const pageCount = table.getPageCount()
    if (
      pagination.pageIndex > 0 &&
      pageCount > 0 &&
      pagination.pageIndex >= pageCount
    ) {
      setPagination((current) => ({
        ...current,
        pageIndex: Math.max(pageCount - 1, 0),
      }))
    }
  }, [pagination.pageIndex, table, data?.total])

  const handleChange = (
    field: keyof ApiRequestLogFilterValues,
    value: Date | string | undefined
  ) => {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const handleSearch = () => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
    setAppliedFilters(filters)
  }

  const handleReset = () => {
    const nextFilters = getDefaultFilters()
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch()
    }
  }

  const dateRangeFilter = (
    <LogsFilterField wide>
      <CompactDateTimeRangePicker
        start={filters.startTime}
        end={filters.endTime}
        onChange={({ start, end }) => {
          handleChange('startTime', start)
          handleChange('endTime', end)
        }}
      />
    </LogsFilterField>
  )

  const primaryFilters = (
    <>
      {dateRangeFilter}
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Username')}
          value={filters.username || ''}
          onChange={(event) => handleChange('username', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Token Name')}
          value={filters.tokenName || ''}
          onChange={(event) => handleChange('tokenName', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Model Name')}
          value={filters.modelName || ''}
          onChange={(event) => handleChange('modelName', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
    </>
  )

  const advancedFilters = (
    <>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('User ID')}
          value={filters.userId || ''}
          onChange={(event) => handleChange('userId', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Channel ID')}
          value={filters.channelId || ''}
          onChange={(event) => handleChange('channelId', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Path')}
          value={filters.path || ''}
          onChange={(event) => handleChange('path', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Status Code')}
          value={filters.statusCode || ''}
          onChange={(event) => handleChange('statusCode', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Request ID')}
          value={filters.requestId || ''}
          onChange={(event) => handleChange('requestId', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Upstream Request ID')}
          value={filters.upstreamRequestId || ''}
          onChange={(event) =>
            handleChange('upstreamRequestId', event.target.value)
          }
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
    </>
  )

  const advancedFilterCount = [
    filters.userId,
    filters.channelId,
    filters.path,
    filters.statusCode,
    filters.requestId,
    filters.upstreamRequestId,
  ].filter(Boolean).length
  const activeFilters =
    hasActiveFilters(filters) || Boolean(filters.startTime || filters.endTime)

  return (
    <>
      <SettingsSection title={t('API Request Log Settings')}>
        <Form {...settingsForm}>
          <SettingsForm
            onSubmit={settingsForm.handleSubmit(handleSettingsSubmit)}
          >
            <SettingsPageFormActions
              onSave={settingsForm.handleSubmit(handleSettingsSubmit)}
              isSaving={updateOption.isPending}
              saveLabel='Save API request log settings'
            />
            <FormField
              control={settingsForm.control}
              name='ApiRequestLogBodySizeKB'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('API request log body size')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ''
                            ? 0
                            : Number(event.target.value)
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Maximum request and response body size saved per usage log, in KB. Set 0 to save only the association without body content.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={settingsForm.control}
              name='ApiRequestLogRequestCompactionLimitMB'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('API request log request compaction limit')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ''
                            ? 0
                            : Number(event.target.value)
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Maximum request body size read for compaction before the saved log body size is applied, in MB. Requests larger than this are marked as compaction failed and then truncated.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsForm>
        </Form>
      </SettingsSection>

      <SettingsSection title={t('API Request Logs')}>
        <DataTablePage
          table={table}
          columns={columns}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyTitle={t('No API request logs found')}
          emptyDescription={t(
            'API request and response logs will appear here after logging is enabled for users.'
          )}
          skeletonKeyPrefix='api-request-log-skeleton'
          paginationInFooter={false}
          tableClassName='overflow-x-auto'
          tableHeaderClassName='bg-muted/30 sticky top-0 z-10'
          toolbar={
            <LogsFilterToolbar
              table={table}
              primaryFilters={primaryFilters}
              advancedFilters={advancedFilters}
              mobilePinnedFilters={dateRangeFilter}
              mobileFilters={
                <>
                  {primaryFilters}
                  {advancedFilters}
                </>
              }
              mobileFilterCount={advancedFilterCount}
              hasActiveFilters={activeFilters}
              hasAdvancedActiveFilters={advancedFilterCount > 0}
              advancedFilterCount={advancedFilterCount}
              searchLoading={isFetching}
              onSearch={handleSearch}
              onReset={handleReset}
              stats={
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => refetch()}
                >
                  <RefreshCw data-icon='inline-start' />
                  {t('Refresh')}
                </Button>
              }
            />
          }
        />
        <ApiRequestLogDetailDialog
          log={selectedLog}
          onOpenChange={(open) => {
            if (!open) setSelectedLog(null)
          }}
        />
      </SettingsSection>
    </>
  )
}
