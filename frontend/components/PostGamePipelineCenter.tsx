'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';

interface StagingGameCheck {
  game_id: string;
  game_code: string;
  schedule_id: number | null;
  date: string;
  away_team: string;
  home_team: string;
  away_score: number;
  home_score: number;
  pbp_away_score: number | null;
  pbp_home_score: number | null;
  diff_away: number;
  diff_home: number;
  total_diff: number;
  pbp_status: 'OK' | 'NEEDS_REVIEW' | 'NO_PBP';
  included: boolean;
  is_new?: boolean;
  is_changed?: boolean;
}

interface StagingTeamChange {
  team_name: string;
  games_played: number;
  prev_games_played: number;
  record: string;
  prev_record: string;
  pace: number;
  ortg: number;
  drtg: number;
  net_rtg: number;
  prev_net_rtg: number | null;
  efg_pct: number;
  three_par: number;
  tov_pct: number;
  orb_pct: number;
  ftr: number;
}

interface StagingNewPlayer {
  team_name: string;
  player_name: string;
  jersey_number: string;
  position: string;
  games_played: number;
  mpg: number;
  ppg: number;
}

interface StagingPreviewManifest {
  generated_at: string;
  stage: string;
  needs_review_count: number;
  new_games_count: number;
  games: StagingGameCheck[];
  team_changes: StagingTeamChange[];
  new_players: StagingNewPlayer[];
}

interface RecentGameItem {
  id: string;
  game_code: string;
  schedule_id: number | null;
  stage: string;
  date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  youtube_url?: string | null;
  q1_tipoff_seconds?: number | null;
  q3_tipoff_seconds?: number | null;
  has_reviews?: boolean;
  has_playbooks?: boolean;
  playbook_count?: number;
}

interface WowyItem {
  scenario_item: string;
  tactical_desc: string;
}

interface TeamSummaryReview {
  high_usg_core: string;
  high_eff_finisher: string;
  system_notes: string;
}

interface PlayerReviewItem {
  player_name: string;
  shot_chart_review: string;
  performance_review: string;
}

interface PreviewPayload {
  status: string;
  model_used?: string;
  game: RecentGameItem;
  away_wowy: WowyItem[];
  home_wowy: WowyItem[];
  team_summaries: Record<string, TeamSummaryReview>;
  player_reviews: Record<string, PlayerReviewItem[]>;
  excel_tsv?: Record<string, string>;
  pbp_playbooks_saved?: number;
}

interface Props {
  apiBase: string;
  adminSecret: string;
  selectedModel: string;
  onScanModels?: () => void;
  scanningModels?: boolean;
}

export default function PostGamePipelineCenter({
  apiBase,
  adminSecret,
  selectedModel,
  onScanModels,
  scanningModels = false,
}: Props) {
  // 區塊 A：一鍵硬數據同步
  const [fetchLatest, setFetchLatest] = useState<boolean>(true);
  const [gameIdsInput, setGameIdsInput] = useState<string>('');
  const [syncRunning, setSyncRunning] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [syncDuration, setSyncDuration] = useState<number | null>(null);
  const [syncLogs, setSyncLogs] = useState<string>('');
  const [logsExpanded, setLogsExpanded] = useState<boolean>(false);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');
  const [stagingPreview, setStagingPreview] = useState<StagingPreviewManifest | null>(null);

  // 歷史賽季批量數據更新狀態（純數據重算，不消耗 AI Token）
  const [selectedHistorySeasons, setSelectedHistorySeasons] = useState<string[]>(['ALL']);
  const [syncMissingRaw, setSyncMissingRaw] = useState<boolean>(true);
  const [historyBatchRunning, setHistoryBatchRunning] = useState<boolean>(false);
  const [historyBatchResult, setHistoryBatchResult] = useState<{
    status: string;
    duration_sec: number;
    results: Array<{ season: string; stage: string; ok: boolean; games_count: number; players_count: number }>;
    logs: string;
  } | null>(null);
  const [historyBatchError, setHistoryBatchError] = useState<string>('');
  const [showHistoryLogs, setShowHistoryLogs] = useState<boolean>(false);
  const [approvedGameIds, setApprovedGameIds] = useState<string[]>([]);
  const [publishLoading, setPublishLoading] = useState<boolean>(false);
  const [discardLoading, setDiscardLoading] = useState<boolean>(false);
  const [publishMsg, setPublishMsg] = useState<string>('');

  // 區塊 B：AI 質化戰術短評生成
  const [recentGames, setRecentGames] = useState<RecentGameItem[]>([]);
  const [loadingGames, setLoadingGames] = useState<boolean>(false);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [youtubeUrlInput, setYoutubeUrlInput] = useState<string>('');
  const [tipoffSecondsInput, setTipoffSecondsInput] = useState<string>('');
  const [q3TipoffSecondsInput, setQ3TipoffSecondsInput] = useState<string>('');
  const [ytSyncLoading, setYtSyncLoading] = useState<boolean>(false);
  const [ytSyncMsg, setYtSyncMsg] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [commitLoading, setCommitLoading] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string>('');
  const [missingItems, setMissingItems] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewPayload | null>(null);
  const [commitSuccessMsg, setCommitSuccessMsg] = useState<string>('');
  const [copiedTeam, setCopiedTeam] = useState<string | null>(null);

  const loadRecentGames = async () => {
    if (!adminSecret) return;
    setLoadingGames(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/recent-games?limit=100`, {
        headers: { 'X-Admin-Secret': adminSecret },
      });
      if (res.ok) {
        const data = await res.json();
        const items: RecentGameItem[] = data.recent_games || [];
        setRecentGames(items);
        if (items.length > 0 && !selectedGameId) {
          setSelectedGameId(items[0].id);
        }
      }
    } catch {
      // Ignore initial load error
    } finally {
      setLoadingGames(false);
    }
  };

  const loadStagingPreview = async () => {
    if (!adminSecret) return;
    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/staging-preview`, {
        headers: { 'X-Admin-Secret': adminSecret },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.has_staging && data.staging_preview) {
          setStagingPreview(data.staging_preview);
        }
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadRecentGames();
    loadStagingPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSecret]);

  useEffect(() => {
    const found = recentGames.find((g) => g.id === selectedGameId);
    if (found) {
      setYoutubeUrlInput(found.youtube_url || '');
      setTipoffSecondsInput(
        found.q1_tipoff_seconds !== null && found.q1_tipoff_seconds !== undefined
          ? String(found.q1_tipoff_seconds)
          : ''
      );
      setQ3TipoffSecondsInput(
        found.q3_tipoff_seconds !== null && found.q3_tipoff_seconds !== undefined
          ? String(found.q3_tipoff_seconds)
          : ''
      );
      setYtSyncMsg('');
    }
  }, [selectedGameId, recentGames]);

  const HISTORICAL_SEASON_OPTIONS = [
    { id: 'season2024', label: '2024-2025 例行賽 (season2024)' },
    { id: 'season2025', label: '2025-2026 例行賽 (season2025)' },
    { id: 'playin2025', label: '2025-2026 季後挑戰賽 (playin2025)' },
    { id: 'playoff2025', label: '2025-2026 季後賽 (playoff2025)' },
    { id: 'final20252026', label: '2025-2026 冠軍賽 (final20252026)' },
    { id: 'preseason2026', label: '2026-2027 熱身賽 (preseason2026)' },
  ];

  const toggleHistorySeason = (id: string) => {
    if (id === 'ALL') {
      setSelectedHistorySeasons(['ALL']);
      return;
    }
    setSelectedHistorySeasons((prev) => {
      const withoutAll = prev.filter((x) => x !== 'ALL');
      if (withoutAll.includes(id)) {
        const next = withoutAll.filter((x) => x !== id);
        return next.length === 0 ? ['ALL'] : next;
      }
      return [...withoutAll, id];
    });
  };

  const handleRunHistoryBatchUpdate = async () => {
    if (!adminSecret) {
      setHistoryBatchError('請先於上方輸入 Admin Secret 驗證碼');
      return;
    }
    setHistoryBatchRunning(true);
    setHistoryBatchError('');
    setHistoryBatchResult(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/historical-batch-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({
          seasons: selectedHistorySeasons,
          sync_missing_raw: syncMissingRaw,
        }),
      });
      const { ok, status, data, rawText } = await readApiResponse(res);
      if (!ok) {
        const parsed = parseErrorDetail(data, status, rawText);
        setHistoryBatchError(parsed.msg);
      } else {
        setHistoryBatchResult(data);
        setShowHistoryLogs(false);
      }
    } catch (e: any) {
      setHistoryBatchError(e?.message || '歷史賽季批量更新請求失敗');
    } finally {
      setHistoryBatchRunning(false);
    }
  };

  const readApiResponse = async (res: Response): Promise<{ ok: boolean; status: number; data: any; rawText: string }> => {
    const rawText = await res.text();
    let data: any = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data, rawText };
  };

  const parseErrorDetail = (data: any, fallbackStatus: number, rawText: string = ''): { msg: string; missing: string[] } => {
    if (!data) {
      const snippet = rawText ? `：${rawText.slice(0, 300)}` : '';
      return { msg: `HTTP ${fallbackStatus} 請求失敗${snippet}`, missing: [] };
    }
    const detail = data.detail;
    if (detail && typeof detail === 'object') {
      return {
        msg: detail.message || `HTTP ${fallbackStatus} 資料不完整`,
        missing: Array.isArray(detail.missing_items) ? detail.missing_items : [],
      };
    }
    return {
      msg: typeof detail === 'string' ? detail : data.message || `HTTP ${fallbackStatus} 請求失敗`,
      missing: [],
    };
  };

  const handleRunUpdateStats = async () => {
    setSyncRunning(true);
    setSyncStatus('idle');
    setSyncErrorMsg('');
    setPublishMsg('');
    setMissingFiles([]);
    setSyncDuration(null);

    const parsedIds = gameIdsInput
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .map((s) => Number(s));

    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/update-stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({
          fetch_latest: fetchLatest,
          game_ids: parsedIds.length > 0 ? parsedIds : null,
          preview_only: true,
          approved_game_ids: approvedGameIds,
        }),
      });
      const { ok, status, data, rawText } = await readApiResponse(res);
      if (!ok || !data) {
        const parsed = parseErrorDetail(data, status, rawText);
        setSyncStatus('error');
        setSyncErrorMsg(parsed.msg);
        return;
      }
      setSyncStatus(data.status === 'ok' ? 'ok' : 'error');
      setSyncDuration(data.duration_sec ?? null);
      setSyncLogs(data.logs || '');
      setMissingFiles(Array.isArray(data.missing_files) ? data.missing_files : []);
      if (data.staging_preview) {
        setStagingPreview(data.staging_preview);
      }
      if (data.status !== 'ok') {
        setLogsExpanded(true);
        setSyncErrorMsg('管線執行中斷，請展開下方終端機日誌查看錯誤原因。');
      }
      if (Array.isArray(data.recent_games) && data.recent_games.length > 0) {
        setRecentGames(data.recent_games);
        setSelectedGameId(data.recent_games[0].id);
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncErrorMsg(err?.message || '網路連線錯誤');
    } finally {
      setSyncRunning(false);
    }
  };

  const toggleApproveGame = (gameId: string) => {
    setApprovedGameIds((prev) =>
      prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]
    );
  };

  const handleStagingPublish = async () => {
    setPublishLoading(true);
    setSyncErrorMsg('');
    setPublishMsg('');
    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/staging-publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({ approved_game_ids: approvedGameIds }),
      });
      const { ok, status, data, rawText } = await readApiResponse(res);
      if (!ok || !data || data.status !== 'ok') {
        const parsed = parseErrorDetail(data, status, rawText);
        setSyncErrorMsg(parsed.msg || '正式發佈失敗');
        if (data?.logs) {
          setSyncLogs(data.logs);
          setLogsExpanded(true);
        }
        return;
      }
      setStagingPreview(null);
      setApprovedGameIds([]);
      setSyncLogs(data.logs || '');
      setSyncDuration(data.duration_sec ?? null);
      setPublishMsg('✅ 已正式寫入 tpbl_stats.db 並同步更新前台數據與快取！');
      if (Array.isArray(data.recent_games) && data.recent_games.length > 0) {
        setRecentGames(data.recent_games);
        setSelectedGameId(data.recent_games[0].id);
      }
    } catch (err: any) {
      setSyncErrorMsg(err?.message || '正式發佈失敗');
    } finally {
      setPublishLoading(false);
    }
  };

  const handleStagingDiscard = async () => {
    setDiscardLoading(true);
    setSyncErrorMsg('');
    setPublishMsg('');
    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/staging-discard`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': adminSecret },
      });
      if (res.ok) {
        setStagingPreview(null);
        setApprovedGameIds([]);
        setPublishMsg('🗑️ 已捨棄本次 Staging 預覽，線上正式數據未受任何影響。');
      }
    } catch (err: any) {
      setSyncErrorMsg(err?.message || '捨棄預覽失敗');
    } finally {
      setDiscardLoading(false);
    }
  };

  const effectiveModelName = (selectedModel || '').trim();

  const handleScanOrJumpModel = () => {
    if (onScanModels) {
      onScanModels();
    }
    const el = document.getElementById('gemini-api-tester');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const parseOptionalSeconds = (val: string): number | null => {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const handleYoutubeSync = async () => {
    if (!selectedGameId) return;
    setYtSyncLoading(true);
    setYtSyncMsg('');
    setReviewError('');
    try {
      const res = await fetch(
        `${apiBase}/api/admin/games/${encodeURIComponent(selectedGameId)}/youtube-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': adminSecret,
          },
          body: JSON.stringify({
            youtube_url: youtubeUrlInput.trim() || null,
            q1_tipoff_seconds: parseOptionalSeconds(tipoffSecondsInput),
            q3_tipoff_seconds: parseOptionalSeconds(q3TipoffSecondsInput),
          }),
        }
      );
      const { ok, status, data, rawText } = await readApiResponse(res);
      if (!ok || !data) {
        const parsed = parseErrorDetail(data, status, rawText);
        setReviewError(parsed.msg);
        return;
      }
      setYtSyncMsg(
        `✅ 已更新 YouTube 時間軸設定，並重算 ${data.updated_playbooks ?? 0} 組戰術板跳轉秒數！`
      );
      setRecentGames((prev) =>
        prev.map((g) =>
          g.id === selectedGameId
            ? {
                ...g,
                youtube_url: data.youtube_url,
                q1_tipoff_seconds: data.q1_tipoff_seconds,
                q3_tipoff_seconds: data.q3_tipoff_seconds,
              }
            : g
        )
      );
    } catch (err: any) {
      setReviewError(err?.message || '更新 YouTube 時間軸失敗');
    } finally {
      setYtSyncLoading(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!selectedGameId) {
      setReviewError('請先選擇一場已完賽賽事。');
      return;
    }
    setPreviewLoading(true);
    setReviewError('');
    setMissingItems([]);
    setCommitSuccessMsg('');
    setYtSyncMsg('');

    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/generate-reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({
          game_id: selectedGameId,
          model_name: effectiveModelName,
          action: 'preview',
          youtube_url: youtubeUrlInput.trim() || null,
          q1_tipoff_seconds: parseOptionalSeconds(tipoffSecondsInput),
          q3_tipoff_seconds: parseOptionalSeconds(q3TipoffSecondsInput),
        }),
      });
      const { ok, status, data, rawText } = await readApiResponse(res);
      if (!ok || !data) {
        const parsed = parseErrorDetail(data, status, rawText);
        setReviewError(parsed.msg);
        setMissingItems(parsed.missing);
        return;
      }
      setPreviewData(data);
      if (typeof data.pbp_playbooks_saved === 'number' && data.pbp_playbooks_saved > 0) {
        setRecentGames((prev) =>
          prev.map((g) =>
            g.id === selectedGameId
              ? {
                  ...g,
                  has_playbooks: true,
                  playbook_count: data.pbp_playbooks_saved,
                }
              : g
          )
        );
      }
    } catch (err: any) {
      setReviewError(err?.message || '生成短評預覽失敗');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommitReviews = async () => {
    if (!previewData) return;
    setCommitLoading(true);
    setReviewError('');
    setCommitSuccessMsg('');

    try {
      const res = await fetch(`${apiBase}/api/admin/pipeline/generate-reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({
          game_id: previewData.game.id,
          model_name: effectiveModelName,
          action: 'commit',
          edited_payload: {
            away_wowy: previewData.away_wowy,
            home_wowy: previewData.home_wowy,
            team_summaries: previewData.team_summaries,
            player_reviews: previewData.player_reviews,
          },
        }),
      });
      const { ok, status, data, rawText } = await readApiResponse(res);
      if (!ok || !data) {
        const parsed = parseErrorDetail(data, status, rawText);
        setReviewError(parsed.msg);
        setMissingItems(parsed.missing);
        return;
      }
      setCommitSuccessMsg(
        `✅ 已原子性寫入資料庫 (${data.game_code})：更新 ${data.matchup_rows_written} 筆單場對位、${data.team_summary_updated} 隊全季總評、${data.players_updated} 位球員第 34/35 欄短評！`
      );
      setRecentGames((prev) =>
        prev.map((g) => (g.id === previewData.game.id ? { ...g, has_reviews: true } : g))
      );
    } catch (err: any) {
      setReviewError(err?.message || '寫入資料庫失敗');
    } finally {
      setCommitLoading(false);
    }
  };

  const handleCopyTeamTsv = async (teamName: string) => {
    if (!previewData) return;
    const rows = previewData.player_reviews?.[teamName] || [];
    const tsv = rows
      .map((r) => {
        const c34 = (r.shot_chart_review || '').replace(/[\t\r\n]+/g, ' ').trim();
        const c35 = (r.performance_review || '').replace(/[\t\r\n]+/g, ' ').trim();
        return `${c34}\t${c35}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedTeam(teamName);
      setTimeout(() => setCopiedTeam(null), 2000);
    } catch {
      alert('剪貼簿複製失敗，請手動選取複製。');
    }
  };

  const updateWowyField = (
    side: 'away_wowy' | 'home_wowy',
    idx: number,
    field: keyof WowyItem,
    val: string
  ) => {
    setPreviewData((prev) => {
      if (!prev) return prev;
      const updated = [...prev[side]];
      updated[idx] = { ...updated[idx], [field]: val };
      return { ...prev, [side]: updated };
    });
  };

  const updateSummaryField = (
    teamName: string,
    field: keyof TeamSummaryReview,
    val: string
  ) => {
    setPreviewData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        team_summaries: {
          ...prev.team_summaries,
          [teamName]: {
            ...prev.team_summaries[teamName],
            [field]: val,
          },
        },
      };
    });
  };

  const updatePlayerReviewField = (
    teamName: string,
    idx: number,
    field: 'shot_chart_review' | 'performance_review',
    val: string
  ) => {
    setPreviewData((prev) => {
      if (!prev) return prev;
      const list = [...(prev.player_reviews[teamName] || [])];
      list[idx] = { ...list[idx], [field]: val };
      return {
        ...prev,
        player_reviews: {
          ...prev.player_reviews,
          [teamName]: list,
        },
      };
    });
  };

  return (
    <section className="rounded-3xl border border-[#FF9100]/40 bg-[#161B22] p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#30363D] pb-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center space-x-2">
            <Zap className="w-5 h-5 text-[#FF9100]" />
            <span>賽後數據與 AI 短評更新中心</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            一鍵抓取 TPBL 官方 Box Score / PBP 並重算全站進階 JSON，再透過 Gemini 生成可微調的四區塊戰術短評並原子性寫入資料庫。
          </p>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FF9100]/10 text-[#FF9100] border border-[#FF9100]/30 self-start">
          Mode A 本地同步管線
        </span>
      </div>

      {/* 區塊 A：一鍵硬數據同步 */}
      <div className="rounded-2xl border border-[#30363D] bg-[#0E1117] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-emerald-400 flex items-center space-x-2">
            <Database className="w-4 h-4" />
            <span>區塊 A：一鍵硬數據抓取、建庫與全量進階指標精算</span>
          </h3>
          {syncDuration !== null && (
            <span className="text-xs font-mono text-gray-400">耗時 {syncDuration}s</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4 flex items-center space-x-2 pb-2">
            <input
              type="checkbox"
              id="pipeline_fetch_latest"
              checked={fetchLatest}
              onChange={(e) => setFetchLatest(e.target.checked)}
              className="w-4 h-4 rounded border-[#30363D] text-emerald-500 cursor-pointer"
            />
            <label htmlFor="pipeline_fetch_latest" className="text-xs font-bold text-gray-200 cursor-pointer select-none">
              從官方 API 抓取最新賽程 (fetch_latest)
            </label>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-gray-400 mb-1">
              指定官網 Schedule ID（選填，留空自動偵測）
            </label>
            <input
              type="text"
              value={gameIdsInput}
              onChange={(e) => setGameIdsInput(e.target.value)}
              disabled={!fetchLatest}
              placeholder="例如: 27558, 27559"
              className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
            />
          </div>

          <div className="md:col-span-4">
            <button
              type="button"
              onClick={handleRunUpdateStats}
              disabled={syncRunning}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {syncRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>管線執行中（請勿關閉）...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>一鍵抓取並重算全站數據</span>
                </>
              )}
            </button>
          </div>
        </div>

        {syncErrorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 font-semibold">
            {syncErrorMsg}
          </div>
        )}

        {missingFiles.length > 0 && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 space-y-1.5">
            <div className="flex items-center space-x-2 text-rose-400 text-xs font-black">
              <AlertTriangle className="w-4 h-4" />
              <span>資料完整性警告：以下場次缺少官方原始 JSON 檔案</span>
            </div>
            <ul className="list-disc list-inside text-xs text-rose-200 space-y-0.5 font-mono">
              {missingFiles.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {publishMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300 font-semibold">
            {publishMsg}
          </div>
        )}

        {stagingPreview && (
          <div className="rounded-2xl border border-amber-500/40 bg-[#161B22] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363D] pb-3">
              <div>
                <h4 className="text-sm font-black text-amber-300 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4" />
                  <span>賽後數據預覽與發佈審核區 (Staging)</span>
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  目前僅寫入暫存區，尚未覆蓋正式資料庫與前台數據。新場次：{stagingPreview.new_games_count} 場｜待人工確認：{stagingPreview.needs_review_count} 場｜新增球員：{stagingPreview.new_players.length} 名
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleStagingDiscard}
                  disabled={discardLoading || publishLoading}
                  className="px-3 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {discardLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>捨棄本次預覽（還原）</span>
                </button>
                <button
                  type="button"
                  onClick={handleStagingPublish}
                  disabled={publishLoading || discardLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {publishLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>確認無誤，正式發佈上線</span>
                </button>
              </div>
            </div>

            {/* 1. 場次與 PBP 兩級制校驗明細 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-300">1. 場次比分與 PBP 校驗狀態（僅供後台審核，不顯示於前台）</div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-[#30363D] divide-y divide-[#30363D]">
                {stagingPreview.games.slice().reverse().map((g) => {
                  const isNeedsReview = g.pbp_status === 'NEEDS_REVIEW';
                  const isApproved = approvedGameIds.includes(g.game_id);
                  return (
                    <div key={g.game_id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#0E1117]">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-emerald-400">{g.game_code}</span>
                        {g.is_new && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">NEW</span>
                        )}
                        <span className="text-gray-400">{g.date}</span>
                        <span className="text-white font-semibold">
                          {g.away_team} {g.away_score} : {g.home_score} {g.home_team}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        {g.pbp_status === 'OK' && (
                          <span className="text-[11px] text-emerald-400 font-semibold">
                            ✅ 自動通過{g.total_diff > 0 ? `（PBP 容許誤差 ${g.total_diff} 分）` : ''}
                          </span>
                        )}
                        {g.pbp_status === 'NO_PBP' && (
                          <span className="text-[11px] text-gray-400">無 PBP 檔（僅採 Box Score）</span>
                        )}
                        {isNeedsReview && (
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] text-amber-300 font-bold">
                              ⚠️ 需人工確認（Box {g.away_score}-{g.home_score} vs PBP {g.pbp_away_score}-{g.pbp_home_score}，總差 {g.total_diff} 分）
                            </span>
                            <label className="inline-flex items-center space-x-1 cursor-pointer bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 rounded text-[11px] text-amber-200 font-bold">
                              <input
                                type="checkbox"
                                checked={isApproved}
                                onChange={() => toggleApproveGame(g.game_id)}
                                className="rounded border-amber-400 text-amber-500"
                              />
                              <span>人手強制通過</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. 最新 7 隊戰績與 Four Factors 變化 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-300">2. 預覽 7 隊最新戰績與 Four Factors 變化</div>
              <div className="overflow-x-auto rounded-xl border border-[#30363D]">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-[#0E1117] text-gray-400">
                    <tr>
                      <th className="px-2.5 py-2">球隊</th>
                      <th className="px-2 py-2">戰績 (原→新)</th>
                      <th className="px-2 py-2">Pace</th>
                      <th className="px-2 py-2">ORtg</th>
                      <th className="px-2 py-2">DRtg</th>
                      <th className="px-2 py-2">NetRtg</th>
                      <th className="px-2 py-2">eFG%</th>
                      <th className="px-2 py-2">3PAr</th>
                      <th className="px-2 py-2">TOV%</th>
                      <th className="px-2 py-2">ORB%</th>
                      <th className="px-2 py-2">FTr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363D] bg-[#0B0E14]">
                    {stagingPreview.team_changes.map((t) => {
                      const netDelta =
                        t.prev_net_rtg !== null && t.prev_net_rtg !== undefined
                          ? Number((t.net_rtg - t.prev_net_rtg).toFixed(1))
                          : null;
                      return (
                        <tr key={t.team_name} className="text-gray-200">
                          <td className="px-2.5 py-1.5 font-bold text-white">{t.team_name}</td>
                          <td className="px-2 py-1.5 font-mono">
                            <span className="text-gray-500">{t.prev_record}</span> → <span className="text-emerald-400 font-bold">{t.record}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono">{t.pace}</td>
                          <td className="px-2 py-1.5 font-mono">{t.ortg}</td>
                          <td className="px-2 py-1.5 font-mono">{t.drtg}</td>
                          <td className="px-2 py-1.5 font-mono">
                            <span className={t.net_rtg >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{t.net_rtg}</span>
                            {netDelta !== null && netDelta !== 0 && (
                              <span className="ml-1 text-[10px] text-gray-400">({netDelta > 0 ? `+${netDelta}` : netDelta})</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{t.efg_pct}%</td>
                          <td className="px-2 py-1.5 font-mono">{t.three_par}%</td>
                          <td className="px-2 py-1.5 font-mono">{t.tov_pct}%</td>
                          <td className="px-2 py-1.5 font-mono">{t.orb_pct}%</td>
                          <td className="px-2 py-1.5 font-mono">{t.ftr}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. 新增球員名單 */}
            {stagingPreview.new_players.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-gray-300">3. 本次新增球員名單 ({stagingPreview.new_players.length} 名)</div>
                <div className="flex flex-wrap gap-1.5">
                  {stagingPreview.new_players.map((p) => (
                    <span
                      key={`${p.team_name}-${p.player_name}`}
                      className="px-2 py-1 rounded-lg bg-[#0E1117] border border-[#30363D] text-[11px] text-gray-200"
                    >
                      <span className="text-sky-400 font-bold">{p.team_name}</span> #{p.jersey_number || '-'} {p.player_name} ({p.ppg} PPG)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {syncLogs && (
          <div className="border border-[#30363D] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="w-full px-3 py-2 bg-[#161B22] flex items-center justify-between text-xs font-bold text-gray-300 hover:text-white"
            >
              <span className="flex items-center space-x-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  管線執行日誌 ({syncStatus === 'ok' ? '成功' : '失敗'})
                </span>
              </span>
              {logsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {logsExpanded && (
              <pre className="p-3 bg-[#080B10] text-[11px] font-mono text-gray-300 overflow-x-auto max-h-72 whitespace-pre-wrap">
                {syncLogs}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 區塊 B：AI 質化戰術短評生成 */}
      <div className="rounded-2xl border border-[#30363D] bg-[#0E1117] p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-[#FF9100] flex items-center space-x-2">
            <Sparkles className="w-4 h-4" />
            <span>區塊 B：AI 質化戰術短評生成與原子性寫入（對齊 v3 規範）</span>
          </h3>
          <button
            type="button"
            onClick={loadRecentGames}
            disabled={loadingGames}
            className="text-xs text-gray-400 hover:text-white flex items-center space-x-1"
          >
            <RefreshCw className={`w-3 h-3 ${loadingGames ? 'animate-spin' : ''}`} />
            <span>重新整理場次</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-gray-400 mb-1">目標已完賽場次</label>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF9100]"
            >
              {recentGames.length === 0 && <option value="">尚無已完賽場次</option>}
              {recentGames.map((g) => {
                const statusTag = [
                  g.has_reviews ? '已生成短評' : '未生成短評',
                  g.has_playbooks ? `已入庫戰術(${g.playbook_count ?? 4})` : '未入庫戰術',
                ].join('／');
                return (
                  <option key={g.id} value={g.id}>
                    {g.date} {g.game_code}｜{g.away_team} {g.away_score}:{g.home_score} {g.home_team}
                    {g.schedule_id ? ` (ID:${g.schedule_id})` : ''} [{statusTag}]
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-gray-400 mb-1">Gemini AI Model（共用設定）</label>
            <div className="flex items-center justify-between gap-2 bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-1.5">
              <div className="min-w-0">
                <span className="text-[11px] text-gray-400 mr-1.5">目前使用模型：</span>
                <span className="text-xs font-mono font-bold text-[#00E676] truncate">
                  {selectedModel ? selectedModel : '自動偵測最佳模型'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleScanOrJumpModel}
                disabled={scanningModels}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#0E1117] hover:bg-[#21262D] border border-[#30363D] text-[11px] font-bold text-gray-200 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                {scanningModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-[#FF9100]" />}
                <span>掃描 / 切換</span>
              </button>
            </div>
          </div>

          <div className="md:col-span-3">
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={previewLoading || !selectedGameId}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF9100] to-amber-500 hover:from-amber-400 hover:to-[#FF9100] text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {previewLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>AI 生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>生成短評預覽</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* YouTube 影片時間軸雙錨點對齊欄位（選填，支援單獨補填更新） */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-2 border-t border-[#21262D]">
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-gray-400 mb-1">
              YouTube 完整重播網址（youtube_url，選填）
            </label>
            <input
              type="url"
              value={youtubeUrlInput}
              onChange={(e) => setYoutubeUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF9100]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-400 mb-1">
              Q1 開球秒數（選填）
            </label>
            <input
              type="number"
              min={0}
              value={tipoffSecondsInput}
              onChange={(e) => setTipoffSecondsInput(e.target.value)}
              placeholder="如 2337"
              className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#FF9100]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-400 mb-1">
              Q3 開球秒數（選填）
            </label>
            <input
              type="number"
              min={0}
              value={q3TipoffSecondsInput}
              onChange={(e) => setQ3TipoffSecondsInput(e.target.value)}
              placeholder="消除中場誤差"
              className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#FF9100]"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="button"
              onClick={handleYoutubeSync}
              disabled={ytSyncLoading || !selectedGameId}
              className="w-full py-2 px-3 rounded-xl bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-bold text-sky-300 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {ytSyncLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>同步時間軸中...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>補填／重算 YouTube 秒數</span>
                </>
              )}
            </button>
          </div>
        </div>

        {ytSyncMsg && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs font-bold text-sky-300">
            {ytSyncMsg}
          </div>
        )}

        {reviewError && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 space-y-1.5">
            <div className="text-xs font-bold text-rose-300 whitespace-pre-wrap">{reviewError}</div>
            {missingItems.length > 0 && (
              <ul className="list-disc list-inside text-xs text-rose-200 font-mono space-y-0.5">
                {missingItems.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {commitSuccessMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300">
            {commitSuccessMsg}
          </div>
        )}

        {previewData && typeof previewData.pbp_playbooks_saved === 'number' && previewData.pbp_playbooks_saved > 0 && (
          <div className="rounded-xl border border-[#00E676]/40 bg-[#00E676]/10 p-3 text-xs font-bold text-[#00E676]">
            ✅ 已自動從 PBP 實戰萃取並寫入 {previewData.pbp_playbooks_saved} 組（每隊 2 攻 2 守）SVG 戰術板至資料庫 team_playbooks（無需手動保存）！
          </div>
        )}

        {/* 四區塊預覽與微調介面 */}
        {previewData && (
          <div className="space-y-6 pt-2 border-t border-[#30363D]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-gray-300">
                預覽場次：<span className="font-black text-white">{previewData.game.game_code}</span>（
                {previewData.game.away_team} vs {previewData.game.home_team}）｜使用模型：
                <span className="font-mono text-[#FF9100] ml-1">{previewData.model_used}</span>
              </div>
              <button
                type="button"
                onClick={handleCommitReviews}
                disabled={commitLoading}
                className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                {commitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                <span>{commitLoading ? '寫入資料庫中...' : '確認寫入資料庫'}</span>
              </button>
            </div>

            {/* 1. 客隊 / 主隊單場 WOWY 對位表格 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(
                [
                  { key: 'away_wowy' as const, team: previewData.game.away_team, label: '客隊單場 WOWY 對位' },
                  { key: 'home_wowy' as const, team: previewData.game.home_team, label: '主隊單場 WOWY 對位' },
                ] as const
              ).map(({ key, team, label }) => (
                <div key={key} className="rounded-xl border border-[#30363D] bg-[#161B22] p-4 space-y-3">
                  <h4 className="text-xs font-black text-sky-400">
                    {label} — {team}
                  </h4>
                  {(previewData[key] || []).map((item, idx) => (
                    <div key={idx} className="space-y-1.5 border-b border-[#30363D]/60 pb-3 last:border-b-0 last:pb-0">
                      <input
                        type="text"
                        value={item.scenario_item}
                        onChange={(e) => updateWowyField(key, idx, 'scenario_item', e.target.value)}
                        className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-2.5 py-1.5 text-xs font-bold text-white"
                      />
                      <textarea
                        rows={3}
                        value={item.tactical_desc}
                        onChange={(e) => updateWowyField(key, idx, 'tactical_desc', e.target.value)}
                        className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* 2. 兩隊全季滾動短評 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[previewData.game.away_team, previewData.game.home_team].map((teamName) => {
                const summary = previewData.team_summaries?.[teamName];
                if (!summary) return null;
                return (
                  <div key={teamName} className="rounded-xl border border-[#30363D] bg-[#161B22] p-4 space-y-3">
                    <h4 className="text-xs font-black text-amber-400">全季滾動戰力總評 — {teamName}</h4>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 mb-1">高球權核心 (USG%&gt;25%, TS%&gt;55%)</label>
                      <input
                        type="text"
                        value={summary.high_usg_core}
                        onChange={(e) => updateSummaryField(teamName, 'high_usg_core', e.target.value)}
                        className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 mb-1">高效終結者 (GmSc 前二, eFG%&gt;60%)</label>
                      <input
                        type="text"
                        value={summary.high_eff_finisher}
                        onChange={(e) => updateSummaryField(teamName, 'high_eff_finisher', e.target.value)}
                        className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 mb-1">戰力總評 (system_notes)</label>
                      <textarea
                        rows={3}
                        value={summary.system_notes}
                        onChange={(e) => updateSummaryField(teamName, 'system_notes', e.target.value)}
                        className="w-full bg-[#0E1117] border border-[#30363D] rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3. 兩隊全員賽季短評預覽表 + 一鍵複製 TSV */}
            <div className="space-y-4">
              {[previewData.game.away_team, previewData.game.home_team].map((teamName) => {
                const players = previewData.player_reviews?.[teamName] || [];
                return (
                  <div key={teamName} className="rounded-xl border border-[#30363D] bg-[#161B22] p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h4 className="text-xs font-black text-emerald-400">
                        全員賽季短評（對齊 Excel 名單順序）— {teamName}（共 {players.length} 人）
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleCopyTeamTsv(teamName)}
                        className="py-1.5 px-3 rounded-lg border border-[#30363D] bg-[#0E1117] hover:border-emerald-500 text-xs font-bold text-gray-200 flex items-center space-x-1.5 self-start"
                      >
                        {copiedTeam === teamName ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">已複製 TSV！</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>一鍵複製 Excel 兩欄格式（TSV）</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-[#30363D] rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-[#0E1117] text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2.5 border-b border-[#30363D] w-32">球員姓名</th>
                            <th className="p-2.5 border-b border-[#30363D]">第 34 欄：投籃分布短評</th>
                            <th className="p-2.5 border-b border-[#30363D]">第 35 欄：賽季整體表現短評</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#30363D]/60">
                          {players.map((p, idx) => (
                            <tr key={p.player_name} className="hover:bg-[#0E1117]/50">
                              <td className="p-2 font-bold text-white align-top whitespace-nowrap">
                                {idx + 1}. {p.player_name}
                              </td>
                              <td className="p-2 align-top">
                                <textarea
                                  rows={2}
                                  value={p.shot_chart_review}
                                  onChange={(e) =>
                                    updatePlayerReviewField(teamName, idx, 'shot_chart_review', e.target.value)
                                  }
                                  className="w-full bg-[#0E1117] border border-[#30363D] rounded px-2 py-1 text-xs text-gray-200"
                                />
                              </td>
                              <td className="p-2 align-top">
                                <textarea
                                  rows={2}
                                  value={p.performance_review}
                                  onChange={(e) =>
                                    updatePlayerReviewField(teamName, idx, 'performance_review', e.target.value)
                                  }
                                  className="w-full bg-[#0E1117] border border-[#30363D] rounded px-2 py-1 text-xs text-gray-200"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 歷史賽季批量數據更新（純數據重算，不消耗 AI Token） */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#21262D] pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>歷史賽季批量數據更新（純數據重算，不消耗 AI Token）</span>
            </h3>
            <p className="text-xs text-gray-400">
              純依據官方 <code className="text-cyan-300">raw_game_stats/</code> 與 <code className="text-cyan-300">schedule.json</code> 增量寫入 DB 並重算多賽季 PBP、情境數據與 PR 排行榜；完整保留既有 AI 短評與戰術板。
            </p>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 self-start sm:self-auto whitespace-nowrap">
            0 AI Token 消耗
          </span>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-bold text-gray-300">選擇目標歷史賽季（可多選，或選「全部歷史賽季」）：</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleHistorySeason('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                selectedHistorySeasons.includes('ALL')
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                  : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-white'
              }`}
            >
              全部歷史賽季
            </button>
            {HISTORICAL_SEASON_OPTIONS.map((opt) => {
              const active = !selectedHistorySeasons.includes('ALL') && selectedHistorySeasons.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleHistorySeason(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-bold'
                      : 'bg-[#0E1117] text-gray-400 border-[#30363D] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <label className="flex items-center space-x-2 text-xs text-gray-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={syncMissingRaw}
              onChange={(e) => setSyncMissingRaw(e.target.checked)}
              className="rounded border-[#30363D] bg-[#0E1117] text-cyan-500 focus:ring-cyan-500"
            />
            <span>自動向官方 API 補抓缺漏的 broadcasts.json / stats.json</span>
          </label>

          <button
            type="button"
            disabled={historyBatchRunning}
            onClick={handleRunHistoryBatchUpdate}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-xs flex items-center justify-center space-x-2 transition-colors"
          >
            {historyBatchRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>批量重算執行中...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>執行歷史賽季批量更新</span>
              </>
            )}
          </button>
        </div>

        {historyBatchError && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300">
            ❌ {historyBatchError}
          </div>
        )}

        {historyBatchResult && (
          <div className="space-y-3 pt-2">
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
              <span>
                ✅ 歷史賽季批量更新完成（狀態：{historyBatchResult.status}，耗時 {historyBatchResult.duration_sec}s）
              </span>
              <button
                type="button"
                onClick={() => setShowHistoryLogs((v) => !v)}
                className="text-cyan-300 hover:underline font-bold"
              >
                {showHistoryLogs ? '收合執行日誌' : '查看詳細執行日誌'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {historyBatchResult.results.map((r) => (
                <div
                  key={r.season}
                  className={`p-3 rounded-lg border text-xs ${
                    r.ok ? 'bg-[#0E1117] border-[#30363D]' : 'bg-rose-950/30 border-rose-500/40'
                  }`}
                >
                  <div className="font-bold text-white flex items-center justify-between">
                    <span>{r.stage}</span>
                    <span className={r.ok ? 'text-emerald-400' : 'text-rose-400'}>
                      {r.ok ? '成功' : '失敗'}
                    </span>
                  </div>
                  <div className="text-gray-400 mt-1">
                    場次：{r.games_count} 場 ｜ 球員：{r.players_count} 筆
                  </div>
                </div>
              ))}
            </div>

            {showHistoryLogs && historyBatchResult.logs && (
              <pre className="p-3 rounded-lg bg-[#0B0F14] border border-[#30363D] text-[11px] text-gray-300 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap font-mono">
                {historyBatchResult.logs}
              </pre>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
