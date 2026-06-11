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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMediaQuery } from '@/hooks'
import { Check, Shuffle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { parseQuotaFromDollars } from '@/lib/format'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  DISABLED_ROW_DESKTOP,
  DISABLED_ROW_MOBILE,
  DataTablePage,
} from '@/components/data-table'
import { getGroups, getUsers, searchUsers } from '../api'
import {
  ERROR_MESSAGES,
  USER_STATUS,
  getUserStatusOptions,
  getUserRoleOptions,
  isUserDeleted,
} from '../constants'
import type {
  User,
  UserNumberFilterOperator,
  UserTextFilterOperator,
} from '../types'
import { DataTableBulkActions } from './data-table-bulk-actions'
import {
  DEFAULT_USER_NUMBER_FILTER_OPERATOR,
  DEFAULT_USER_TEXT_FILTER_OPERATOR,
  UsersAdvancedFilters,
  type UsersAdvancedFilterValues,
} from './users-advanced-filters'
import { useUsersColumns } from './users-columns'
import { useUsers } from './users-provider'

const route = getRouteApi('/_authenticated/users/')

function isDisabledUserRow(user: User) {
  return isUserDeleted(user) || user.status === USER_STATUS.DISABLED
}

const EMPTY_USERS: User[] = []

export function UsersTable() {
  const { t } = useTranslation()
  const columns = useUsersColumns()
  const { refreshTrigger, triggerRefresh } = useUsers()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const routeSearch = route.useSearch()
  const navigate = route.useNavigate()

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: routeSearch,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'role', searchKey: 'role', type: 'array' },
      {
        columnId: 'group',
        searchKey: 'group',
        type: 'array',
        serialize: (value) => (Array.isArray(value) ? value[0] : undefined),
        deserialize: (value) =>
          typeof value === 'string' && value.trim() !== '' ? [value] : [],
      },
    ],
  })
  const statusFilter =
    (columnFilters.find((filter) => filter.id === 'status')?.value as
      | string[]
      | undefined) ?? []
  const roleFilter =
    (columnFilters.find((filter) => filter.id === 'role')?.value as
      | string[]
      | undefined) ?? []
  const statusFilterValue = statusFilter[0] ?? ''
  const roleFilterValue = roleFilter[0] ?? ''
  const groupFilter =
    (
      columnFilters.find((filter) => filter.id === 'group')?.value as
        | string[]
        | undefined
    )?.[0] ?? ''
  const usernameOp =
    (routeSearch.usernameOp as UserTextFilterOperator | undefined) ??
    DEFAULT_USER_TEXT_FILTER_OPERATOR
  const usernameValue = routeSearch.usernameValue ?? ''
  const quotaOp =
    (routeSearch.quotaOp as UserNumberFilterOperator | undefined) ??
    DEFAULT_USER_NUMBER_FILTER_OPERATOR
  const quotaValue = routeSearch.quotaValue ?? ''
  const parsedQuotaValue = Number(quotaValue)
  const quotaValueInUnits =
    quotaValue.trim() !== '' && Number.isFinite(parsedQuotaValue)
      ? String(parseQuotaFromDollars(parsedQuotaValue))
      : ''
  const hasAppliedAdvancedFilters =
    usernameValue.trim() !== '' || quotaValueInUnits !== ''
  const hasAdvancedFilters =
    hasAppliedAdvancedFilters ||
    quotaValue.trim() !== '' ||
    usernameOp !== DEFAULT_USER_TEXT_FILTER_OPERATOR ||
    quotaOp !== DEFAULT_USER_NUMBER_FILTER_OPERATOR
  const searchUsersErrorMessage = t(ERROR_MESSAGES.SEARCH_FAILED)
  const loadUsersErrorMessage = t(ERROR_MESSAGES.LOAD_FAILED)

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
    staleTime: 5 * 60 * 1000,
  })
  const groups = groupsData?.data || []

  const advancedFilterValues = useMemo<UsersAdvancedFilterValues>(
    () => ({
      usernameOp,
      usernameValue,
      quotaOp,
      quotaValue,
    }),
    [quotaOp, quotaValue, usernameOp, usernameValue]
  )

  const handleAdvancedFiltersChange = useCallback(
    (values: Partial<UsersAdvancedFilterValues>) => {
      navigate({
        search: (prev) => {
          const next = { ...prev, page: undefined }

          if (values.usernameOp !== undefined) {
            next.usernameOp = values.usernameOp
          }
          if (values.usernameValue !== undefined) {
            next.usernameValue =
              values.usernameValue !== '' ? values.usernameValue : undefined
          }
          if (values.quotaOp !== undefined) {
            next.quotaOp = values.quotaOp
          }
          if (values.quotaValue !== undefined) {
            next.quotaValue =
              values.quotaValue !== '' ? values.quotaValue : undefined
          }

          return next
        },
      })
    },
    [navigate]
  )

  const resetAdvancedFilters = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        usernameOp: undefined,
        usernameValue: undefined,
        quotaOp: undefined,
        quotaValue: undefined,
      }),
    })
  }, [navigate])

  // Fetch data with React Query
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'users',
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      statusFilterValue,
      roleFilterValue,
      groupFilter,
      usernameOp,
      usernameValue,
      quotaOp,
      quotaValueInUnits,
      hasAppliedAdvancedFilters,
      searchUsersErrorMessage,
      loadUsersErrorMessage,
      refreshTrigger,
    ],
    queryFn: async () => {
      const hasFilter = Boolean(globalFilter?.trim())
      const hasColumnFilter =
        Boolean(statusFilterValue) ||
        Boolean(roleFilterValue) ||
        Boolean(groupFilter)
      const shouldSearch =
        hasFilter || hasColumnFilter || hasAppliedAdvancedFilters
      const params = {
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }

      const result = shouldSearch
        ? await searchUsers({
            ...params,
            keyword: globalFilter,
            status: statusFilterValue,
            role: roleFilterValue,
            group: groupFilter,
            username_op: usernameValue.trim() ? usernameOp : undefined,
            username_value: usernameValue,
            quota_op: quotaValueInUnits ? quotaOp : undefined,
            quota_value: quotaValueInUnits,
          })
        : await getUsers(params)

      if (!result.success) {
        toast.error(
          result.message ||
            (shouldSearch ? searchUsersErrorMessage : loadUsersErrorMessage)
        )
        return { items: [], total: 0 }
      }

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const users = data?.items ?? EMPTY_USERS
  const currentPageUserIds = useMemo(
    () => users.map((user) => String(user.id)),
    [users]
  )
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection).flatMap(([id, selected]) => {
        if (!selected) return []
        const userId = Number(id)
        return Number.isInteger(userId) && userId > 0 ? [userId] : []
      }),
    [rowSelection]
  )

  const handleSelectCurrentPage = useCallback(() => {
    setRowSelection((previous) => {
      const next = { ...previous }
      currentPageUserIds.forEach((id) => {
        next[id] = true
      })
      return next
    })
  }, [currentPageUserIds])

  const handleInvertCurrentPage = useCallback(() => {
    setRowSelection((previous) => {
      const next = { ...previous }
      currentPageUserIds.forEach((id) => {
        if (next[id]) {
          delete next[id]
        } else {
          next[id] = true
        }
      })
      return next
    })
  }, [currentPageUserIds])

  const handleClearAllSelection = useCallback(() => {
    setRowSelection({})
  }, [])

  const table = useReactTable({
    data: users,
    columns,
    getRowId: (row) => String(row.id),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
      pagination,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row, _columnId, filterValue) => {
      const searchValue = String(filterValue).toLowerCase()
      const fields = [
        row.getValue('username'),
        row.original.display_name,
        row.original.email,
        row.original.remark,
      ]
      return fields.some((field) =>
        String(field || '')
          .toLowerCase()
          .includes(searchValue)
      )
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    manualPagination: true,
    pageCount: Math.ceil((data?.total || 0) / pagination.pageSize),
  })

  const pageCount = table.getPageCount()
  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  const selectionActions = (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Button
        variant='outline'
        size='sm'
        onClick={handleSelectCurrentPage}
        disabled={currentPageUserIds.length === 0}
      >
        <Check data-icon='inline-start' />
        {t('Select current page')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={handleInvertCurrentPage}
        disabled={currentPageUserIds.length === 0}
      >
        <Shuffle data-icon='inline-start' />
        {t('Invert current page')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={handleClearAllSelection}
        disabled={selectedIds.length === 0}
      >
        <X data-icon='inline-start' />
        {t('Clear all selections')}
      </Button>
    </div>
  )

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No Users Found')}
      emptyDescription={t(
        'No users available. Try adjusting your search or filters.'
      )}
      skeletonKeyPrefix='users-skeleton'
      toolbarProps={{
        searchPlaceholder: t('Filter by username, name, email or remark...'),
        filters: [
          {
            columnId: 'status',
            title: t('Status'),
            options: getUserStatusOptions(t),
            singleSelect: true,
          },
          {
            columnId: 'role',
            title: t('Role'),
            options: getUserRoleOptions(t),
            singleSelect: true,
          },
          {
            columnId: 'group',
            title: t('Group'),
            options: groups.map((group) => ({
              label: group,
              value: group,
            })),
            singleSelect: true,
          },
        ],
        expandable: (
          <UsersAdvancedFilters
            values={advancedFilterValues}
            onChange={handleAdvancedFiltersChange}
          />
        ),
        hasAdditionalFilters: hasAdvancedFilters,
        hasExpandedActiveFilters: hasAdvancedFilters,
        onReset: resetAdvancedFilters,
        leftActions: selectionActions,
      }}
      getRowClassName={(row, { isMobile }) =>
        isDisabledUserRow(row.original)
          ? isMobile
            ? DISABLED_ROW_MOBILE
            : DISABLED_ROW_DESKTOP
          : undefined
      }
      bulkActions={
        <DataTableBulkActions
          table={table}
          selectedIds={selectedIds}
          onClearSelection={handleClearAllSelection}
          onSuccess={triggerRefresh}
        />
      }
    />
  )
}
