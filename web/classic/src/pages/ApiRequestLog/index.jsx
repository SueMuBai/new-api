/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Descriptions,
  Empty,
  Form,
  Modal,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { Copy, Eye, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import { DATE_RANGE_PRESETS } from '../../constants/console.constants';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import {
  API,
  copy,
  createCardProPagination,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';

const { Text, Title } = Typography;

const getDefaultDateRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getTime() + 3600 * 1000);
  return [start, end];
};

const formatDuration = (value) => {
  const seconds = Number(value) || 0;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(0)}s`;
};

const statusColor = (statusCode) => {
  if (statusCode >= 500) return 'red';
  if (statusCode >= 400) return 'orange';
  if (statusCode >= 200 && statusCode < 300) return 'green';
  return 'grey';
};

const BodyPanel = ({ title, body, truncated, t }) => {
  const text = body || '';
  const handleCopy = async () => {
    if (!text) return;
    if (await copy(text)) {
      showSuccess(t('复制成功'));
    }
  };

  return (
    <div className='flex flex-col gap-2 min-w-0'>
      <div className='flex items-center justify-between gap-2'>
        <Space spacing={6}>
          <Text strong>{title}</Text>
          {truncated && (
            <Tag color='orange' shape='circle'>
              {t('已截断')}
            </Tag>
          )}
        </Space>
        <Button
          size='small'
          type='tertiary'
          icon={<Copy size={14} />}
          onClick={handleCopy}
          disabled={!text}
        >
          {t('复制')}
        </Button>
      </div>
      <pre
        className='rounded-lg border p-3 text-xs overflow-auto whitespace-pre-wrap break-words min-h-[260px] max-h-[420px]'
        style={{
          borderColor: 'var(--semi-color-border)',
          background: 'var(--semi-color-fill-0)',
        }}
      >
        {text || t('空')}
      </pre>
    </div>
  );
};

const ApiRequestLog = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState([]);
  const [logCount, setLogCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const formApiRef = useRef(null);

  const formInitValues = useMemo(
    () => ({
      dateRange: getDefaultDateRange(),
      username: '',
      user_id: '',
      token_name: '',
      model_name: '',
      channel_id: '',
      path: '',
      status_code: '',
      request_id: '',
      upstream_request_id: '',
    }),
    [],
  );

  const getFormValues = () => {
    const values = formApiRef.current?.getValues() || formInitValues;
    const range = Array.isArray(values.dateRange)
      ? values.dateRange
      : formInitValues.dateRange;

    return {
      ...values,
      start_timestamp: range?.[0]
        ? Math.floor(Date.parse(range[0]) / 1000)
        : undefined,
      end_timestamp: range?.[1]
        ? Math.floor(Date.parse(range[1]) / 1000)
        : undefined,
    };
  };

  const loadLogs = async (page = activePage, size = pageSize) => {
    setLoading(true);
    try {
      const values = getFormValues();
      const res = await API.get('/api/api_request_logs/', {
        params: {
          p: page,
          page_size: size,
          user_id: values.user_id || undefined,
          username: values.username || undefined,
          token_name: values.token_name || undefined,
          model_name: values.model_name || undefined,
          channel_id: values.channel_id || undefined,
          path: values.path || undefined,
          status_code: values.status_code || undefined,
          request_id: values.request_id || undefined,
          upstream_request_id: values.upstream_request_id || undefined,
          start_timestamp: values.start_timestamp,
          end_timestamp: values.end_timestamp,
        },
        disableDuplicate: true,
      });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('加载失败'));
        return;
      }
      setLogs((data?.items || []).map((item) => ({ ...item, key: item.id })));
      setLogCount(data?.total || 0);
      setActivePage(data?.page || page);
      setPageSize(data?.page_size || size);
    } catch (error) {
      showError(error.message || t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadLogs(1, pageSize);
  };

  const handleReset = () => {
    formApiRef.current?.reset();
    setTimeout(() => loadLogs(1, pageSize), 100);
  };

  const handlePageChange = (page) => {
    loadLogs(page, pageSize);
  };

  const handlePageSizeChange = (size) => {
    loadLogs(1, size);
  };

  useEffect(() => {
    loadLogs(1, pageSize);
  }, []);

  const columns = useMemo(
    () => [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        render: (text, record) => (
          <div className='flex flex-col'>
            <Text size='small'>{timestamp2string(text)}</Text>
            <Text size='small' type='tertiary'>
              #{record.id}
            </Text>
          </div>
        ),
      },
      {
        title: t('用户'),
        dataIndex: 'username',
        render: (text, record) => (
          <div className='flex flex-col'>
            <Text>{text || '-'}</Text>
            <Text size='small' type='tertiary'>
              ID {record.user_id}
            </Text>
          </div>
        ),
      },
      {
        title: t('令牌名称'),
        dataIndex: 'token_name',
        render: (text, record) => (
          <div className='flex flex-col'>
            <Text ellipsis={{ showTooltip: true }}>{text || '-'}</Text>
            <Text size='small' type='tertiary'>
              #{record.token_id || '-'}
            </Text>
          </div>
        ),
      },
      {
        title: t('模型名称'),
        dataIndex: 'model_name',
        render: (text, record) => (
          <div className='flex flex-col'>
            <Text ellipsis={{ showTooltip: true }}>{text || '-'}</Text>
            <Text size='small' type='tertiary'>
              {t('渠道 ID')}: {record.channel_id || '-'}
            </Text>
          </div>
        ),
      },
      {
        title: t('路径'),
        dataIndex: 'path',
        render: (text, record) => (
          <Space spacing={4}>
            <Tag color='blue' shape='circle'>
              {record.method || '-'}
            </Tag>
            <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 240 }}>
              {text || '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status_code',
        render: (text) => (
          <Tag color={statusColor(text)} shape='circle'>
            {text || '-'}
          </Tag>
        ),
      },
      {
        title: t('耗时'),
        dataIndex: 'use_time',
        render: (text, record) => (
          <Space spacing={4}>
            <Text>{formatDuration(text)}</Text>
            <Tag color={record.is_stream ? 'blue' : 'grey'} shape='circle'>
              {record.is_stream ? t('流') : t('非流')}
            </Tag>
          </Space>
        ),
      },
      {
        title: t('Request ID'),
        dataIndex: 'request_id',
        render: (text) => (
          <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 180 }}>
            {text || '-'}
          </Text>
        ),
      },
      {
        title: '',
        dataIndex: 'operate',
        fixed: 'right',
        width: 100,
        render: (text, record) => (
          <Button
            size='small'
            type='tertiary'
            icon={<Eye size={14} />}
            onClick={() => setSelectedLog(record)}
          >
            {t('查看')}
          </Button>
        ),
      },
    ],
    [t],
  );

  const detailData = selectedLog
    ? [
        {
          key: t('时间'),
          value: timestamp2string(selectedLog.created_at),
        },
        {
          key: t('用户'),
          value: `${selectedLog.username || '-'} (#${selectedLog.user_id})`,
        },
        {
          key: t('令牌名称'),
          value: `${selectedLog.token_name || '-'} (#${selectedLog.token_id || '-'})`,
        },
        { key: t('模型名称'), value: selectedLog.model_name || '-' },
        { key: t('渠道 ID'), value: selectedLog.channel_id || '-' },
        { key: t('状态码'), value: selectedLog.status_code || '-' },
        { key: t('耗时'), value: formatDuration(selectedLog.use_time) },
        { key: t('IP'), value: selectedLog.ip || '-' },
        { key: t('Request ID'), value: selectedLog.request_id || '-' },
        {
          key: t('上游 Request ID'),
          value: selectedLog.upstream_request_id || '-',
        },
        {
          key: t('路径'),
          value: `${selectedLog.method || '-'} ${selectedLog.path || '-'}`,
        },
        { key: t('查询参数'), value: selectedLog.query || '-' },
      ]
    : [];

  return (
    <div className='mt-[60px] px-2'>
      <CardPro
        type='type2'
        statsArea={
          <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-2'>
            <Title heading={5} className='!mb-0'>
              {t('API请求日志')}
            </Title>
            <Button
              size='small'
              type='tertiary'
              icon={<RefreshCw size={14} />}
              onClick={() => loadLogs(activePage, pageSize)}
              loading={loading}
            >
              {t('刷新')}
            </Button>
          </div>
        }
        searchArea={
          <Form
            initValues={formInitValues}
            getFormApi={(api) => {
              formApiRef.current = api;
            }}
            onSubmit={handleSearch}
            allowEmpty
            autoComplete='off'
            layout='vertical'
            trigger='change'
            stopValidateWithError={false}
          >
            <div className='flex flex-col gap-2'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
                <div className='col-span-1 lg:col-span-2'>
                  <Form.DatePicker
                    field='dateRange'
                    className='w-full'
                    type='dateTimeRange'
                    placeholder={[t('开始时间'), t('结束时间')]}
                    showClear
                    pure
                    size='small'
                    presets={DATE_RANGE_PRESETS.map((preset) => ({
                      text: t(preset.text),
                      start: preset.start(),
                      end: preset.end(),
                    }))}
                  />
                </div>
                <Form.Input
                  field='username'
                  prefix={<IconSearch />}
                  placeholder={t('用户名称')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='token_name'
                  prefix={<IconSearch />}
                  placeholder={t('令牌名称')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='model_name'
                  prefix={<IconSearch />}
                  placeholder={t('模型名称')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='path'
                  prefix={<IconSearch />}
                  placeholder={t('路径')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='status_code'
                  prefix={<IconSearch />}
                  placeholder={t('状态码')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='user_id'
                  prefix={<IconSearch />}
                  placeholder={t('用户 ID')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='channel_id'
                  prefix={<IconSearch />}
                  placeholder={t('渠道 ID')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='request_id'
                  prefix={<IconSearch />}
                  placeholder={t('Request ID')}
                  showClear
                  pure
                  size='small'
                />
                <Form.Input
                  field='upstream_request_id'
                  prefix={<IconSearch />}
                  placeholder={t('上游 Request ID')}
                  showClear
                  pure
                  size='small'
                />
              </div>
              <div className='flex justify-end gap-2'>
                <Button
                  type='tertiary'
                  htmlType='submit'
                  loading={loading}
                  size='small'
                >
                  {t('查询')}
                </Button>
                <Button type='tertiary' onClick={handleReset} size='small'>
                  {t('重置')}
                </Button>
              </div>
            </div>
          </Form>
        }
        paginationArea={createCardProPagination({
          currentPage: activePage,
          pageSize,
          total: logCount,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
          isMobile,
          t,
        })}
        t={t}
      >
        <CardTable
          columns={columns}
          dataSource={logs}
          rowKey='key'
          loading={loading}
          scroll={{ x: 'max-content' }}
          className='rounded-xl overflow-hidden'
          size='small'
          hidePagination
          empty={
            <Empty description={t('搜索无结果')} style={{ padding: 30 }} />
          }
        />
      </CardPro>

      <Modal
        title={t('API请求日志详情')}
        visible={Boolean(selectedLog)}
        onCancel={() => setSelectedLog(null)}
        footer={null}
        width={1100}
      >
        {selectedLog && (
          <div className='flex flex-col gap-4'>
            <Descriptions data={detailData} />
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
              <BodyPanel
                title={t('请求内容')}
                body={selectedLog.request_body}
                truncated={selectedLog.request_truncated}
                t={t}
              />
              <BodyPanel
                title={t('返回内容')}
                body={selectedLog.response_body}
                truncated={selectedLog.response_truncated}
                t={t}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ApiRequestLog;
