'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

// ==========================================
// 🔑 管理員密碼設定處 (可隨時在此修改)
// ==========================================
const ADMIN_PASSWORD = 'Oilkingmeng@1314';

export default function SystemConsolePage() {
  const { stage: currentStage, stagesList } = useStage();

  // 密碼保護狀態
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 檢查目前工作階段 (Session) 是否已解鎖過
  useEffect(() => {
    const authStatus = sessionStorage.getItem('tpbl_console_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('tpbl_console_auth', 'true');
      setErrorMsg('');
      setPasswordInput('');
    } else {
      setErrorMsg('密碼錯誤，請重新輸入！');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('tpbl_console_auth');
    setPasswordInput('');
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

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://tpbl-advstat-api.onrender.com';

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
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#FF9100] to-amber-500 py-2.5 text-sm font-black text-slate-950 transition hover:from-amber-400 hover:to-[#FF9100]"
            >
              解鎖並進入控制台
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