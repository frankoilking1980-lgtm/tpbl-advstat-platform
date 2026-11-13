'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStage } from '@/context/StageContext';
import {
  Zap,
  Download,
  Copy,
  Check,
  RefreshCw,
  Database,
  Trash2,
  AlertTriangle,
  XCircle,
  Lock,
  KeyRound,
  LogOut,
  ShieldCheck,
  Upload,
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
} from 'lucide-react';

const TEAMS = [
  '新北中信特攻',
  '臺北台新戰神',
  '新北國王',
  '福爾摩沙夢想家',
  '桃園台啤永豐雲豹',
  '新竹御嵿攻城獅',
  '高雄全家海神',
];

interface InjuryItem {
  team: string;
  player: string;
  status: string;
  note: string;
}

interface PreviewSummaryItem {
  slug: string;
  game_date: string;
  game_label: string;
  home_team: string;
  away_team: string;
  headline: string;
  model_used: string;
}

export default function SystemConsolePage() {
  const { stage: currentStage, stagesList } = useStage();

  // 密碼保護狀態 (透過後端 POST /api/admin/verify 驗證並暫存於 sessionStorage)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // 檢查目前工作階段 (Session) 是否已解鎖過
  useEffect(() => {
    const savedSecret = sessionStorage.getItem('tpbl_admin_secret');
    if (savedSecret) {
      setAdminSecret(savedSecret);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setErrorMsg('請輸入管理員密碼！');
      return;
    }
    setVerifying(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${apiBase}/api/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: passwordInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || '密碼驗證失敗');
      }
      setAdminSecret(passwordInput.trim());
      setIsAuthenticated(true);
      sessionStorage.setItem('tpbl_admin_secret', passwordInput.trim());
      setPasswordInput('');
    } catch (err: any) {
      setErrorMsg(err?.message || '密碼驗證失敗，請確認密碼或後端連線。');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminSecret('');
    sessionStorage.removeItem('tpbl_admin_secret');
    setPasswordInput('');
  };

  // =================================================================
  // 週預測 & 傷兵管理 State
  // =================================================================
  const [injuries, setInjuries] = useState<InjuryItem[]>([]);
  const [uploadingInjury, setUploadingInjury] = useState(false);
  const [injuryMsg, setInjuryMsg] = useState<string>('');

  const [genHome, setGenHome] = useState('新北中信特攻');
  const [genAway, setGenAway] = useState('臺北台新戰神');
  const [genDate, setGenDate] = useState('2026-11-14');
  const [genLabel, setGenLabel] = useState('本週焦點雙北大戰');
  const [genNotes, setGenNotes] = useState('');
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [genResultMsg, setGenResultMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [showImportJson, setShowImportJson] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importingJson, setImportingJson] = useState(false);

  const [previewsList, setPreviewsList] = useState<PreviewSummaryItem[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  const [upcomingSchedule, setUpcomingSchedule] = useState<
    {
      game_id: string;
      date: string;
      time: string;
      home_team: string;
      away_team: string;
      venue: string;
      has_report: boolean;
      slug: string;
    }[]
  >([]);
  const [geminiPing, setGeminiPing] = useState<{
    ok: boolean;
    configured?: boolean;
    selected_model?: string | null;
    available_models?: string[];
    message: string;
  } | null>(null);
  const [pingingGemini, setPingingGemini] = useState(false);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<string>('');

  const handlePingGemini = async (secretOverride?: string) => {
    const sec = secretOverride || adminSecret;
    if (!sec) return;
    setPingingGemini(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/ping-gemini`, {
        headers: { 'X-Admin-Secret': sec },
      });
      if (res.ok) {
        const data = await res.json();
        setGeminiPing(data);
        if (data?.selected_model) {
          setSelectedGeminiModel(data.selected_model);
        } else if (Array.isArray(data?.available_models) && data.available_models.length > 0) {
          setSelectedGeminiModel(data.available_models[0]);
        }
      } else {
        setGeminiPing({ ok: false, message: `HTTP ${res.status} 驗證失敗` });
      }
    } catch (err: any) {
      setGeminiPing({ ok: false, message: `連線失敗：${err?.message || '未知錯誤'}` });
    } finally {
      setPingingGemini(false);
    }
  };

  const loadConsoleWeeklyData = async (secret: string) => {
    setLoadingPreviews(true);
    try {
      const [injRes, prevRes, schedRes] = await Promise.all([
        fetch(`${apiBase}/api/admin/injuries`, {
          headers: { 'X-Admin-Secret': secret },
        }),
        fetch(`${apiBase}/api/weekly-previews`),
        fetch(`${apiBase}/api/admin/upcoming-schedule`, {
          headers: { 'X-Admin-Secret': secret },
        }),
      ]);
      if (injRes.ok) {
        const injData = await injRes.json();
        setInjuries(injData.items || []);
      }
      if (prevRes.ok) {
        const prevData = await prevRes.json();
        setPreviewsList(prevData.items || []);
      }
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        setUpcomingSchedule(schedData.items || []);
      }
    } catch {
      // Ignore network errors
    } finally {
      setLoadingPreviews(false);
    }
  };

  const handleFillFromSchedule = (g: {
    game_id: string;
    date: string;
    home_team: string;
    away_team: string;
  }) => {
    setGenHome(g.home_team);
    setGenAway(g.away_team);
    setGenDate(g.date);
    setGenLabel(g.game_id ? `${g.game_id} 焦點對決` : '本週焦點大戰');
    setGenResultMsg(null);
  };

  useEffect(() => {
    if (isAuthenticated && adminSecret) {
      loadConsoleWeeklyData(adminSecret);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, adminSecret]);

  // 切換主客隊時自動帶入該兩隊已匯入的傷兵情報
  useEffect(() => {
    if (!isAuthenticated || !genHome || !genAway || genHome === genAway) return;
    let cancelled = false;
    fetch(
      `${apiBase}/api/weekly-previews/injuries?home=${encodeURIComponent(genHome)}&away=${encodeURIComponent(genAway)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.formatted_text === 'string') {
          setGenNotes(data.formatted_text);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, genHome, genAway, injuries, apiBase]);

  const handleUploadInjuries = async (file: File | undefined) => {
    if (!file) return;
    setUploadingInjury(true);
    setInjuryMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${apiBase}/api/admin/upload-injuries`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': adminSecret },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '上傳失敗');
      setInjuries(data.items || []);
      setInjuryMsg(`已成功匯入 ${data.count} 筆傷兵名單！`);
    } catch (err: any) {
      setInjuryMsg(`匯入失敗：${err?.message || '未知錯誤'}`);
    } finally {
      setUploadingInjury(false);
    }
  };

  const handleGenerateWeeklyPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenResultMsg(null);
    if (genHome === genAway) {
      setGenResultMsg({ type: 'err', text: '主隊與客隊不可為同一支球隊。' });
      return;
    }
    setGeneratingPreview(true);
    try {
      const directBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
      const generateUrl = directBase
        ? `${directBase}/api/weekly-previews/generate`
        : '/api/weekly-previews/generate';

      const res = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        signal: AbortSignal.timeout(240000),
        body: JSON.stringify({
          home_team: genHome,
          away_team: genAway,
          game_date: genDate,
          game_label: genLabel || '本週焦點大戰',
          extra_notes: genNotes.trim() || null,
          model_name: selectedGeminiModel || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '生成失敗');
      setGenResultMsg({
        type: 'ok',
        text: `已成功透過 ${data.model_used} 生成報告（${data.slug}），並自動更新 7 隊戰術庫！`,
      });
      await loadConsoleWeeklyData(adminSecret);
    } catch (err: any) {
      const msg =
        err?.name === 'TimeoutError'
          ? '生成逾時（超過 4 分鐘），請稍後重試或改用較快的 Flash 模型／手動 JSON 匯入。'
          : err?.message || '生成失敗';
      setGenResultMsg({ type: 'err', text: msg });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (genHome === genAway) {
      setGenResultMsg({ type: 'err', text: '主隊與客隊不可為同一支球隊。' });
      return;
    }
    setCopyingPrompt(true);
    setGenResultMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/weekly-previews/build-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({
          home_team: genHome,
          away_team: genAway,
          game_date: genDate,
          game_label: genLabel || '本週焦點大戰',
          extra_notes: genNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '組裝 Prompt 失敗');
      await navigator.clipboard.writeText(data.full_prompt || '');
      setGenResultMsg({
        type: 'ok',
        text: `已複製完整數據 Prompt（含 ${genHome} vs ${genAway} 真實數據與確認傷兵），可直接貼給網頁版 LLM 生成 JSON 後於下方匯入！`,
      });
    } catch (err: any) {
      setGenResultMsg({ type: 'err', text: err?.message || '複製 Prompt 失敗' });
    } finally {
      setCopyingPrompt(false);
    }
  };

  const handleImportJson = async () => {
    if (genHome === genAway) {
      setGenResultMsg({ type: 'err', text: '主隊與客隊不可為同一支球隊。' });
      return;
    }
    if (!importJsonText.trim()) {
      setGenResultMsg({ type: 'err', text: '請先貼上要匯入的 JSON 內容。' });
      return;
    }
    setImportingJson(true);
    setGenResultMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/weekly-previews/import-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({
          home_team: genHome,
          away_team: genAway,
          game_date: genDate,
          game_label: genLabel || '本週焦點大戰',
          raw_json: importJsonText,
          model_used: selectedGeminiModel || 'manual-json-import',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'JSON 匯入失敗');
      setGenResultMsg({
        type: 'ok',
        text: `已成功匯入並發布報告（${data.slug}），並自動更新 7 隊戰術庫！`,
      });
      setImportJsonText('');
      setShowImportJson(false);
      await loadConsoleWeeklyData(adminSecret);
    } catch (err: any) {
      setGenResultMsg({ type: 'err', text: err?.message || 'JSON 匯入失敗' });
    } finally {
      setImportingJson(false);
    }
  };

  const handleDeletePreview = async (slug: string) => {
    if (!window.confirm(`確定要刪除週預測報告「${slug}」嗎？`)) return;
    try {
      const res = await fetch(`${apiBase}/api/weekly-previews/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Secret': adminSecret },
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.detail || '刪除失敗');
        return;
      }
      await loadConsoleWeeklyData(adminSecret);
    } catch (err: any) {
      alert(`刪除錯誤：${err?.message}`);
    }
  };

  // A 區狀態
  const [syncStage, setSyncStage] = useState(currentStage || '2026-2027 例行賽');
  const [scheduleId, setScheduleId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [autoGemini, setAutoGemini] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');

  // B 區狀態
  const [updateMatchId, setUpdateMatchId] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateResult, setUpdateResult] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // C 區狀態（單場刪除）
  const [deleteGameId, setDeleteGameId] = useState('');
  const [deleteGameLoading, setDeleteGameLoading] = useState(false);
  const [deleteGameResult, setDeleteGameResult] = useState('');

  // D 區狀態（全季重置清空）
  const [resetStage, setResetStage] = useState(currentStage || '2026-2027 例行賽');
  const [clearGames, setClearGames] = useState(true);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<string>('');

  // A 區：抓取硬指標
  const handleSyncHardMetrics = async () => {
    if (!scheduleId || !matchId) {
      alert('請填寫 Schedule ID 與場次代號');
      return;
    }
    setSyncLoading(true);
    setSyncResult('');
    try {
      const res = await fetch(`${apiBase}/api/admin/sync-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: syncStage,
          schedule_id: scheduleId,
          game_id: matchId,
          date: matchDate || undefined,
          auto_gemini: autoGemini,
        }),
      });
      const data = await res.json();
      setSyncResult(JSON.stringify(data, null, 2));
      setUpdateMatchId(matchId);
      setDeleteGameId(matchId);
    } catch (err: any) {
      setSyncResult(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    } finally {
      setSyncLoading(false);
    }
  };

  // B 區：貼上質化 JSON 更新
  const handleUpdateDatabase = async () => {
    if (!updateMatchId || !jsonInput.trim()) {
      alert('請輸入場次代號與貼上有效的 JSON 內容');
      return;
    }
    setUpdateLoading(true);
    setUpdateResult('');
    try {
      let parsedData;
      try {
        parsedData = JSON.parse(jsonInput);
      } catch {
        throw new Error('貼上的內容不是合法的 JSON 格式，請檢查語法');
      }

      const res = await fetch(`${apiBase}/api/admin/update-game-qualitative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: updateMatchId,
          ...parsedData,
        }),
      });
      const data = await res.json();
      setUpdateResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setUpdateResult(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    } finally {
      setUpdateLoading(false);
    }
  };

  // C 區：刪除單場比賽
  const handleDeleteSingleGame = async () => {
    if (!deleteGameId.trim()) {
      alert('請輸入要刪除的場次代號 (game_id)');
      return;
    }
    if (
      !window.confirm(
        `確定要徹底刪除單場比賽【${deleteGameId}】嗎？\n此動作將連帶刪除該場的 Box、PBP 與對位戰術，並自動倒扣總表戰績！`
      )
    ) {
      return;
    }

    setDeleteGameLoading(true);
    setDeleteGameResult('');
    try {
      const res = await fetch(`${apiBase}/api/admin/delete-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: deleteGameId.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeleteGameResult(JSON.stringify(data, null, 2));
        alert(data.message || '單場刪除成功！');
      } else {
        setDeleteGameResult(JSON.stringify(data, null, 2));
        alert(`刪除失敗: ${data.detail || data.message}`);
      }
    } catch (err: any) {
      setDeleteGameResult(JSON.stringify({ status: 'error', message: err.message }, null, 2));
      alert(`連線錯誤: ${err.message}`);
    } finally {
      setDeleteGameLoading(false);
    }
  };

  // D 區：清空指定賽季數據
  const handleResetStage = async () => {
    const confirmText = `確定要徹底清空【${resetStage}】嗎？\n- 團隊進階總表將完全歸零 (0勝0敗)\n${
      clearGames ? '- 該賽季所有單場賽事、Box Score、PBP 與戰術對位將全數刪除\n' : ''
    }\n此動作無法還原！`;
    if (!window.confirm(confirmText)) return;

    setResetLoading(true);
    setResetResult('');
    try {
      const res = await fetch(`${apiBase}/api/admin/reset-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: resetStage,
          clear_games: clearGames,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetResult(JSON.stringify(data, null, 2));
        alert(data.message || '重置成功！');
      } else {
        setResetResult(JSON.stringify(data, null, 2));
        alert(`重置失敗: ${data.detail || data.message}`);
      }
    } catch (err: any) {
      setResetResult(JSON.stringify({ status: 'error', message: err.message }, null, 2));
      alert(`連線錯誤: ${err.message}`);
    } finally {
      setResetLoading(false);
    }
  };

  const handleCopy = () => {
    if (!syncResult) return;
    navigator.clipboard.writeText(syncResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // =================================================================
  // 1. 未認證狀態：展示密碼輸入鎖定卡片
  // =================================================================
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-[#30363D] bg-[#161B22] p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FF9100]/30 bg-[#FF9100]/10 text-[#FF9100]">
            <Lock className="h-8 w-8" />
          </div>

          <h2 className="text-center text-xl font-black text-white">
            System Console 權限鎖定
          </h2>
          <p className="mt-2 text-center text-xs text-gray-400">
            此頁面包含重置賽季與單場數據修訂等高權限功能，請輸入管理密碼解鎖存取。
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-500" />
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="請輸入管理者密碼..."
                  className="w-full rounded-xl border border-[#30363D] bg-[#0E1117] py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-[#FF9100] focus:outline-none focus:ring-1 focus:ring-[#FF9100]"
                  autoFocus
                />
              </div>
              {errorMsg && (
                <p className="mt-2 text-center text-xs font-semibold text-rose-500">
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#FF9100] to-amber-500 py-2.5 text-sm font-black text-slate-950 transition hover:from-amber-400 hover:to-[#FF9100] disabled:opacity-50"
            >
              {verifying ? '驗證密碼中...' : '解鎖並進入控制台'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =================================================================
  // 2. 已認證狀態：展示原本完整的 System Console 內容
  // =================================================================
  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* 標題與登出按鈕 */}
      <div className="border-b border-[#30363D] pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center space-x-2">
            <Zap className="w-7 h-7 text-[#FF9100]" />
            <span>TPBL 數據控制台 (Console)</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            單場同步 ➔ 匯出給 LLM ➔ 貼回質化短評；支援單場精準刪除與全賽季一鍵徹底清空
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>管理員已驗證</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#30363D] bg-[#0E1117] hover:border-gray-500 text-xs font-bold text-gray-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>重新鎖定</span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 週預測 & 傷兵名單管理三大功能區塊 */}
      {/* ================================================================= */}
      <div className="space-y-6">
        {/* Gemini API 連線狀態測試燈號 + 近期未開打賽程一鍵帶入 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ① Gemini API 連線狀態測試 */}
          <section className="lg:col-span-5 rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    geminiPing === null
                      ? 'bg-gray-500'
                      : geminiPing.ok
                      ? 'bg-[#00E676] shadow-lg shadow-[#00E676]/50'
                      : 'bg-rose-500 shadow-lg shadow-rose-500/50'
                  }`}
                />
                <h2 className="text-base font-black text-white">Gemini API 連線狀態測試</h2>
              </div>
              <button
                type="button"
                onClick={() => handlePingGemini()}
                disabled={pingingGemini}
                className="px-3 py-1.5 rounded-xl bg-[#FF9100] hover:bg-[#FFA726] text-black font-black text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {pingingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>{pingingGemini ? '測試中...' : '一鍵測試 API'}</span>
              </button>
            </div>

            {geminiPing ? (
              <div className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5 space-y-2 text-xs">
                <div className={geminiPing.ok ? 'text-[#00E676] font-bold' : 'text-rose-400 font-bold'}>
                  {geminiPing.message}
                </div>
                {geminiPing.available_models && geminiPing.available_models.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-gray-400">
                      點擊切換生成模型（已自動選中最新推薦模型）：
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {geminiPing.available_models.slice(0, 12).map((m) => {
                        const isSelected = m === (selectedGeminiModel || geminiPing.selected_model);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSelectedGeminiModel(m)}
                            className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/60 font-bold shadow-sm'
                                : 'bg-[#161B22] hover:bg-[#21262D] text-gray-300 border-[#30363D]'
                            }`}
                          >
                            {isSelected ? `✓ ${m}` : m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400 bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5">
                點擊右上角「一鍵測試 API」即可即時檢查 GEMINI_API_KEY 與動態掃描最新可用模型。
              </div>
            )}
          </section>

          {/* ③ 近期未開打賽程自動讀取清單 */}
          <section className="lg:col-span-7 rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-black text-white">近期未開打賽程表（自動讀取）</h2>
              <button
                type="button"
                onClick={() => loadConsoleWeeklyData(adminSecret)}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPreviews ? 'animate-spin' : ''}`} />
                <span>重新掃描</span>
              </button>
            </div>

            {upcomingSchedule.length === 0 ? (
              <div className="text-xs text-gray-500 bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
                目前 `upcoming_schedule.json` 中無尚未開打的未來賽程（所有有效場次皆已完賽），您仍可使用下方生成器自訂對戰。
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {upcomingSchedule.map((g, idx) => (
                  <div
                    key={`${g.game_id}-${g.date}-${idx}`}
                    className="bg-[#0E1117] border border-[#21262D] rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400">
                        <span className="text-[#FF9100] font-bold">{g.game_id || 'TBD'}</span>
                        <span>{g.date} {!g.time || g.time === '00:00' ? '時間待公布' : g.time}</span>
                        {g.venue && <span>· {g.venue}</span>}
                        {g.has_report && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-[#00E676] border border-emerald-800/50 text-[10px]">
                            已生成
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-black text-white mt-0.5">
                        {g.home_team} (主) vs {g.away_team} (客)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFillFromSchedule(g)}
                      className="px-3 py-1.5 rounded-lg bg-[#161B22] hover:bg-[#FF9100] hover:text-black border border-[#30363D] text-xs font-bold text-[#FF9100] transition-colors shrink-0"
                    >
                      ⚡ 帶入此場次
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 區塊 A：傷兵名單 Excel 管理中心 */}
        <section className="rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-[#00E676]">
              <FileSpreadsheet className="w-5 h-5" />
              <h2 className="text-lg font-black text-white">傷兵名單 Excel 管理中心</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`${apiBase}/api/admin/injury-template`}
                download="tpbl_injury_template.xlsx"
                className="px-3.5 py-2 rounded-xl bg-[#0E1117] hover:bg-[#21262D] border border-[#30363D] text-xs font-bold text-gray-200 flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#FF9100]" />
                <span>📥 下載傷兵名單 Excel 模板</span>
              </a>
              <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-[#00E676] hover:bg-[#00C853] text-black text-xs font-black flex items-center gap-1.5 transition-colors">
                {uploadingInjury ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{uploadingInjury ? '匯入解析中...' : '📤 上傳傷兵名單 Excel (.xlsx)'}</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadInjuries(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {injuryMsg && (
            <div className="text-xs px-3 py-2 rounded-xl bg-[#0E1117] border border-[#30363D] text-[#00E676] font-bold">
              {injuryMsg}
            </div>
          )}

          {injuries.length === 0 ? (
            <div className="text-xs text-gray-500 bg-[#0E1117] border border-[#21262D] rounded-xl p-4">
              目前尚未匯入任何傷兵名單。請下載模板填寫後上傳，或直接於下方生成器手動補充。
            </div>
          ) : (
            <div className="overflow-x-auto bg-[#0E1117] border border-[#21262D] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#21262D] text-gray-400">
                  <tr>
                    <th className="py-2.5 px-3">球隊</th>
                    <th className="py-2.5 px-3">球員姓名</th>
                    <th className="py-2.5 px-3">狀態</th>
                    <th className="py-2.5 px-3">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262D]">
                  {injuries.map((inj, i) => (
                    <tr key={`${inj.team}-${inj.player}-${i}`} className="hover:bg-[#161B22]/60">
                      <td className="py-2 px-3 font-bold text-white">{inj.team}</td>
                      <td className="py-2 px-3 text-gray-200">{inj.player}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            inj.status.toUpperCase() === 'OUT'
                              ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                          }`}
                        >
                          {inj.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-400">{inj.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 區塊 B：本週對戰 AI 球探報告生成器 */}
        <section className="rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-[#FF9100]">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-lg font-black text-white">本週對戰 AI 球探報告生成器</h2>
            </div>
            <div className="text-xs px-3 py-1 rounded-full bg-[#0E1117] border border-[#30363D] text-gray-300 font-mono">
              使用模型：<span className="text-[#00E676] font-bold">{selectedGeminiModel || '自動選用最新 Pro 模型'}</span>
            </div>
          </div>

          <form onSubmit={handleGenerateWeeklyPreview} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-400 mb-1">主隊 (Home)</label>
              <select
                value={genHome}
                onChange={(e) => setGenHome(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white"
              >
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-400 mb-1">客隊 (Away)</label>
              <select
                value={genAway}
                onChange={(e) => setGenAway(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white"
              >
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-400 mb-1">比賽日期</label>
              <input
                type="date"
                value={genDate}
                onChange={(e) => setGenDate(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-400 mb-1">對戰標籤</label>
              <input
                type="text"
                value={genLabel}
                onChange={(e) => setGenLabel(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="md:col-span-9">
              <label className="block text-xs font-bold text-gray-400 mb-1">
                賽前傷兵與輪替情報（自動帶入兩隊已匯入傷兵，可手動微調）
              </label>
              <textarea
                rows={2}
                value={genNotes}
                onChange={(e) => setGenNotes(e.target.value)}
                placeholder="若無傷兵資料可留空或手動輸入確認後之傷兵／輪替情報"
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white resize-y"
              />
            </div>
            <div className="md:col-span-3 flex items-end gap-2">
              <button
                type="submit"
                disabled={generatingPreview}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#FF9100] hover:bg-[#FFA726] disabled:opacity-50 text-black font-black text-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                {generatingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{generatingPreview ? '生成中...' : '生成報告'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                disabled={copyingPrompt}
                title="複製含真實數據與確認傷兵的完整 Prompt"
                className="py-2.5 px-3 rounded-xl bg-[#0E1117] hover:bg-[#21262D] border border-[#30363D] disabled:opacity-50 text-gray-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0"
              >
                {copyingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>📋</span>}
                <span>複製數據 Prompt</span>
              </button>
            </div>

            {genResultMsg && (
              <div
                className={`md:col-span-12 text-xs px-3 py-2 rounded-xl border ${
                  genResultMsg.type === 'ok'
                    ? 'text-[#00E676] bg-emerald-950/40 border-emerald-800/50'
                    : 'text-rose-400 bg-rose-950/40 border-rose-800/50'
                }`}
              >
                {genResultMsg.text}
              </div>
            )}
          </form>

          {/* 折疊式手動貼上 JSON 匯入發布區塊 */}
          <div className="border-t border-[#21262D] pt-3">
            <button
              type="button"
              onClick={() => setShowImportJson((v) => !v)}
              className="text-xs font-bold text-gray-300 hover:text-[#00E676] flex items-center gap-1.5 transition-colors"
            >
              <span>📥 貼上 JSON 匯入發布（手動保底雙軌）</span>
              <span className="text-[10px] text-gray-500">{showImportJson ? '▲ 收合' : '▼ 展開'}</span>
            </button>

            {showImportJson && (
              <div className="mt-3 space-y-2.5 bg-[#0E1117] border border-[#21262D] rounded-2xl p-4">
                <div className="text-[11px] text-gray-400">
                  將網頁版 LLM 生成的 JSON 回應（可含 <code className="text-gray-300">```json</code> 標記）貼入下方，系統將自動執行路徑別名容錯正規化、Pydantic 驗證與落盤發布。
                </div>
                <textarea
                  rows={6}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{"headline": "...", "subheadline": "...", ...}'
                  className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-3 py-2 text-xs font-mono text-gray-200 resize-y"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleImportJson}
                    disabled={importingJson}
                    className="px-4 py-2 rounded-xl bg-[#00E676] hover:bg-[#00C853] disabled:opacity-50 text-black font-black text-xs flex items-center gap-1.5 transition-colors"
                  >
                    {importingJson ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{importingJson ? '驗證匯入中...' : '匯入並發布報告'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 區塊 C：已發布預測報告管理列表 */}
        <section className="rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white">已發布預測報告管理列表</h2>
            <button
              type="button"
              onClick={() => loadConsoleWeeklyData(adminSecret)}
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPreviews ? 'animate-spin' : ''}`} />
              <span>重新整理</span>
            </button>
          </div>

          {previewsList.length === 0 ? (
            <div className="text-xs text-gray-500">尚無已發布之週預測報告。</div>
          ) : (
            <div className="space-y-2">
              {previewsList.map((item) => (
                <div
                  key={item.slug}
                  className="bg-[#0E1117] border border-[#21262D] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-[11px] font-mono text-[#00E676]">
                      {item.game_date} · {item.game_label} · <span className="text-gray-500">{item.slug}</span>
                    </div>
                    <div className="text-sm font-black text-white mt-0.5">
                      {item.home_team} vs {item.away_team}
                    </div>
                    <div className="text-xs text-gray-400 truncate max-w-2xl">{item.headline}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href="/weekly-preview"
                      className="px-3 py-1.5 rounded-lg bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-xs font-bold text-gray-200 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>前往預覽</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeletePreview(item.slug)}
                      className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-xs font-bold text-rose-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>刪除</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* A 區：單場硬指標同步 */}
        <section className="rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-[#FF9100]">
            <span className="text-lg">🏀</span>
            <h2 className="text-lg font-black text-white">A. 單場硬指標同步與匯出</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">賽季階段名稱</label>
              <input
                type="text"
                value={syncStage}
                onChange={(e) => setSyncStage(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF9100]"
                placeholder="例如: 2026-2027 例行賽"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">官網 Schedule ID</label>
                <input
                  type="text"
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF9100]"
                  placeholder="例如: 1221"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">場次代號</label>
                <input
                  type="text"
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF9100]"
                  placeholder="例如: 2026-G01"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">日期 (選填)</label>
                <input
                  type="text"
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF9100]"
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>

            <label className="flex items-center space-x-2 text-xs text-gray-300 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGemini}
                onChange={(e) => setAutoGemini(e.target.checked)}
                className="rounded border-[#30363D] text-[#00E676] focus:ring-[#00E676]"
              />
              <span>功能 C：同步後以 Gemini 自動生成質化內容並寫入（需後端 GEMINI_API_KEY）</span>
            </label>

            <button
              onClick={handleSyncHardMetrics}
              disabled={syncLoading}
              className="w-full py-2.5 rounded-xl bg-[#00E676] hover:bg-[#00c864] text-slate-950 font-black text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              <span>{syncLoading ? '正在同步數據...' : '抓取並同步單場硬指標'}</span>
            </button>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                disabled={!syncResult}
                className="flex-1 py-1.5 px-3 rounded-lg border border-[#30363D] bg-[#0E1117] hover:border-gray-500 text-xs font-bold text-gray-300 flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#00E676]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已複製！' : '複製 LLM 數據摘要'}</span>
              </button>
              <button
                onClick={() => {
                  if (!syncResult) return;
                  const blob = new Blob([syncResult], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${matchId || 'game'}_sync.txt`;
                  a.click();
                }}
                disabled={!syncResult}
                className="flex-1 py-1.5 px-3 rounded-lg border border-[#30363D] bg-[#0E1117] hover:border-gray-500 text-xs font-bold text-gray-300 flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下載 .txt</span>
              </button>
            </div>

            <pre className="p-3 rounded-xl bg-[#0E1117] border border-[#30363D] text-xs font-mono text-emerald-400 overflow-x-auto max-h-56">
              {syncResult || '// 同步回傳訊息將顯示於此...'}
            </pre>
          </div>
        </section>

        {/* B 區：貼上質化分析更新 */}
        <section className="rounded-3xl border border-[#30363D] bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-[#FF9100]">
            <span className="text-lg">📄</span>
            <h2 className="text-lg font-black text-white">B. 貼上 LLM 分析結果一鍵更新</h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            貼上依 prompt 產生的 JSON。將精準更新：單場焦點對位 WOWY、區塊 B 高球權核心 / 高效終結者 / 戰力短評、球員第 34/35 欄。
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">場次代號</label>
              <input
                type="text"
                value={updateMatchId}
                onChange={(e) => setUpdateMatchId(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF9100]"
                placeholder="例如: G01 或 2026-G01"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">JSON 內容</label>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={9}
                className="w-full bg-[#0E1117] border border-[#30363D] rounded-xl p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-[#FF9100]"
                placeholder="在此貼上 LLM 生成的 JSON..."
              />
            </div>

            <button
              onClick={handleUpdateDatabase}
              disabled={updateLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF9100] to-amber-500 hover:from-amber-400 hover:to-[#FF9100] text-slate-950 font-black text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {updateLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              <span>{updateLoading ? '正在更新資料庫...' : '一鍵更新資料庫'}</span>
            </button>
          </div>

          <pre className="p-3 rounded-xl bg-[#0E1117] border border-[#30363D] text-xs font-mono text-sky-400 overflow-x-auto max-h-36">
            {updateResult || '// 資料庫更新回報將顯示於此...'}
          </pre>
        </section>
      </div>

      {/* 下方雙欄管理：C. 單場精準刪除 + D. 全賽季徹底清空 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* C 區：單場比賽刪除 */}
        <section className="rounded-3xl border border-amber-500/30 bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-amber-400">
            <XCircle className="w-6 h-6" />
            <h2 className="text-lg font-black text-white">C. 單場比賽刪除 (修錯/重新抓取專用)</h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            輸入場次代號（如 <code className="text-amber-300">G01</code> 或 <code className="text-amber-300">2026-G01</code>），一鍵徹底刪除該場的 Box Score、五人陣容、On/Off 與戰術對位，並自動重算總表戰績。
          </p>

          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">場次代號 (game_id)</label>
              <input
                type="text"
                value={deleteGameId}
                onChange={(e) => setDeleteGameId(e.target.value)}
                className="w-full bg-[#0E1117] border border-[#30363D] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                placeholder="例如: G01 或 2026-G01"
              />
            </div>

            <button
              onClick={handleDeleteSingleGame}
              disabled={deleteGameLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-amber-600/20 disabled:opacity-50"
            >
              {deleteGameLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{deleteGameLoading ? '正在刪除該場賽事...' : '🗑️ 刪除指定單場比賽'}</span>
            </button>
          </div>

          {deleteGameResult && (
            <pre className="p-3 rounded-xl bg-[#0E1117] border border-[#30363D] text-xs font-mono text-amber-300 overflow-x-auto max-h-32">
              {deleteGameResult}
            </pre>
          )}
        </section>

        {/* D 區：重置 / 徹底清空指定賽季 */}
        <section className="rounded-3xl border border-red-500/30 bg-[#161B22] p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-red-400">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-lg font-black text-white">D. 重置 / 徹底清空指定賽季 (全季重整)</h2>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            徹底清空該賽季：團隊四大要素總表完全歸零（0勝0敗），同時將該賽季底下的所有單場比賽及相關進階數據徹底抹除。
          </p>

          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">目標賽季名稱</label>
              <input
                type="text"
                value={resetStage}
                onChange={(e) => setResetStage(e.target.value)}
                list="stages-datalist"
                className="w-full bg-[#0E1117] border border-[#30363D] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                placeholder="例如: 2026-2027 例行賽"
              />
              <datalist id="stages-datalist">
                {stagesList.map((s) => (
                  <option key={s.id} value={s.id} />
                ))}
              </datalist>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="clear_games_toggle"
                checked={clearGames}
                onChange={(e) => setClearGames(e.target.checked)}
                className="w-4 h-4 rounded border-[#30363D] text-red-500 focus:ring-red-500 cursor-pointer"
              />
              <label htmlFor="clear_games_toggle" className="text-xs text-gray-300 cursor-pointer select-none">
                同時刪除該賽季所有單場賽事、Box 與 PBP 紀錄
              </label>
            </div>

            <button
              onClick={handleResetStage}
              disabled={resetLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
            >
              {resetLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{resetLoading ? '正在徹底重置賽季中...' : '🚨 執行全賽季資料徹底清空'}</span>
            </button>
          </div>

          {resetResult && (
            <pre className="p-3 rounded-xl bg-[#0E1117] border border-[#30363D] text-xs font-mono text-red-300 overflow-x-auto max-h-32">
              {resetResult}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}