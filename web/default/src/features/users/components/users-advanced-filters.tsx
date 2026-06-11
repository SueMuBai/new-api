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
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { UserNumberFilterOperator, UserTextFilterOperator } from '../types'

export const DEFAULT_USER_TEXT_FILTER_OPERATOR: UserTextFilterOperator = 'eq'
export const DEFAULT_USER_NUMBER_FILTER_OPERATOR: UserNumberFilterOperator =
  'gt'

export type UsersAdvancedFilterValues = {
  usernameOp: UserTextFilterOperator
  usernameValue: string
  quotaOp: UserNumberFilterOperator
  quotaValue: string
}

type UsersAdvancedFiltersProps = {
  values: UsersAdvancedFilterValues
  onChange: (values: Partial<UsersAdvancedFilterValues>) => void
}

const USERNAME_OPERATOR_OPTIONS: Array<{
  value: UserTextFilterOperator
  labelKey: string
}> = [
  { value: 'eq', labelKey: 'is' },
  { value: 'ne', labelKey: 'is not' },
  { value: 'contains', labelKey: 'contains' },
  { value: 'not_contains', labelKey: 'does not contain' },
]

const QUOTA_OPERATOR_OPTIONS: Array<{
  value: UserNumberFilterOperator
  labelKey: string
}> = [
  { value: 'gt', labelKey: 'greater than' },
  { value: 'gte', labelKey: 'greater than or equal' },
  { value: 'lt', labelKey: 'less than' },
  { value: 'lte', labelKey: 'less than or equal' },
  { value: 'eq', labelKey: 'equals' },
  { value: 'ne', labelKey: 'not equal' },
]

export function UsersAdvancedFilters(props: UsersAdvancedFiltersProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap'>
        <NativeSelect
          aria-label={t('Username condition')}
          value={props.values.usernameOp}
          onChange={(event) =>
            props.onChange({
              usernameOp: event.target.value as UserTextFilterOperator,
            })
          }
          className='w-[142px] shrink-0'
        >
          {USERNAME_OPERATOR_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {t(option.labelKey)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          aria-label={t('Username value')}
          value={props.values.usernameValue}
          onChange={(event) =>
            props.onChange({ usernameValue: event.target.value })
          }
          placeholder={t('Username value')}
          className='min-w-[150px] flex-1 sm:w-[190px] sm:flex-none'
        />
      </div>

      <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap'>
        <NativeSelect
          aria-label={t('Quota condition')}
          value={props.values.quotaOp}
          onChange={(event) =>
            props.onChange({
              quotaOp: event.target.value as UserNumberFilterOperator,
            })
          }
          className='w-[184px] shrink-0'
        >
          {QUOTA_OPERATOR_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {t(option.labelKey)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          aria-label={t('Quota amount')}
          type='number'
          inputMode='decimal'
          step='any'
          value={props.values.quotaValue}
          onChange={(event) =>
            props.onChange({ quotaValue: event.target.value })
          }
          placeholder={t('Quota amount')}
          className='min-w-[140px] flex-1 sm:w-[160px] sm:flex-none'
        />
      </div>
    </>
  )
}
