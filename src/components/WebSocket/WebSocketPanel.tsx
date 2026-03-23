import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Tag, Empty, Tooltip, Space } from 'antd';
import {
  SendOutlined,
  LinkOutlined,
  DisconnectOutlined,
  ClearOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useWsStore } from '../../stores/wsStore';
import type { WsMessage, WsStatus } from '../../types';
import './WebSocketPanel.css';

const STATUS_CONFIG: Record<WsStatus, { color: string; text: string }> = {
  idle: { color: 'default', text: 'Idle' },
  connecting: { color: 'processing', text: 'Connecting...' },
  connected: { color: 'success', text: 'Connected' },
  disconnected: { color: 'default', text: 'Disconnected' },
  error: { color: 'error', text: 'Error' },
};

const WebSocketPanel: React.FC = () => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('wss://echo.websocket.org');
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    connect,
    disconnect,
    send,
    refreshStatus,
    refreshMessages,
    clearMessages,
    getActiveConnection,
    activeConnectionId,
  } = useWsStore();

  const connection = getActiveConnection();
  const status = connection?.status || 'idle';
  const messages = connection?.messages || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling for status and messages when connected
  useEffect(() => {
    if (!activeConnectionId || status !== 'connected') return;

    const interval = setInterval(() => {
      refreshStatus(activeConnectionId);
      refreshMessages(activeConnectionId);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeConnectionId, status, refreshStatus, refreshMessages]);

  const handleConnect = async () => {
    if (!url.trim()) return;

    const config = {
      id: crypto.randomUUID(),
      name: 'WebSocket',
      url: url.trim(),
    };

    await connect(config);
  };

  const handleDisconnect = async () => {
    if (activeConnectionId) {
      await disconnect(activeConnectionId);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() || !activeConnectionId || status !== 'connected') return;

    await send(activeConnectionId, messageInput);
    setMessageInput('');
  };

  const handleClear = async () => {
    if (activeConnectionId) {
      await clearMessages(activeConnectionId);
    }
  };

  const formatTimestamp = (ts: number): string => {
    return new Date(ts).toLocaleTimeString();
  };

  const renderMessage = (msg: WsMessage, index: number) => {
    const directionClass = msg.direction;
    const icon = msg.direction === 'sent' ? '→' : msg.direction === 'received' ? '←' : '•';

    return (
      <div key={index} className={`ws-message ${directionClass}`}>
        <span className="ws-message-icon">{icon}</span>
        <span className="ws-message-time">{formatTimestamp(msg.timestamp)}</span>
        <span className="ws-message-data">{msg.data}</span>
      </div>
    );
  };

  return (
    <div className="websocket-panel">
      {/* URL Bar */}
      <div className="ws-url-bar">
        <Tag color={STATUS_CONFIG[status].color}>{t(`websocket.${status}`)}</Tag>
        <Input
          className="ws-url-input"
          placeholder="wss://example.com/ws"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPressEnter={handleConnect}
          disabled={status === 'connecting' || status === 'connected'}
        />
        {status === 'connected' ? (
          <Button
            type="default"
            danger
            icon={<DisconnectOutlined />}
            onClick={handleDisconnect}
          >
            {t('websocket.disconnect')}
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={handleConnect}
            loading={status === 'connecting'}
            disabled={!url.trim()}
          >
            {t('websocket.connect')}
          </Button>
        )}
      </div>

      {/* Messages Area */}
      <div className="ws-messages-container">
        <div className="ws-messages-header">
          <span>{t('websocket.messages', { count: messages.length })}</span>
          <Space>
            <Tooltip title={t('websocket.refresh')}>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => activeConnectionId && refreshMessages(activeConnectionId)}
                disabled={!activeConnectionId}
              />
            </Tooltip>
            <Tooltip title={t('websocket.clear')}>
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleClear}
                disabled={messages.length === 0}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="ws-messages-list">
          {messages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={status === 'connected' ? t('websocket.noMessages') : t('websocket.connectToStart')}
            />
          ) : (
            <>
              {messages.map((msg, i) => renderMessage(msg, i))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Send Message Bar */}
      <div className="ws-send-bar">
        <Input.TextArea
          className="ws-message-input"
          placeholder={t('websocket.messagePlaceholder')}
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={status !== 'connected'}
          autoSize={{ minRows: 1, maxRows: 4 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={status !== 'connected' || !messageInput.trim()}
        >
          {t('websocket.send')}
        </Button>
      </div>
    </div>
  );
};

export default WebSocketPanel;
