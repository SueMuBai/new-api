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
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Pencil,
  RefreshCw,
  Settings2,
  Trash2,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSectionHeader,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import { GroupBadge } from '@/components/group-badge'
import { MultiSelect } from '@/components/multi-select'
import { StatusBadge } from '@/components/status-badge'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from '@/features/keys/components/api-key-group-combobox'
import { API_KEY_STATUSES, ERROR_MESSAGES } from '@/features/keys/constants'
import {
  getApiKeyFormSchema,
  transformApiKeyToFormDefaults,
  transformFormDataToPayload,
  type ApiKeyFormValues,
} from '@/features/keys/lib'
import type { ApiKey } from '@/features/keys/types'
import {
  deleteUserApiKey,
  getUserApiKeys,
  getUserGroupsByAdmin,
  getUserModelsByAdmin,
  updateUserApiKey,
} from '../api'

const USER_TOKEN_PAGE_SIZE = 5
const USER_GROUP_OPTION_VALUE = '__user_default_group__'

function getQuotaProgressColor(percentage: number): string {
  if (percentage <= 10) return '[&_[data-slot=progress-indicator]]:bg-rose-500'
  if (percentage <= 30) return '[&_[data-slot=progress-indicator]]:bg-amber-500'
  return '[&_[data-slot=progress-indicator]]:bg-emerald-500'
}

function IconButtonWithTooltip(props: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant={props.destructive ? 'destructive' : 'outline'}
            size='icon-sm'
            disabled={props.disabled}
            onClick={props.onClick}
          />
        }
      >
        {props.icon}
        <span className='sr-only'>{props.label}</span>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

function UserTokenCard(props: {
  token: ApiKey
  onEdit: (token: ApiKey) => void
  onDelete: (token: ApiKey) => void
}) {
  const { t } = useTranslation()
  const { token } = props
  const statusConfig = API_KEY_STATUSES[token.status]
  const totalQuota = token.used_quota + token.remain_quota
  const remainingPercent =
    totalQuota > 0 ? (token.remain_quota / totalQuota) * 100 : 0

  return (
    <div className='rounded-md border p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex min-w-0 items-center gap-2'>
            <span className='truncate text-sm font-medium'>{token.name}</span>
            {statusConfig && (
              <StatusBadge
                label={t(statusConfig.label)}
                variant={statusConfig.variant}
                copyable={false}
              />
            )}
          </div>
          <code className='text-muted-foreground block truncate font-mono text-xs'>
            {token.key || '-'}
          </code>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <IconButtonWithTooltip
            label={t('Edit API key')}
            icon={<Pencil className='size-4' />}
            onClick={() => props.onEdit(token)}
          />
          <IconButtonWithTooltip
            label={t('Delete API key')}
            icon={<Trash2 className='size-4' />}
            onClick={() => props.onDelete(token)}
            destructive
          />
        </div>
      </div>

      <div className='mt-3 grid gap-3 text-xs sm:grid-cols-2'>
        <div className='space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>{t('Group')}</span>
            <GroupBadge group={token.group} copyable={false} />
          </div>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>{t('Expires')}</span>
            <span className='text-muted-foreground font-mono tabular-nums'>
              {token.expired_time === -1
                ? t('Never')
                : formatTimestampToDate(token.expired_time)}
            </span>
          </div>
        </div>

        <div className='space-y-1.5'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>{t('Quota')}</span>
            {token.unlimited_quota ? (
              <StatusBadge
                label={t('Unlimited')}
                variant='neutral'
                copyable={false}
              />
            ) : (
              <span className='font-medium tabular-nums'>
                {formatQuota(token.remain_quota)}
                <span className='text-muted-foreground font-normal'>
                  {' / '}
                  {formatQuota(totalQuota)}
                </span>
              </span>
            )}
          </div>
          {!token.unlimited_quota && (
            <Progress
              value={remainingPercent}
              className={cn('h-1.5', getQuotaProgressColor(remainingPercent))}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function UserTokenEditDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  token: ApiKey | null
  groupOptions: ApiKeyGroupOption[]
  modelOptions: string[]
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = getApiKeyFormSchema(t)
  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: props.token
      ? transformApiKeyToFormDefaults(props.token)
      : undefined,
  })
  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const unlimitedQuota = form.watch('unlimited_quota')
  const selectedGroup = form.watch('group')

  useEffect(() => {
    if (props.open && props.token) {
      form.reset(transformApiKeyToFormDefaults(props.token))
    }
  }, [form, props.open, props.token])

  const onSubmit = async (data: ApiKeyFormValues) => {
    if (!props.token) return
    setIsSubmitting(true)
    try {
      const payload = transformFormDataToPayload(data)
      const result = await updateUserApiKey(
        props.userId,
        props.token.id,
        payload
      )
      if (result.success) {
        toast.success(t('API Key updated successfully'))
        props.onOpenChange(false)
        props.onSuccess()
      } else {
        toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
      }
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = () => {
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }

    const next = new Date()
    next.setMonth(next.getMonth() + months)
    next.setDate(next.getDate() + days)
    next.setHours(next.getHours() + hours)
    form.setValue('expired_time', next)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-[560px]'>
        <DialogHeader>
          <DialogTitle>{t('Update user API key')}</DialogTitle>
          <DialogDescription>
            {t("Change this user's API key group, quota, and expiration time.")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id='user-token-edit-form'
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className='max-h-[65vh] space-y-5 overflow-y-auto pr-1'
          >
            <div className='space-y-4'>
              <SideDrawerSectionHeader
                title={t('Basic Information')}
                description={t('Set API key basic information')}
                icon={<KeyRound className='size-4' />}
              />
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter a name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='group'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Group')}</FormLabel>
                    <FormControl>
                      <ApiKeyGroupCombobox
                        options={props.groupOptions}
                        value={field.value || USER_GROUP_OPTION_VALUE}
                        onValueChange={(value) =>
                          field.onChange(
                            value === USER_GROUP_OPTION_VALUE ? '' : value
                          )
                        }
                        placeholder={t('Select a group')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedGroup === 'auto' && (
                <FormField
                  control={form.control}
                  name='cross_group_retry'
                  render={({ field }) => (
                    <FormItem className={sideDrawerSwitchItemClassName()}>
                      <div className='flex flex-col gap-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Cross-group retry')}
                        </FormLabel>
                        <FormDescription className='text-xs'>
                          {t(
                            'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration Time')}</FormLabel>
                    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('Never expires')}
                          className='min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                        />
                      </FormControl>
                      <div className='grid grid-cols-4 gap-2 sm:flex'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 0)}
                        >
                          {t('Never')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(1, 0, 0)}
                        >
                          {t('1 Month')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 1, 0)}
                        >
                          {t('1 Day')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 1)}
                        >
                          {t('1 Hour')}
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='space-y-4'>
              <SideDrawerSectionHeader
                title={t('Quota Settings')}
                description={t('Set quota amount and limits')}
                icon={<WalletCards className='size-4' />}
              />
              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Quota ({{currency}})', { currency: currencyLabel })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          step={tokensOnly ? 1 : 0.01}
                          placeholder={
                            tokensOnly
                              ? t('Enter quota in tokens')
                              : t('Enter quota in {{currency}}', {
                                  currency: currencyLabel,
                                })
                          }
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <div className='flex flex-col gap-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='text-xs'>
                        {t('Enable unlimited quota for this API key')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className='space-y-4'>
              <SideDrawerSectionHeader
                title={t('Advanced Settings')}
                description={t('Set API key access restrictions')}
                icon={<Settings2 className='size-4' />}
              />
              <FormField
                control={form.control}
                name='model_limits'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Model Limits')}</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={props.modelOptions.map((model) => ({
                          label: model,
                          value: model,
                        }))}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder={t('Select models (empty for allow all)')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Limit which models can be used with this key')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='allow_ips'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('IP Whitelist (supports CIDR)')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className='min-h-20 resize-none'
                        placeholder={t(
                          'One IP per line (empty for no restriction)'
                        )}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>

        <DialogFooter>
          <DialogClose render={<Button variant='outline' />}>
            {t('Cancel')}
          </DialogClose>
          <Button
            type='submit'
            form='user-token-edit-form'
            disabled={isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UserTokensPanel({ userId }: { userId: number }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [editingToken, setEditingToken] = useState<ApiKey | null>(null)
  const [deletingToken, setDeletingToken] = useState<ApiKey | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const tokensQuery = useQuery({
    queryKey: ['admin-user-api-keys', userId, page],
    queryFn: async () => {
      const result = await getUserApiKeys(userId, {
        p: page,
        size: USER_TOKEN_PAGE_SIZE,
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to load user API keys')
      }
      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    enabled: userId > 0,
    placeholderData: (previousData) => previousData,
  })

  useEffect(() => {
    if (!tokensQuery.error) return
    const message =
      tokensQuery.error instanceof Error
        ? tokensQuery.error.message
        : 'Failed to load user API keys'
    toast.error(
      message === 'Failed to load user API keys' ? t(message) : message
    )
  }, [tokensQuery.error, t])

  const groupsQuery = useQuery({
    queryKey: ['admin-user-api-key-groups', userId],
    queryFn: () => getUserGroupsByAdmin(userId),
    enabled: userId > 0,
    staleTime: 5 * 60 * 1000,
  })

  const modelsQuery = useQuery({
    queryKey: ['admin-user-api-key-models', userId],
    queryFn: () => getUserModelsByAdmin(userId),
    enabled: userId > 0,
    staleTime: 5 * 60 * 1000,
  })

  const tokens = tokensQuery.data?.items || []
  const total = tokensQuery.data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / USER_TOKEN_PAGE_SIZE))
  const groupOptions: ApiKeyGroupOption[] = useMemo(() => {
    const groups = groupsQuery.data?.success ? groupsQuery.data.data || {} : {}
    return [
      {
        value: USER_GROUP_OPTION_VALUE,
        label: t('User Group'),
      },
      ...Object.entries(groups).map(([key, info]) => ({
        value: key,
        label: key,
        desc: info.desc || key,
        ratio: info.ratio,
      })),
    ]
  }, [groupsQuery.data, t])
  const modelOptions = modelsQuery.data?.success
    ? modelsQuery.data.data || []
    : []

  const handleDelete = async () => {
    if (!deletingToken) return

    setIsDeleting(true)
    try {
      const result = await deleteUserApiKey(userId, deletingToken.id)
      if (result.success) {
        toast.success(t('API Key deleted successfully'))
        setDeletingToken(null)
        if (tokens.length === 1 && page > 1) {
          setPage((current) => current - 1)
        } else {
          tokensQuery.refetch()
        }
      } else {
        toast.error(result.message || t(ERROR_MESSAGES.DELETE_FAILED))
      }
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-3'>
        <SideDrawerSectionHeader
          title={t('User API Keys')}
          description={t('View and manage API keys created by this user.')}
          icon={<KeyRound className='size-4' />}
        />
        <IconButtonWithTooltip
          label={t('Refresh API keys')}
          icon={
            <RefreshCw
              className={cn('size-4', tokensQuery.isFetching && 'animate-spin')}
            />
          }
          onClick={() => tokensQuery.refetch()}
          disabled={tokensQuery.isFetching}
        />
      </div>

      {tokensQuery.isLoading ? (
        <div className='space-y-2'>
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className='rounded-md border p-3'>
              <Skeleton className='h-4 w-40' />
              <Skeleton className='mt-2 h-3 w-56' />
              <Skeleton className='mt-4 h-8 w-full' />
            </div>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className='text-muted-foreground rounded-md border border-dashed p-4 text-sm'>
          {t('No API keys created by this user.')}
        </div>
      ) : (
        <div className='space-y-2'>
          {tokens.map((token) => (
            <UserTokenCard
              key={token.id}
              token={token}
              onEdit={setEditingToken}
              onDelete={setDeletingToken}
            />
          ))}
        </div>
      )}

      {total > USER_TOKEN_PAGE_SIZE && (
        <div className='flex items-center justify-between gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Page {{page}} of {{totalPages}}', { page, totalPages })}
          </span>
          <div className='flex items-center gap-1'>
            <IconButtonWithTooltip
              label={t('Previous page')}
              icon={<ChevronLeft className='size-4' />}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            />
            <IconButtonWithTooltip
              label={t('Next page')}
              icon={<ChevronRight className='size-4' />}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages}
            />
          </div>
        </div>
      )}

      <UserTokenEditDialog
        open={!!editingToken}
        onOpenChange={(open) => !open && setEditingToken(null)}
        userId={userId}
        token={editingToken}
        groupOptions={groupOptions}
        modelOptions={modelOptions}
        onSuccess={() => tokensQuery.refetch()}
      />

      <AlertDialog
        open={!!deletingToken}
        onOpenChange={(open) => !open && setDeletingToken(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete user API key?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This will permanently delete API key "{{name}}".', {
                name: deletingToken?.name || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
