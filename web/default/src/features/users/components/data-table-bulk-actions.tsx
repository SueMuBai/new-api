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
import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { Ban, Coins, Power, PowerOff, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { batchManageUsers } from '../api'
import type {
  BatchManageUsersAction,
  BatchManageUsersPayload,
  BatchManageUsersResult,
  QuotaAdjustMode,
  User,
} from '../types'

interface DataTableBulkActionsProps {
  table: Table<User>
  selectedIds: number[]
  onClearSelection: () => void
  onSuccess: () => void
}

const quotaModes: { value: QuotaAdjustMode; labelKey: string }[] = [
  { value: 'add', labelKey: 'Add' },
  { value: 'subtract', labelKey: 'Subtract' },
  { value: 'override', labelKey: 'Reset' },
]

export function DataTableBulkActions({
  table,
  selectedIds,
  onClearSelection,
  onSuccess,
}: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const [enableOpen, setEnableOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [deleteTokensOpen, setDeleteTokensOpen] = useState(false)
  const [quotaOpen, setQuotaOpen] = useState(false)
  const [quotaMode, setQuotaMode] = useState<QuotaAdjustMode>('add')
  const [amount, setAmount] = useState('')
  const [loadingAction, setLoadingAction] =
    useState<BatchManageUsersAction | null>(null)

  const selectedCount = selectedIds.length
  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const parsedAmount = Number.parseFloat(amount)
  const normalizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0
  const quotaValue =
    quotaMode === 'override'
      ? parseQuotaFromDollars(normalizedAmount)
      : parseQuotaFromDollars(Math.abs(normalizedAmount))
  const canSubmitQuota =
    amount.trim() !== '' && (quotaMode === 'override' || quotaValue > 0)

  const resetQuotaForm = () => {
    setQuotaMode('add')
    setAmount('')
  }

  const showBatchResult = (data?: BatchManageUsersResult) => {
    if (!data) {
      toast.success(t('Batch operation completed'))
      return
    }
    if (data.failed_count > 0) {
      toast.error(
        t(
          'Batch operation completed: {{success}} succeeded, {{failed}} failed',
          {
            success: data.success_count,
            failed: data.failed_count,
          }
        )
      )
      return
    }
    toast.success(t('Batch operation completed'))
  }

  const handleBatchAction = async (
    payload: Omit<BatchManageUsersPayload, 'ids'>
  ) => {
    if (selectedIds.length === 0) return

    setLoadingAction(payload.action)
    try {
      const result = await batchManageUsers({
        ids: selectedIds,
        ...payload,
      })
      if (result.success) {
        showBatchResult(result.data)
        if ((result.data?.success_count ?? 0) > 0) {
          setEnableOpen(false)
          setDisableOpen(false)
          setSuspendOpen(false)
          setDeleteTokensOpen(false)
          setQuotaOpen(false)
          resetQuotaForm()
          onSuccess()
          onClearSelection()
        }
      } else {
        toast.error(result.message || t('Failed to run batch operation'))
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : t('Failed to run batch operation')
      )
    } finally {
      setLoadingAction(null)
    }
  }

  const handleQuotaOpenChange = (open: boolean) => {
    if (loadingAction === 'add_quota') return
    setQuotaOpen(open)
    if (!open) resetQuotaForm()
  }

  const handleConfirmQuota = () => {
    if (!canSubmitQuota) return
    handleBatchAction({
      action: 'add_quota',
      mode: quotaMode,
      value:
        quotaMode === 'override'
          ? Math.max(0, quotaValue)
          : Math.abs(quotaValue),
    })
  }

  const quotaPlaceholder = tokensOnly
    ? t('Enter amount in tokens')
    : t('Enter amount in {{currency}}', { currency: currencyLabel })

  return (
    <BulkActionsToolbar
      table={table}
      entityName='user'
      selectedCount={selectedCount}
      selectionLabel={t('users selected')}
      onClearSelection={onClearSelection}
    >
      <Button
        variant='outline'
        size='sm'
        onClick={() => setEnableOpen(true)}
        disabled={loadingAction !== null}
      >
        <Power data-icon='inline-start' />
        {t('Enable')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => setDisableOpen(true)}
        disabled={loadingAction !== null}
      >
        <Ban data-icon='inline-start' />
        {t('Disable')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => setSuspendOpen(true)}
        disabled={loadingAction !== null}
      >
        <PowerOff data-icon='inline-start' />
        {t('Suspend')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => setQuotaOpen(true)}
        disabled={loadingAction !== null}
      >
        <Coins data-icon='inline-start' />
        {t('Adjust Quota')}
      </Button>
      <Button
        variant='destructive'
        size='sm'
        onClick={() => setDeleteTokensOpen(true)}
        disabled={loadingAction !== null}
      >
        <Trash2 data-icon='inline-start' />
        {t('Delete tokens')}
      </Button>

      <ConfirmDialog
        open={enableOpen}
        onOpenChange={setEnableOpen}
        title={t('Enable selected users')}
        desc={t('Are you sure you want to enable {{count}} selected user(s)?', {
          count: selectedCount,
        })}
        confirmText={
          loadingAction === 'enable' ? t('Processing...') : t('Enable')
        }
        isLoading={loadingAction === 'enable'}
        handleConfirm={() => handleBatchAction({ action: 'enable' })}
      />

      <ConfirmDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title={t('Disable selected users')}
        desc={t(
          'Are you sure you want to disable {{count}} selected user(s)?',
          {
            count: selectedCount,
          }
        )}
        confirmText={
          loadingAction === 'disable' ? t('Processing...') : t('Disable')
        }
        isLoading={loadingAction === 'disable'}
        handleConfirm={() => handleBatchAction({ action: 'disable' })}
      />

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={t('Suspend selected users')}
        desc={t(
          'Existing tokens for {{count}} selected user(s) will stop working, but their dashboard access remains available.',
          { count: selectedCount }
        )}
        confirmText={
          loadingAction === 'suspend' ? t('Processing...') : t('Suspend')
        }
        isLoading={loadingAction === 'suspend'}
        handleConfirm={() => handleBatchAction({ action: 'suspend' })}
      />

      <ConfirmDialog
        open={deleteTokensOpen}
        onOpenChange={setDeleteTokensOpen}
        title={t("Delete selected users' tokens")}
        desc={t(
          'Are you sure you want to delete all tokens for {{count}} selected user(s)? This action cannot be undone.',
          { count: selectedCount }
        )}
        confirmText={
          loadingAction === 'delete_tokens'
            ? t('Processing...')
            : t('Delete tokens')
        }
        destructive
        isLoading={loadingAction === 'delete_tokens'}
        handleConfirm={() => handleBatchAction({ action: 'delete_tokens' })}
      />

      <Dialog
        open={quotaOpen}
        onOpenChange={handleQuotaOpenChange}
        title={t('Batch adjust quota')}
        description={t('Apply a quota change to {{count}} selected user(s)', {
          count: selectedCount,
        })}
        contentHeight='auto'
        bodyClassName='flex flex-col gap-4'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => handleQuotaOpenChange(false)}
              disabled={loadingAction === 'add_quota'}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleConfirmQuota}
              disabled={!canSubmitQuota || loadingAction === 'add_quota'}
            >
              {loadingAction === 'add_quota'
                ? t('Processing...')
                : t('Apply to selected users')}
            </Button>
          </>
        }
      >
        <div className='text-muted-foreground text-sm'>
          {amount.trim()
            ? t('Quota change per user: {{amount}}', {
                amount: formatQuota(quotaValue),
              })
            : t('Enter an amount to preview the quota change.')}
        </div>

        <div className='flex flex-col gap-2'>
          <Label>{t('Mode')}</Label>
          <div className='flex flex-wrap gap-1'>
            {quotaModes.map((mode) => (
              <Button
                key={mode.value}
                type='button'
                variant='outline'
                size='sm'
                className={cn(
                  quotaMode === mode.value &&
                    'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                )}
                onClick={() => {
                  setQuotaMode(mode.value)
                  setAmount('')
                }}
                disabled={loadingAction === 'add_quota'}
              >
                {t(mode.labelKey)}
              </Button>
            ))}
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Label>
            {t('Amount')} ({currencyLabel})
          </Label>
          <Input
            type='number'
            step={tokensOnly ? 1 : 0.000001}
            min={0}
            placeholder={quotaPlaceholder}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmQuota()
            }}
            disabled={loadingAction === 'add_quota'}
          />
        </div>
      </Dialog>
    </BulkActionsToolbar>
  )
}
