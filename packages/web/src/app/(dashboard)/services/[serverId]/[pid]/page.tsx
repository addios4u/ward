'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { servicesApi, serversApi } from '@/lib/api';
import { LogViewer } from '@/components/dashboard/LogViewer';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Log, LogLevel, WsMessage, ServiceProcess, ServiceServer } from '@/types';

const POLL_INTERVAL_MS = 30_000;

interface ServiceDetailPageProps {
  params: { serverId: string; pid: string };
}

// 바이트를 MB로 변환
function formatMB(bytes: number | null): string {
  if (bytes === null) return '-';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 서비스 상세 페이지
export default function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { serverId, pid } = params;
  const pidNum = parseInt(pid, 10);

  const [process, setProcess] = useState<ServiceProcess | null>(null);
  const [serverInfo, setServerInfo] = useState<ServiceServer | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logLevel, setLogLevel] = useState<LogLevel | ''>('');

  // 프로세스 정보 조회
  const fetchProcessInfo = useCallback(() => {
    servicesApi
      .list()
      .then((res) => {
        const srv = res.services.find((s) => s.serverId === serverId);
        if (!srv) {
          setInfoError('서버를 찾을 수 없습니다.');
          setInfoLoading(false);
          return;
        }
        const proc = srv.processes.find((p) => p.pid === pidNum);
        if (!proc) {
          setInfoError('프로세스를 찾을 수 없습니다.');
          setInfoLoading(false);
          return;
        }
        setServerInfo(srv);
        setProcess(proc);
        setInfoError(null);
        setInfoLoading(false);
      })
      .catch((err: Error) => {
        setInfoError(err.message);
        setInfoLoading(false);
      });
  }, [serverId, pidNum]);

  // 로그 조회
  const loadLogs = useCallback(
    (selectedLevel: LogLevel | '', sourceName?: string) => {
      setLogsLoading(true);
      serversApi
        .getLogs(serverId, {
          level: selectedLevel || undefined,
          limit: 100,
          source: sourceName,
        })
        .then((res) => {
          setLogs(res.logs);
          setLogsLoading(false);
        })
        .catch((err: Error) => {
          setLogsError(err.message);
          setLogsLoading(false);
        });
    },
    [serverId]
  );

  useEffect(() => {
    fetchProcessInfo();
    const timer = setInterval(fetchProcessInfo, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchProcessInfo]);

  useEffect(() => {
    // 프로세스 이름이 있으면 source 필터 적용
    if (process) {
      loadLogs(logLevel, process.name);
    }
  }, [process, loadLogs, logLevel]);

  // 실시간 WebSocket 로그 수신
  const handleMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'logs') {
        const newLog = msg.data as Log;
        // 프로세스 이름으로 source 필터링
        if (process && newLog.source !== process.name) return;
        if (!logLevel || newLog.level === logLevel) {
          setLogs((prev) => [...prev.slice(-199), newLog]);
        }
      }
    },
    [logLevel, process]
  );

  useWebSocket(handleMessage, serverId);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/services" className="text-gray-400 hover:text-gray-600 text-sm">
          ← 서비스 목록
        </Link>
      </div>

      {infoError && <ErrorMessage message={infoError} onRetry={fetchProcessInfo} />}

      {infoLoading && !infoError ? (
        <div className="flex items-center justify-center h-32 gap-2 text-gray-400 text-sm">
          <Spinner size="sm" />
          <span>프로세스 정보 불러오는 중...</span>
        </div>
      ) : process && serverInfo ? (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{process.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {serverInfo.serverName} ({serverInfo.serverHostname})
            </p>
          </div>

          {/* 프로세스 정보 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500">PID</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{process.pid}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500">CPU 사용률</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {process.cpuUsage !== null ? `${process.cpuUsage.toFixed(1)}%` : '-'}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500">메모리</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatMB(process.memUsage)}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500">수집 시각</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {new Date(process.collectedAt).toLocaleString('ko-KR')}
                </p>
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      {/* 로그 섹션 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">로그</h2>
            <button
              onClick={() => loadLogs(logLevel, process?.name)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              새로고침
            </button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {logsError && (
            <div className="p-4">
              <ErrorMessage message={logsError} onRetry={() => loadLogs(logLevel, process?.name)} />
            </div>
          )}
          {logsLoading ? (
            <div className="flex items-center justify-center h-48 gap-2 text-gray-400 text-sm">
              <Spinner size="sm" />
              <span>로그 불러오는 중...</span>
            </div>
          ) : (
            <div className="h-96 overflow-hidden">
              <LogViewer
                logs={logs}
                onLevelChange={(level) => setLogLevel(level)}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
