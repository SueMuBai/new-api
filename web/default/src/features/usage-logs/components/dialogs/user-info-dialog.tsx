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
import { useCallback, useEffect, useState } from 'react'
import { Ban, KeyRound, Loader2, Power, PowerOff, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatQuota, formatCompactNumber } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import {
  batchManageUsers,
  deleteUserApiKey,
  manageUser,
  updateUserApiRequestLog,
} from '@/features/users/api'
import { USER_STATUS } from '@/features/users/constants'
import { getUserInfo } from '../../api'
import type { UserInfo } from '../../types'
import type { SelectedUserToken } from '../usage-logs-provider'

interface UserInfoDialogProps {
  userId: number | null
  currentToken?: SelectedUserToken | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PendingAction = 'delete-current-token' | 'delete-all-tokens'
type UserStatusAction = 'enable' | 'disable' | 'suspend'

export function UserInfoDialog({
  userId,
  currentToken,
  open,
  onOpenChange,
}: UserInfoDialogProps) {
  const { t } = useTranslation()
  const currentUserRole =
    useAuthStore((state) => state.auth.user?.role) ?? ROLE.GUEST
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  )

  const fetchUserInfo = useCallback(
    async (id: number) => {
      setIsLoading(true)
      try {
        const result = await getUserInfo(id)
        if (result.success) {
          setUserInfo(result.data || null)
        } else {
          toast.error(result.message || t('Failed to fetch user information'))
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch user info:', error)
        toast.error(t('Failed to fetch user information'))
      } finally {
        setIsLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    if (open && userId) {
      fetchUserInfo(userId)
    }
  }, [open, userId, fetchUserInfo])

  const InfoItem = ({
    label,
    value,
  }: {
    label: string
    value: string | number
  }) => (
    <div className='space-y-1.5'>
      <Label className='text-muted-foreground text-xs'>{label}</Label>
      <div className='text-sm font-semibold'>{value}</div>
    </div>
  )

  const refreshUserInfo = useCallback(async () => {
    if (!userId) return
    await fetchUserInfo(userId)
  }, [fetchUserInfo, userId])

  const handleUserAction = async (action: UserStatusAction) => {
    if (!userInfo) return
    setLoadingAction(action)
    try {
      const result = await manageUser(userInfo.id, action)
      if (result.success) {
        const messageKey =
          action === 'enable'
            ? 'User enabled successfully'
            : action === 'disable'
              ? 'User disabled successfully'
              : 'User suspended successfully'
        toast.success(t(messageKey))
        await refreshUserInfo()
      } else {
        toast.error(result.message || t('Failed to update user status'))
      }
    } catch (_error) {
      toast.error(t('Failed to update user status'))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleApiLogChange = async (checked: boolean) => {
    if (!userInfo) return
    setLoadingAction('api-log')
    try {
      const result = await updateUserApiRequestLog(userInfo.id, checked)
      if (result.success) {
        setUserInfo((previous) =>
          previous
            ? { ...previous, api_request_log_enabled: checked }
            : previous
        )
        toast.success(
          checked ? t('API logging enabled') : t('API logging disabled')
        )
      } else {
        toast.error(result.message || t('Failed to update API logging'))
      }
    } catch (_error) {
      toast.error(t('Failed to update API logging'))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleConfirmPendingAction = async () => {
    if (!userInfo || !pendingAction) return
    setLoadingAction(pendingAction)
    try {
      if (pendingAction === 'delete-current-token') {
        if (!currentToken?.tokenId) {
          toast.error(t('No token selected'))
          setPendingAction(null)
          return
        }
        const result = await deleteUserApiKey(userInfo.id, currentToken.tokenId)
        if (!result.success) {
          toast.error(result.message || t('Failed to delete current token'))
          return
        }
        toast.success(t('Current token deleted'))
      } else {
        const result = await batchManageUsers({
          ids: [userInfo.id],
          action: 'delete_tokens',
        })
        if (!result.success || (result.data?.failed_count ?? 0) > 0) {
          toast.error(result.message || t('Failed to delete tokens'))
          return
        }
        toast.success(t('All tokens deleted'))
      }
      setPendingAction(null)
      await refreshUserInfo()
    } catch (_error) {
      toast.error(
        pendingAction === 'delete-current-token'
          ? t('Failed to delete current token')
          : t('Failed to delete tokens')
      )
    } finally {
      setLoadingAction(null)
    }
  }

  const confirmDialogContent =
    pendingAction === 'delete-current-token'
      ? {
          title: t('Delete current token'),
          desc: t(
            'The token used by the selected log will stop working immediately. Continue?'
          ),
          confirmText: t('Delete current token'),
        }
      : pendingAction === 'delete-all-tokens'
        ? {
            title: t('Delete all tokens'),
            desc: t(
              "All existing tokens for this user will stop working immediately. The user's dashboard access remains available. Continue?"
            ),
            confirmText: t('Delete all tokens'),
          }
        : {
            title: '',
            desc: '',
            confirmText: '',
          }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('User Information')}
        description={t(
          'View detailed information about this user including balance, usage statistics, and invitation details.'
        )}
        contentClassName='sm:max-w-xl'
        contentHeight='auto'
        bodyClassName='space-y-4'
      >
        {isLoading ? (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='text-muted-foreground size-6 animate-spin' />
          </div>
        ) : userInfo ? (
          <div className='flex flex-col gap-4 py-4'>
            <div className='grid grid-cols-2 gap-4'>
              <InfoItem label={t('Username')} value={userInfo.username} />
              {userInfo.display_name && (
                <InfoItem
                  label={t('Display Name')}
                  value={userInfo.display_name}
                />
              )}
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <InfoItem
                label={t('Balance')}
                value={formatQuota(userInfo.quota)}
              />
              <InfoItem
                label={t('Used Quota')}
                value={formatQuota(userInfo.used_quota)}
              />
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <InfoItem
                label={t('Request Count')}
                value={formatCompactNumber(userInfo.request_count)}
              />
              {userInfo.group && (
                <InfoItem label={t('User Group')} value={userInfo.group} />
              )}
            </div>

            <div className='flex flex-col gap-2'>
              <Label className='text-muted-foreground text-xs'>
                {t('User actions')}
              </Label>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => handleUserAction('enable')}
                  disabled={
                    loadingAction != null ||
                    userInfo.status === USER_STATUS.ENABLED
                  }
                >
                  <Power data-icon='inline-start' />
                  {t('Enable')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => handleUserAction('disable')}
                  disabled={
                    loadingAction != null ||
                    userInfo.status === USER_STATUS.DISABLED ||
                    userInfo.role === ROLE.SUPER_ADMIN
                  }
                >
                  <PowerOff data-icon='inline-start' />
                  {t('Disable')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => handleUserAction('suspend')}
                  disabled={
                    loadingAction != null ||
                    userInfo.status === USER_STATUS.SUSPENDED ||
                    userInfo.role === ROLE.SUPER_ADMIN
                  }
                >
                  <Ban data-icon='inline-start' />
                  {t('Suspend')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => setPendingAction('delete-current-token')}
                  disabled={
                    loadingAction != null ||
                    !currentToken?.tokenId ||
                    (userInfo.role === ROLE.SUPER_ADMIN &&
                      currentUserRole !== ROLE.SUPER_ADMIN)
                  }
                >
                  <KeyRound data-icon='inline-start' />
                  {t('Delete current token')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => setPendingAction('delete-all-tokens')}
                  disabled={
                    loadingAction != null ||
                    (userInfo.role === ROLE.SUPER_ADMIN &&
                      currentUserRole !== ROLE.SUPER_ADMIN)
                  }
                >
                  <Trash2 data-icon='inline-start' />
                  {t('Delete all tokens')}
                </Button>
              </div>
            </div>

            {currentUserRole === ROLE.SUPER_ADMIN && (
              <div className='flex items-center justify-between gap-3 rounded-md border px-3 py-2'>
                <Label className='text-sm'>{t('API Logging')}</Label>
                <Switch
                  checked={Boolean(userInfo.api_request_log_enabled)}
                  disabled={loadingAction != null}
                  onCheckedChange={handleApiLogChange}
                  aria-label={t('Toggle API request logging')}
                />
              </div>
            )}

            {(userInfo.aff_code ||
              userInfo.aff_count !== undefined ||
              (userInfo.aff_quota !== undefined &&
                userInfo.aff_quota > 0)) && (
              <>
                <div className='grid grid-cols-2 gap-4'>
                  {userInfo.aff_code && (
                    <InfoItem
                      label={t('Invitation Code')}
                      value={userInfo.aff_code}
                    />
                  )}
                  {userInfo.aff_count !== undefined && (
                    <InfoItem
                      label={t('Invited Users')}
                      value={formatCompactNumber(userInfo.aff_count)}
                    />
                  )}
                </div>

                {userInfo.aff_quota !== undefined &&
                  userInfo.aff_quota > 0 && (
                    <InfoItem
                      label={t('Invitation Quota')}
                      value={formatQuota(userInfo.aff_quota)}
                    />
                  )}
              </>
            )}

            {userInfo.remark && (
              <div className='space-y-1.5'>
                <Label className='text-muted-foreground text-xs'>
                  {t('Remark')}
                </Label>
                <div className='text-sm leading-relaxed font-semibold break-words'>
                  {userInfo.remark}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            {t('No user information available')}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={pendingAction != null}
        onOpenChange={(nextOpen) => !nextOpen && setPendingAction(null)}
        title={confirmDialogContent.title}
        desc={confirmDialogContent.desc}
        confirmText={confirmDialogContent.confirmText}
        destructive
        isLoading={loadingAction === pendingAction}
        handleConfirm={handleConfirmPendingAction}
      />
    </>
  )
}
