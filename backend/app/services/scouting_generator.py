import json
import os
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field, field_validator

from app.database import BACKEND_DIR, DATA_DIR, get_db_connection

PROJECT_ROOT = BACKEND_DIR.parent
BACKEND_PREVIEWS_DIR = DATA_DIR / "weekly_previews"
FRONTEND_PREVIEWS_DIR = PROJECT_ROOT / "frontend" / "public" / "weekly_previews"
INJURY_REPORT_JSON_PATH = DATA_DIR / "injury_report.json"

TEAM_SLUG_CODE = {
    "新北國王": "kings",
    "臺北台新戰神": "mars",
    "新北中信特攻": "dea",
    "桃園台啤永豐雲豹": "leopards",
    "新竹御嵿攻城獅": "lioneers",
    "福爾摩沙夢想家": "dreamers",
    "高雄全家海神": "aquas",
}


# =====================================================================
# Pydantic Structured Output Schemas (與前端 TacticalPlaybookBoard 1:1 對齊)
# =====================================================================

class TeamMetricsSummary(BaseModel):
    record: str = Field(description="官方戰績，例如 2勝-1敗")
    games_played: int
    pace: float
    ortg: float
    drtg: float
    net_rtg: float
    efg_pct: float
    three_par: float
    tov_pct: float
    orb_pct: float
    ftr: float
    recent_ppg: float = Field(description="近期實戰場均得分")
    recent_opp_ppg: float = Field(description="近期實戰場均失分")
    high_usg_core: str
    high_eff_finisher: str


class IllusionReality(BaseModel):
    team_name: str
    data_illusion: str = Field(description="表面看起來不錯或具誤導性的數據假象（必須引用真實數字）")
    real_flaw: str = Field(description="進階數據或對位中揭露的真實短板")


class SituationAnalysis(BaseModel):
    overview: str = Field(description="賽前整體局勢與節奏走向分析")
    home_illusion_vs_reality: IllusionReality
    away_illusion_vs_reality: IllusionReality


class KeyMatchup(BaseModel):
    category: str = Field(description="例如：後場發動機、側翼大鎖、禁區護框與體系博弈")
    title: str
    home_player: str
    away_player: str
    stat_comparison: str = Field(description="雙方真實數據直接對比字串")
    analysis: str = Field(description="深度攻防拆解")


_PATH_TYPE_SYNONYMS = {
    # 虛線無球跑位 / 掩護
    "run": "screen",
    "cut": "screen",
    "roll": "screen",
    "pop": "screen",
    "flare": "screen",
    "move": "screen",
    "offball": "screen",
    "off-ball": "screen",
    "screen": "screen",
    "pick": "screen",
    # 實線持球切入 / 運球
    "drive": "dribble",
    "attack": "dribble",
    "slash": "dribble",
    "dribble": "dribble",
    "iso": "dribble",
    # 點線傳球 / 出手路徑
    "shot": "pass",
    "shoot": "pass",
    "assist": "pass",
    "lob": "pass",
    "kickout": "pass",
    "kick-out": "pass",
    "pass": "pass",
    "swing": "pass",
    # 紅色防守輪轉
    "rotate": "defense",
    "trap": "defense",
    "blitz": "defense",
    "ice": "defense",
    "hedge": "defense",
    "closeout": "defense",
    "close-out": "defense",
    "help": "defense",
    "defense": "defense",
    "defend": "defense",
    "recover": "defense",
    "switch": "defense",
}


class TacticalPathModel(BaseModel):
    from_pos: List[float] = Field(alias="from", min_length=2, max_length=2, description="[x, y] 起點座標 (0..500, 0..470)")
    to: List[float] = Field(min_length=2, max_length=2, description="[x, y] 終點座標 (0..500, 0..470)")
    type: Literal["dribble", "screen", "pass", "defense"]

    model_config = {"populate_by_name": True}

    @field_validator("type", mode="before")
    @classmethod
    def normalize_path_type(cls, v):
        raw = str(v or "").strip().lower()
        return _PATH_TYPE_SYNONYMS.get(raw, "screen")


class TacticalPhaseModel(BaseModel):
    title: str
    description: str
    keyRead: str
    ballPos: List[float] = Field(min_length=2, max_length=2)
    offense: List[List[float]] = Field(min_length=5, max_length=5, description="5 名進攻球員 [x, y] 座標")
    defense: List[List[float]] = Field(min_length=5, max_length=5, description="5 名防守球員 [x, y] 座標")
    paths: List[TacticalPathModel]


class BallFrameModel(BaseModel):
    t: float = Field(ge=0.0, le=2.0, description="時間進度 0.0~2.0")
    pos: List[float] = Field(min_length=2, max_length=2, description="籃球 [x, y] 座標")
    inAir: bool = Field(default=False, description="是否處於傳球或投籃飛行中")
    isShot: bool = Field(default=False, description="是否為投籃出手軌跡")


class TacticalScenarioModel(BaseModel):
    key: Literal["home_offense", "away_counter", "away_offense", "home_counter"]
    label: str
    playName: str
    tacticalGoal: str
    offenseTeam: Literal["home", "away"]
    phases: List[TacticalPhaseModel] = Field(min_length=3, max_length=3)
    ballFrames: Optional[List[BallFrameModel]] = Field(
        default=None,
        description="選填：0.0~2.0 獨立籃球傳球飛行與出手關鍵幀",
    )


class XFactorItem(BaseModel):
    player: str
    role_tag: str
    reason: str


class XFactorsAndPrediction(BaseModel):
    home_x_factor: XFactorItem
    away_x_factor: XFactorItem
    predicted_home_score: int
    predicted_away_score: int
    predicted_margin_range: str = Field(description="例如：主隊讓 3～6 分 或 客隊險勝 2～5 分")
    fun_prediction_verdict: str = Field(description="帶有球探觀點與趣味性的賽前總結預測")
    home_win_conditions: List[str] = Field(min_length=2, max_length=4)
    away_win_conditions: List[str] = Field(min_length=2, max_length=4)


class GeminiReportPayload(BaseModel):
    """Gemini Structured Outputs 生成的核心內容"""
    headline: str = Field(description="吸睛的球探專欄主標題")
    subheadline: str = Field(description="副標題，點出數據矛盾與看點")
    home_win_prob: float = Field(ge=5.0, le=95.0, description="主隊模型預估勝率 (0-100)")
    away_win_prob: float = Field(ge=5.0, le=95.0, description="客隊模型預估勝率 (0-100)")
    home_roster: List[str] = Field(min_length=5, max_length=5, description="主隊 1～5 號位真實先發球員姓名")
    away_roster: List[str] = Field(min_length=5, max_length=5, description="客隊 1～5 號位真實先發球員姓名")
    situation_analysis: SituationAnalysis
    key_matchups: List[KeyMatchup] = Field(min_length=3, max_length=3)
    tactical_scenarios: List[TacticalScenarioModel] = Field(min_length=4, max_length=4)
    x_factors_and_prediction: XFactorsAndPrediction


class WeeklyPreviewReport(BaseModel):
    """完整落盤與 API 回傳之週報格式"""
    slug: str
    game_date: str
    game_label: str
    season_stage: str
    home_team: str
    away_team: str
    generated_at: str
    model_used: str
    headline: str
    subheadline: str
    home_win_prob: float
    away_win_prob: float
    home_summary: TeamMetricsSummary
    away_summary: TeamMetricsSummary
    home_roster: List[str]
    away_roster: List[str]
    situation_analysis: SituationAnalysis
    key_matchups: List[KeyMatchup]
    tactical_scenarios: List[TacticalScenarioModel]
    x_factors_and_prediction: XFactorsAndPrediction


# =====================================================================
# 工具函式：Slug、雙向快取目錄、模型動態掃描
# =====================================================================

def make_preview_slug(game_date: str, home_team: str, away_team: str) -> str:
    clean_date = re.sub(r"[^0-9\-]", "", game_date or datetime.now().strftime("%Y-%m-%d"))
    h_code = TEAM_SLUG_CODE.get(home_team, "home")
    a_code = TEAM_SLUG_CODE.get(away_team, "away")
    return f"{clean_date}-{h_code}-vs-{a_code}"


def _ensure_preview_dirs() -> None:
    BACKEND_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)


def _rebuild_index_files() -> None:
    """重建 backend 與 frontend/public 的 index.json 清單"""
    _ensure_preview_dirs()
    summaries = []
    for p in sorted(BACKEND_PREVIEWS_DIR.glob("*.json"), reverse=True):
        if p.name in {"index.json", "team_playbook_library.json"}:
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            summaries.append({
                "slug": data.get("slug", p.stem),
                "game_date": data.get("game_date", ""),
                "game_label": data.get("game_label", ""),
                "season_stage": data.get("season_stage", ""),
                "home_team": data.get("home_team", ""),
                "away_team": data.get("away_team", ""),
                "headline": data.get("headline", ""),
                "subheadline": data.get("subheadline", ""),
                "home_win_prob": data.get("home_win_prob", 50),
                "away_win_prob": data.get("away_win_prob", 50),
                "generated_at": data.get("generated_at", ""),
                "model_used": data.get("model_used", ""),
            })
        except Exception:
            continue

    summaries.sort(key=lambda x: (x.get("game_date", ""), x.get("generated_at", "")), reverse=True)
    index_text = json.dumps(summaries, ensure_ascii=False, indent=2)
    (BACKEND_PREVIEWS_DIR / "index.json").write_text(index_text, encoding="utf-8")
    (FRONTEND_PREVIEWS_DIR / "index.json").write_text(index_text, encoding="utf-8")


def _templatize_text(text: str, off_roster: List[str], def_roster: List[str]) -> str:
    """將具體球員姓名轉回 {O1}~{O5} / {D1}~{D5} 佔位符，供 /matchup 任意陣容動態綁定"""
    out = text or ""
    for idx, name in enumerate(off_roster[:5]):
        if name:
            out = out.replace(name, f"{{O{idx + 1}}}")
    for idx, name in enumerate(def_roster[:5]):
        if name:
            out = out.replace(name, f"{{D{idx + 1}}}")
    return out


def _templatize_scenario_for_library(
    sc_dict: Dict,
    off_roster: List[str],
    def_roster: List[str],
) -> Dict:
    cloned = json.loads(json.dumps(sc_dict, ensure_ascii=False))
    cloned["playName"] = _templatize_text(cloned.get("playName", ""), off_roster, def_roster)
    cloned["tacticalGoal"] = _templatize_text(cloned.get("tacticalGoal", ""), off_roster, def_roster)
    for ph in cloned.get("phases", []):
        ph["title"] = _templatize_text(ph.get("title", ""), off_roster, def_roster)
        ph["description"] = _templatize_text(ph.get("description", ""), off_roster, def_roster)
        if ph.get("keyRead"):
            ph["keyRead"] = _templatize_text(ph["keyRead"], off_roster, def_roster)
    return cloned


def update_team_playbook_library(report: WeeklyPreviewReport) -> Path:
    """從週報萃取 4 套戰術並按球隊與攻/守分類去重累積（每隊各分類最多保留最新 6 套）"""
    _ensure_preview_dirs()
    lib_backend = BACKEND_PREVIEWS_DIR / "team_playbook_library.json"
    lib_frontend = FRONTEND_PREVIEWS_DIR / "team_playbook_library.json"

    if lib_backend.exists():
        try:
            library: Dict[str, Dict[str, List[Dict]]] = json.loads(lib_backend.read_text(encoding="utf-8"))
        except Exception:
            library = {}
    else:
        library = {}

    for sc in report.tactical_scenarios:
        sc_dict = sc.model_dump(by_alias=True)
        key = sc_dict.get("key")
        if key == "home_offense":
            team_key, side = report.home_team, "offense"
            off_r, def_r = report.home_roster, report.away_roster
        elif key == "away_counter":
            team_key, side = report.away_team, "defense"
            off_r, def_r = report.home_roster, report.away_roster
        elif key == "away_offense":
            team_key, side = report.away_team, "offense"
            off_r, def_r = report.away_roster, report.home_roster
        elif key == "home_counter":
            team_key, side = report.home_team, "defense"
            off_r, def_r = report.away_roster, report.home_roster
        else:
            continue

        templated = _templatize_scenario_for_library(sc_dict, off_r, def_r)
        team_bucket = library.setdefault(team_key, {"offense": [], "defense": []})
        existing = team_bucket.setdefault(side, [])

        # 依 playName 去重，最新累積放最前面，最多保留 6 套
        filtered = [item for item in existing if item.get("playName") != templated.get("playName")]
        team_bucket[side] = [templated, *filtered][:6]

    lib_json = json.dumps(library, ensure_ascii=False, indent=2)
    lib_backend.write_text(lib_json, encoding="utf-8")
    lib_frontend.write_text(lib_json, encoding="utf-8")
    return lib_backend


def save_weekly_preview(report: WeeklyPreviewReport) -> Path:
    """將週報同時落盤至 backend/data/weekly_previews 與 frontend/public/weekly_previews，並更新 7 隊戰術庫"""
    _ensure_preview_dirs()
    payload = report.model_dump(by_alias=True)
    json_str = json.dumps(payload, ensure_ascii=False, indent=2)

    backend_file = BACKEND_PREVIEWS_DIR / f"{report.slug}.json"
    frontend_file = FRONTEND_PREVIEWS_DIR / f"{report.slug}.json"

    backend_file.write_text(json_str, encoding="utf-8")
    shutil.copy2(backend_file, frontend_file)
    update_team_playbook_library(report)
    _rebuild_index_files()
    return backend_file


def list_saved_previews() -> List[Dict]:
    _ensure_preview_dirs()
    index_file = BACKEND_PREVIEWS_DIR / "index.json"
    if not index_file.exists():
        _rebuild_index_files()
    try:
        return json.loads(index_file.read_text(encoding="utf-8"))
    except Exception:
        return []


def get_saved_preview(slug: str) -> Optional[Dict]:
    safe_slug = re.sub(r"[^a-zA-Z0-9_\-]", "", slug)
    target = BACKEND_PREVIEWS_DIR / f"{safe_slug}.json"
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def delete_weekly_preview(slug: str) -> bool:
    """刪除指定週報 JSON（同步移除 backend 與 frontend/public 檔案並更新 index.json）"""
    safe_slug = re.sub(r"[^a-zA-Z0-9_\-]", "", slug)
    backend_file = BACKEND_PREVIEWS_DIR / f"{safe_slug}.json"
    frontend_file = FRONTEND_PREVIEWS_DIR / f"{safe_slug}.json"
    if not backend_file.exists() and not frontend_file.exists():
        return False
    if backend_file.exists():
        backend_file.unlink()
    if frontend_file.exists():
        frontend_file.unlink()
    _rebuild_index_files()
    return True


# =====================================================================
# 零幻覺真實數據 Context 撈取
# =====================================================================

def _pick_latest_stage(conn: sqlite3.Connection) -> str:
    rows = [r[0] for r in conn.execute("SELECT DISTINCT season_stage FROM team_summary").fetchall()]
    for preferred in ("2026-2027 例行賽", "2025-2026 例行賽", "2024-2025 例行賽"):
        if preferred in rows:
            return preferred
    return rows[0] if rows else "2026-2027 例行賽"


def _fetch_team_context(conn: sqlite3.Connection, stage: str, team_name: str) -> Dict:
    row = conn.execute(
        """
        SELECT team_name, games_played, record, pace, ortg, drtg, net_rtg,
               efg_pct, three_par, tov_pct, orb_pct, ftr,
               high_usg_core, high_eff_finisher, system_notes
        FROM team_summary
        WHERE season_stage = ? AND team_name = ?
        """,
        (stage, team_name),
    ).fetchone()

    games = conn.execute(
        """
        SELECT date, home_team, away_team, home_score, away_score, status
        FROM games
        WHERE stage = ? AND (home_team = ? OR away_team = ?) AND status LIKE 'FINAL%'
        ORDER BY date DESC
        LIMIT 5
        """,
        (stage, team_name, team_name),
    ).fetchall()

    recent_pts: List[int] = []
    recent_opp_pts: List[int] = []
    recent_results: List[str] = []
    for g in games:
        is_home = g["home_team"] == team_name
        pts = g["home_score"] if is_home else g["away_score"]
        opp = g["away_score"] if is_home else g["home_score"]
        if pts is not None and opp is not None:
            recent_pts.append(int(pts))
            recent_opp_pts.append(int(opp))
            opp_name = g["away_team"] if is_home else g["home_team"]
            recent_results.append(f"{g['date']} vs {opp_name} ({pts}:{opp})")

    avg_pts = round(sum(recent_pts) / len(recent_pts), 1) if recent_pts else round(row["ortg"], 1) if row else 0.0
    avg_opp = round(sum(recent_opp_pts) / len(recent_opp_pts), 1) if recent_opp_pts else round(row["drtg"], 1) if row else 0.0

    players = conn.execute(
        """
        SELECT player_name, jersey_number, position, identity, games_played,
               mpg, ppg, rpg, apg, spg, bpg, efg_pct, ts_pct, usg_pct, gmsc
        FROM player_stats
        WHERE season_stage = ? AND team_name = ?
        ORDER BY mpg DESC
        LIMIT 12
        """,
        (stage, team_name),
    ).fetchall()

    summary = {
        "record": row["record"] if row else "0勝-0敗",
        "games_played": int(row["games_played"]) if row else 0,
        "pace": float(row["pace"]) if row else 95.0,
        "ortg": float(row["ortg"]) if row else 100.0,
        "drtg": float(row["drtg"]) if row else 100.0,
        "net_rtg": float(row["net_rtg"]) if row else 0.0,
        "efg_pct": float(row["efg_pct"]) if row else 50.0,
        "three_par": float(row["three_par"]) if row else 40.0,
        "tov_pct": float(row["tov_pct"]) if row else 15.0,
        "orb_pct": float(row["orb_pct"]) if row else 28.0,
        "ftr": float(row["ftr"]) if row else 25.0,
        "recent_ppg": avg_pts,
        "recent_opp_ppg": avg_opp,
        "high_usg_core": (row["high_usg_core"] or "") if row else "",
        "high_eff_finisher": (row["high_eff_finisher"] or "") if row else "",
    }

    return {
        "team_name": team_name,
        "summary": summary,
        "recent_games": recent_results,
        "roster_stats": [dict(p) for p in players],
    }


def _match_team_short(cell_team: str, target_team: str) -> bool:
    c = str(cell_team or "").strip()
    t = str(target_team or "").strip()
    if not c or not t:
        return False
    return c == t or c in t or t in c or c[-2:] == t[-2:]


def get_all_injuries() -> List[Dict[str, str]]:
    """取得目前系統內已匯入之全聯盟傷兵名單 (backend/data/injury_report.json)"""
    if not INJURY_REPORT_JSON_PATH.exists():
        return []
    try:
        data = json.loads(INJURY_REPORT_JSON_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def build_injury_template_bytes() -> bytes:
    """動態生成標準傷兵名單 Excel 模板 (tpbl_injury_template.xlsx)"""
    from io import BytesIO
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Injury_Report"

    headers = ["球隊", "球員姓名", "狀態", "備註"]
    ws.append(headers)

    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_font = Font(color="FF9100", bold=True, size=11)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # 預填 2 列格式範例
    ws.append(["新北中信特攻", "範例球員A", "OUT", "確定缺陣（狀態可填 OUT / GTD / 輪休）"])
    ws.append(["臺北台新戰神", "範例球員B", "GTD", "賽前決定是否出賽"])

    # 7 隊標準名稱說明工作表
    ws_ref = wb.create_sheet("7隊標準名稱對照")
    ws_ref.append(["TPBL 7 隊標準球隊名稱（請複製貼上至 Injury_Report 的「球隊」欄）"])
    for t_name in TEAM_SLUG_CODE.keys():
        ws_ref.append([t_name])
    ws_ref.column_dimensions["A"].width = 48

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 44

    buf = BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def parse_and_save_injuries_excel(file_bytes: bytes) -> List[Dict[str, str]]:
    """解析上傳的傷兵 Excel 並落盤至 backend/data/injury_report.json"""
    from io import BytesIO
    import openpyxl

    wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True, read_only=True)
    try:
        sheet_name = None
        for candidate in ("Injury_Report", "傷兵名單"):
            if candidate in wb.sheetnames:
                sheet_name = candidate
                break
        if not sheet_name:
            sheet_name = wb.sheetnames[0]

        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
    finally:
        wb.close()

    if not rows:
        INJURY_REPORT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
        INJURY_REPORT_JSON_PATH.write_text("[]", encoding="utf-8")
        return []

    headers = [str(h or "").strip() for h in rows[0]]
    col_idx = {h: i for i, h in enumerate(headers)}
    team_i = col_idx.get("球隊", 0)
    player_i = col_idx.get("球員姓名", 1)
    status_i = col_idx.get("狀態", 2)
    note_i = col_idx.get("備註", 3)

    items: List[Dict[str, str]] = []
    for r in rows[1:]:
        if not r or len(r) <= max(team_i, player_i):
            continue
        t_val = str(r[team_i] or "").strip()
        p_val = str(r[player_i] or "").strip()
        if not t_val or not p_val:
            continue
        st_val = str(r[status_i] or "GTD").strip() if len(r) > status_i else "GTD"
        nt_val = str(r[note_i] or "").strip() if len(r) > note_i else ""
        items.append({
            "team": t_val,
            "player": p_val,
            "status": st_val or "GTD",
            "note": nt_val,
        })

    INJURY_REPORT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    INJURY_REPORT_JSON_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return items


def get_excel_injuries(home_team: str, away_team: str) -> Dict:
    """優先讀取已匯入之 injury_report.json；若無則掃描 Excel 中的『傷兵名單』或『Injury_Report』工作表"""
    import openpyxl

    home_injuries: List[Dict[str, str]] = []
    away_injuries: List[Dict[str, str]] = []
    seen_keys = set()

    # 1. 優先讀取管理員上傳匯入的 injury_report.json
    imported = get_all_injuries()
    if imported:
        for item in imported:
            t_val = item.get("team", "")
            p_val = item.get("player", "")
            st_val = item.get("status", "GTD")
            dedup = (p_val, st_val)
            if _match_team_short(t_val, home_team) and ("H", *dedup) not in seen_keys:
                seen_keys.add(("H", *dedup))
                home_injuries.append(item)
            elif _match_team_short(t_val, away_team) and ("A", *dedup) not in seen_keys:
                seen_keys.add(("A", *dedup))
                away_injuries.append(item)
    else:
        # 2. Fallback 掃描本地 season2026 Excel 工作表
        candidate_files: List[Path] = []
        for base_dir in [DATA_DIR / "season2026", PROJECT_ROOT / "data" / "season2026"]:
            if not base_dir.exists():
                continue
            summary_xlsx = base_dir / "tpbl_summary.xlsx"
            if summary_xlsx.exists():
                candidate_files.append(summary_xlsx)
            for f in sorted(base_dir.glob("*.xlsx")):
                if f != summary_xlsx and not f.name.startswith("~$"):
                    candidate_files.append(f)

        for xlsx_path in candidate_files:
            try:
                wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
                try:
                    target_sheets = [s for s in wb.sheetnames if s.strip() in {"傷兵名單", "Injury_Report"}]
                    for s_name in target_sheets:
                        ws = wb[s_name]
                        rows = list(ws.iter_rows(values_only=True))
                        if not rows:
                            continue
                        headers = [str(h or "").strip() for h in rows[0]]
                        col_idx = {h: i for i, h in enumerate(headers)}
                        team_i = col_idx.get("球隊", 0)
                        player_i = col_idx.get("球員姓名", 1)
                        status_i = col_idx.get("狀態", 2)
                        note_i = col_idx.get("備註", 3)

                        for r in rows[1:]:
                            if not r or len(r) <= max(team_i, player_i):
                                continue
                            t_val = str(r[team_i] or "").strip()
                            p_val = str(r[player_i] or "").strip()
                            if not t_val or not p_val:
                                continue
                            st_val = str(r[status_i] or "待定").strip() if len(r) > status_i else "待定"
                            nt_val = str(r[note_i] or "").strip() if len(r) > note_i else ""

                            item = {"team": t_val, "player": p_val, "status": st_val, "note": nt_val}
                            dedup = (p_val, st_val)
                            if _match_team_short(t_val, home_team) and ("H", *dedup) not in seen_keys:
                                seen_keys.add(("H", *dedup))
                                home_injuries.append(item)
                            elif _match_team_short(t_val, away_team) and ("A", *dedup) not in seen_keys:
                                seen_keys.add(("A", *dedup))
                                away_injuries.append(item)
                finally:
                    wb.close()
            except Exception:
                continue

    lines: List[str] = []
    if home_injuries:
        lines.append(
            f"【{home_team} 傷兵/出賽狀態】"
            + "、".join(
                f"{x['player']}（{x['status']}{'：' + x['note'] if x['note'] else ''}）"
                for x in home_injuries
            )
        )
    if away_injuries:
        lines.append(
            f"【{away_team} 傷兵/出賽狀態】"
            + "、".join(
                f"{x['player']}（{x['status']}{'：' + x['note'] if x['note'] else ''}）"
                for x in away_injuries
            )
        )

    return {
        "home_team": home_team,
        "away_team": away_team,
        "home_injuries": home_injuries,
        "away_injuries": away_injuries,
        "formatted_text": "\n".join(lines),
    }


def build_matchup_context(home_team: str, away_team: str, extra_notes: Optional[str] = None) -> Tuple[str, Dict]:
    conn = get_db_connection()
    try:
        stage = _pick_latest_stage(conn)
        home_ctx = _fetch_team_context(conn, stage, home_team)
        away_ctx = _fetch_team_context(conn, stage, away_team)
        excel_inj = get_excel_injuries(home_team, away_team)
        context = {
            "season_stage": stage,
            "home_team": home_ctx,
            "away_team": away_ctx,
            "confirmed_injuries": {
                "home_injuries": excel_inj["home_injuries"],
                "away_injuries": excel_inj["away_injuries"],
            },
            "admin_pregame_notes": extra_notes.strip() if extra_notes else (excel_inj["formatted_text"] or "無額外補充情報"),
        }
        return stage, context
    finally:
        conn.close()


# =====================================================================
# 動態掃描最新可用 Gemini 模型 & 呼叫 Structured Outputs
# =====================================================================

_EXCLUDED_MODEL_TOKENS = (
    "embedding",
    "imagen",
    "veo",
    "tts",
    "image",
    "audio",
    "robotics",
    "computer-use",
    "lyria",
    "aqa",
    "bisect",
    "transcribe",
    "customtools",
    "live",
    "native-audio",
    "dialog",
)


def _is_supported_text_gemini_model(model_obj) -> Optional[str]:
    """檢查模型是否為支援 generateContent 的 Gemini 主力文字推理模型"""
    name = getattr(model_obj, "name", "") or ""
    if "gemini" not in name.lower():
        return None
    methods = getattr(model_obj, "supported_actions", None) or getattr(model_obj, "supported_generation_methods", None) or []
    if methods and not any("generateContent" in str(a) for a in methods):
        return None
    clean_name = name.replace("models/", "").strip()
    low = clean_name.lower()
    if any(tok in low for tok in _EXCLUDED_MODEL_TOKENS):
        return None
    return clean_name


def _gemini_model_sort_key(name: str):
    """依版本由新到舊排序（同版本優先 Pro -> Flash -> Flash-Lite，穩定版優先於 Preview/Exp）"""
    low = name.lower()
    m = re.search(r"gemini-(\d+)(?:\.(\d+))?", low)
    if m:
        major = int(m.group(1))
        minor = int(m.group(2) or 0)
    elif "latest" in low:
        major, minor = 2, 4
    else:
        major, minor = 1, 0
    tier = 0 if "-pro" in low else (1 if "flash" in low and "lite" not in low else 2)
    is_preview = 1 if ("preview" in low or "exp" in low) else 0
    return (-major, -minor, tier, is_preview, low)


def select_best_gemini_model(client, available_names: Optional[List[str]] = None) -> str:
    """動態掃描可用 Gemini 模型，優先選用最新推理旗艦模型，不寫死過時型號"""
    if available_names is None:
        available_names = []
        try:
            for m in client.models.list():
                clean_name = _is_supported_text_gemini_model(m)
                if clean_name:
                    available_names.append(clean_name)
        except Exception:
            pass

    priority_patterns = [
        r"^gemini-3\.1-pro",
        r"^gemini-3.*pro",
        r"^gemini-2\.5-pro",
        r"^gemini-pro-latest",
        r"^gemini-3",
        r"^gemini-2\.5-flash",
        r"^gemini-flash-latest",
        r"^gemini-2\.0-flash",
        r"^gemini-2",
    ]
    for pattern in priority_patterns:
        matches = [n for n in available_names if re.match(pattern, n)]
        if matches:
            matches.sort(key=_gemini_model_sort_key)
            return matches[0]

    if available_names:
        sorted_all = sorted(dict.fromkeys(available_names), key=_gemini_model_sort_key)
        return sorted_all[0]
    return "gemini-2.5-pro"


def _strip_json_markdown_fences(raw_text: str) -> str:
    """清理 Gemini 回傳文字中可能夾帶的 Markdown 代碼區塊標記"""
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _normalize_gemini_payload(raw_data: Dict, context: Dict) -> Dict:
    """補齊非核心欄位預設值並正規化，確保 Pydantic 驗證穩定通過"""
    data = dict(raw_data or {})

    # 1. 勝率互補與範圍夾緊
    try:
        h_prob = float(data.get("home_win_prob", 50.0))
    except (TypeError, ValueError):
        h_prob = 50.0
    h_prob = max(5.0, min(95.0, h_prob))
    data["home_win_prob"] = round(h_prob, 1)
    data["away_win_prob"] = round(100.0 - h_prob, 1)

    # 2. 先發五人名單預設補齊
    for side, key in (("home_team", "home_roster"), ("away_team", "away_roster")):
        roster = data.get(key)
        if not isinstance(roster, list) or len(roster) != 5:
            fallback_players = [p.get("name", "") for p in context.get(side, {}).get("roster_stats", []) if p.get("name")]
            clean_roster = [str(x) for x in (roster or []) if x][:5]
            for fp in fallback_players:
                if len(clean_roster) >= 5:
                    break
                if fp not in clean_roster:
                    clean_roster.append(fp)
            while len(clean_roster) < 5:
                clean_roster.append(f"先發球員{len(clean_roster) + 1}")
            data[key] = clean_roster

    # 3. 關鍵預測條件長度正規化
    xf = data.get("x_factors_and_prediction")
    if isinstance(xf, dict):
        for cond_key, default_conds in (
            ("home_win_conditions", ["維持外線命中率與防守輪轉紀律", "保護防守籃板並控制失誤次數"]),
            ("away_win_conditions", ["壓迫對手持球發動機", "把握轉換快攻與底角空檔"]),
        ):
            conds = xf.get(cond_key)
            if not isinstance(conds, list) or len(conds) < 2:
                existing = [str(c) for c in (conds or []) if c]
                for dc in default_conds:
                    if len(existing) >= 2:
                        break
                    existing.append(dc)
                xf[cond_key] = existing
            elif len(conds) > 4:
                xf[cond_key] = conds[:4]

    # 4. 戰術 paths 若使用 from_pos 轉為 from
    scenarios = data.get("tactical_scenarios")
    if isinstance(scenarios, list):
        for sc in scenarios:
            if not isinstance(sc, dict):
                continue
            for ph in sc.get("phases") or []:
                if not isinstance(ph, dict):
                    continue
                for path in ph.get("paths") or []:
                    if isinstance(path, dict) and "from" not in path and "from_pos" in path:
                        path["from"] = path.pop("from_pos")

    return data


def _build_weekly_preview_prompts(
    home_team: str,
    away_team: str,
    game_date: str,
    game_label: str,
    extra_notes: Optional[str] = None,
) -> Tuple[str, Dict, str, str]:
    """組裝包含真實球隊數據與確認傷兵的完整 System/User Prompt"""
    stage, context = build_matchup_context(home_team, away_team, extra_notes)

    json_template = """{
  "headline": "吸睛的球探專欄主標題（繁體中文）",
  "subheadline": "副標題，點出數據矛盾與看點",
  "home_win_prob": 54.5,
  "away_win_prob": 45.5,
  "home_roster": ["1號位PG姓名", "2號位SG姓名", "3號位SF姓名", "4號位PF姓名", "5號位C姓名"],
  "away_roster": ["1號位PG姓名", "2號位SG姓名", "3號位SF姓名", "4號位PF姓名", "5號位C姓名"],
  "situation_analysis": {
    "overview": "賽前整體局勢與節奏走向分析",
    "home_illusion_vs_reality": {
      "team_name": "主隊隊名",
      "data_illusion": "表面數據假象（引用真實數字）",
      "real_flaw": "進階數據或對位揭露的真實短板"
    },
    "away_illusion_vs_reality": {
      "team_name": "客隊隊名",
      "data_illusion": "表面數據假象（引用真實數字）",
      "real_flaw": "進階數據或對位揭露的真實短板"
    }
  },
  "key_matchups": [
    {
      "category": "後場發動機 / 側翼大鎖 / 禁區護框與體系博弈",
      "title": "對位標題",
      "home_player": "主隊球員姓名",
      "away_player": "客隊球員姓名",
      "stat_comparison": "雙方真實數據直接對比字串",
      "analysis": "深度攻防拆解"
    }
  ],
  "tactical_scenarios": [
    {
      "key": "home_offense",
      "label": "主隊進攻破解",
      "playName": "戰術名稱",
      "tacticalGoal": "戰術目標說明（可使用 {O1}~{O5} 與 {D1}~{D5}）",
      "offenseTeam": "home",
      "phases": [
        {
          "title": "階段標題",
          "description": "戰術動作說明（嚴禁出現 px 或座標代碼）",
          "keyRead": "關鍵閱讀點",
          "ballPos": [250, 140],
          "offense": [[250,140],[380,190],[110,190],[140,320],[290,220]],
          "defense": [[250,180],[350,210],[145,215],[175,335],[270,255]],
          "paths": [{"from": [250,140], "to": [265,205], "type": "dribble"}]
        }
      ],
      "ballFrames": [
        {"t": 0.0, "pos": [250,140], "inAir": false, "isShot": false},
        {"t": 1.2, "pos": [120,250], "inAir": true, "isShot": false},
        {"t": 1.85, "pos": [250,407], "inAir": true, "isShot": true}
      ]
    }
  ],
  "x_factors_and_prediction": {
    "home_x_factor": {"player": "球員姓名", "role_tag": "關鍵標籤", "reason": "影響比賽理由"},
    "away_x_factor": {"player": "球員姓名", "role_tag": "關鍵標籤", "reason": "影響比賽理由"},
    "predicted_home_score": 96,
    "predicted_away_score": 92,
    "predicted_margin_range": "主隊讓 3～6 分",
    "fun_prediction_verdict": "帶有球探觀點與趣味性的賽前總結預測",
    "home_win_conditions": ["勝利條件1", "勝利條件2"],
    "away_win_conditions": ["勝利條件1", "勝利條件2"]
  }
}"""

    system_instruction = (
        "你是 TPBL 臺灣職業籃球大聯盟首席進階數據球探與戰術分析師。\n"
        "【零幻覺鐵律】\n"
        "1. 你只能根據以下提供的真實 Context JSON（包含官方戰績、近期得分/失分、Dean Oliver 四要素、球權負荷 USG%、登錄球員真實名單與場均數據、confirmed_injuries 傷兵清單，以及 admin_pregame_notes 管理員補充情報）撰寫分析與設計戰術。\n"
        "2. 嚴禁編造任何未在 confirmed_injuries 或 admin_pregame_notes 中出現的傷兵名單、總教練姓名、交易傳聞或虛構統計數字。\n"
        "3. tactical_scenarios 必須嚴格產出 4 套（key 依序為 home_offense, away_counter, away_offense, home_counter；其中 home_offense/home_counter 之 offenseTeam 為 home 或對應進攻方，away_offense/away_counter 亦同），每套包含 3 個 phases（啟動落位 -> 掩護/包夾施壓 -> 傳球轉移與輪轉終結），座標範圍為半場 SVG x: [40..460], y: [70..430]（籃框在 [250, 407]，三分線弧頂約 [250, 203]）。paths.type 只能是 dribble、screen、pass、defense 之一。\n"
        "4. 【嚴格空間座標、佔位符動態綁定與動作一致性規範】：\n"
        "   - 嚴禁在任何 playName、tacticalGoal、title、description、keyRead 文案中輸出像素數值（例如 28px、32px），一律使用純粹的籃球專業術語；\n"
        "   - 在戰術文案中優先使用佔位符 {O1}～{O5}（代表進攻方 1～5 號位）與 {D1}～{D5}（代表防守方 1～5 號位）來指代場上球員，或嚴格對應場上 1～5 號位座標，確保圖面圓標與文字永遠 100% 一致；\n"
        "   - 場上 10 名球員（offense[0..4] 與 defense[0..4]）任兩名球員距離不得過近重疊（彼此保持合理籃球站位間距）；\n"
        "   - 若描述雙人包夾某位特定球員（例如 {O2}），兩名防守者在階段 2 的座標必須真正移動至 offense[1] 左右 45 度角合圍；若描述弱側內縮漏出底角空檔，弱側防守者座標必須真正移動至油漆區邊緣並留出底角射手空檔；\n"
        "   - 安排底角三分空檔終結時，必須優先分配給 2 號位（SG）、3 號位（SF）或數據中 3PAr（三分出手比重）較高的外圍射手，嚴禁將純禁區苦工洋將安排為底角定點三分射手；\n"
        "   - 每套戰術必須同步產出 ballFrames（t 範圍 0.0~2.0），包含傳球飛行時間窗（inAir: true）與最終接球出手軌跡（isShot: true）。\n"
        "5. home_roster 與 away_roster 必須各填入 5 名真實存在於 Context JSON roster_stats 中的球員姓名（依 1～5 號位排列）。key_matchups 必須嚴格產出 3 組。\n"
        "6. 語氣兼具專業數據深度與球迷愛看的趣味預測感（繁體中文）。\n"
        "7. 請嚴格輸出純合法 JSON（不要附加任何解說文字或 Markdown 標記），欄位鍵名必須完全符合以下範本結構：\n"
        f"{json_template}"
    )

    user_prompt = (
        f"請為 {game_date} 的 {game_label}（主隊：{home_team} vs 客隊：{away_team}）生成完整深度球探預測報告。\n\n"
        f"真實數據 Context JSON：\n{json.dumps(context, ensure_ascii=False, indent=2)}"
    )
    return stage, context, system_instruction, user_prompt


def _finalize_and_save_report(
    raw_text: str,
    context: Dict,
    stage: str,
    home_team: str,
    away_team: str,
    game_date: str,
    game_label: str,
    model_used: str,
) -> WeeklyPreviewReport:
    """清理 Markdown 標記、執行容錯正規化與 Pydantic 驗證後落盤並更新戰術庫"""
    cleaned_text = _strip_json_markdown_fences(raw_text)
    raw_dict = json.loads(cleaned_text)
    normalized_dict = _normalize_gemini_payload(raw_dict, context)
    parsed = GeminiReportPayload.model_validate(normalized_dict)

    slug = make_preview_slug(game_date, home_team, away_team)
    report = WeeklyPreviewReport(
        slug=slug,
        game_date=game_date,
        game_label=game_label,
        season_stage=stage,
        home_team=home_team,
        away_team=away_team,
        generated_at=datetime.now().isoformat(timespec="seconds"),
        model_used=model_used,
        headline=parsed.headline,
        subheadline=parsed.subheadline,
        home_win_prob=round(parsed.home_win_prob, 1),
        away_win_prob=round(100.0 - parsed.home_win_prob, 1),
        home_summary=TeamMetricsSummary(**context["home_team"]["summary"]),
        away_summary=TeamMetricsSummary(**context["away_team"]["summary"]),
        home_roster=parsed.home_roster,
        away_roster=parsed.away_roster,
        situation_analysis=parsed.situation_analysis,
        key_matchups=parsed.key_matchups,
        tactical_scenarios=parsed.tactical_scenarios,
        x_factors_and_prediction=parsed.x_factors_and_prediction,
    )

    save_weekly_preview(report)
    return report


def build_weekly_preview_prompt(
    home_team: str,
    away_team: str,
    game_date: str,
    game_label: str,
    extra_notes: Optional[str] = None,
) -> Dict:
    """組裝並回傳完整數據 Prompt 字串供手動複製給網頁版 LLM"""
    stage, _, system_instruction, user_prompt = _build_weekly_preview_prompts(
        home_team=home_team,
        away_team=away_team,
        game_date=game_date,
        game_label=game_label,
        extra_notes=extra_notes,
    )
    return {
        "stage": stage,
        "system_instruction": system_instruction,
        "user_prompt": user_prompt,
        "full_prompt": f"{system_instruction}\n\n---\n\n{user_prompt}",
    }


def import_weekly_preview_json(
    home_team: str,
    away_team: str,
    game_date: str,
    game_label: str,
    raw_json_text: str,
    model_used: str = "manual-json-import",
) -> WeeklyPreviewReport:
    """手動貼上 JSON 匯入：清理 Markdown 標記、容錯正規化、Pydantic 驗證並落盤發布"""
    stage, context = build_matchup_context(home_team, away_team, None)
    return _finalize_and_save_report(
        raw_text=raw_json_text,
        context=context,
        stage=stage,
        home_team=home_team,
        away_team=away_team,
        game_date=game_date,
        game_label=game_label,
        model_used=(model_used or "manual-json-import").strip(),
    )


def generate_weekly_preview(
    home_team: str,
    away_team: str,
    game_date: str,
    game_label: str,
    extra_notes: Optional[str] = None,
    model_name: Optional[str] = None,
) -> WeeklyPreviewReport:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("伺服器尚未設定 GEMINI_API_KEY 環境變數，無法呼叫 Gemini 生成報告。")

    from google import genai
    from google.genai import types

    stage, context, system_instruction, user_prompt = _build_weekly_preview_prompts(
        home_team=home_team,
        away_team=away_team,
        game_date=game_date,
        game_label=game_label,
        extra_notes=extra_notes,
    )
    client = genai.Client(api_key=api_key)
    chosen_model = (model_name or "").strip().replace("models/", "")
    model_name = chosen_model if chosen_model else select_best_gemini_model(client)

    response = client.models.generate_content(
        model=model_name,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )

    return _finalize_and_save_report(
        raw_text=response.text,
        context=context,
        stage=stage,
        home_team=home_team,
        away_team=away_team,
        game_date=game_date,
        game_label=game_label,
        model_used=model_name,
    )


def get_upcoming_schedule() -> List[Dict]:
    """讀取 season2026/upcoming_schedule.json 篩選有效且尚未完賽的近期賽程，並比對 tpbl_stats.db 與已生成報告"""
    from datetime import date, timedelta

    schedule_candidates = [
        DATA_DIR / "season2026" / "upcoming_schedule.json",
        PROJECT_ROOT / "data" / "season2026" / "upcoming_schedule.json",
        DATA_DIR / "season2026" / "schedule.json",
        PROJECT_ROOT / "data" / "season2026" / "schedule.json",
    ]
    raw_items: List[Dict] = []
    for sp in schedule_candidates:
        if sp.exists():
            try:
                loaded = json.loads(sp.read_text(encoding="utf-8"))
                if isinstance(loaded, list) and loaded:
                    raw_items = loaded
                    break
            except Exception:
                continue

    # 比對 tpbl_stats.db 的 games 表排除已完賽場次
    finished_matchups = set()
    finished_game_codes = set()
    try:
        conn = get_db_connection()
        try:
            db_rows = conn.execute(
                "SELECT id, schedule_id, date, home_team, away_team, home_score, away_score, status FROM games"
            ).fetchall()
            for r in db_rows:
                r_status = str(r["status"] or "").strip().upper()
                if r_status.startswith("FINAL") or (r["home_score"] is not None and r["away_score"] is not None):
                    r_date = str(r["date"] or "").strip().replace(".", "-").replace("/", "-")
                    r_home = str(r["home_team"] or "").strip()
                    r_away = str(r["away_team"] or "").strip()
                    if r_date and r_home and r_away:
                        finished_matchups.add((r_date, r_home, r_away))
                    r_id = str(r["id"] or "").strip()
                    if "-" in r_id and r_date:
                        code = r_id.rsplit("-", 1)[-1].strip().upper()
                        finished_game_codes.add((r_date, code))
                    if r["schedule_id"] is not None:
                        finished_game_codes.add(("OFFICIAL", str(r["schedule_id"])))
        finally:
            conn.close()
    except Exception:
        pass

    saved_slugs = {item.get("slug") for item in list_saved_previews() if item.get("slug")}
    today_str = date.today().isoformat()
    cutoff_str = (date.today() + timedelta(days=14)).isoformat()

    upcoming_all: List[Dict] = []
    for row in raw_items:
        home_t = str(row.get("home_team") or "").strip()
        away_t = str(row.get("away_team") or "").strip()
        if not home_t or not away_t:
            continue

        raw_date = str(row.get("date") or "").strip()
        iso_date = raw_date.replace(".", "-").replace("/", "-")
        if not iso_date or iso_date < today_str:
            continue

        status = str(row.get("status") or "").strip().upper()
        h_score = row.get("home_score")
        a_score = row.get("away_score")
        is_finished = status.startswith("FINAL") or (h_score is not None and a_score is not None)
        if is_finished:
            continue

        game_id = str(row.get("game_id") or "").strip()
        official_id = row.get("official_id")
        if (iso_date, home_t, away_t) in finished_matchups:
            continue
        if game_id and (iso_date, game_id.upper()) in finished_game_codes:
            continue
        if official_id is not None and ("OFFICIAL", str(official_id)) in finished_game_codes:
            continue

        slug = make_preview_slug(iso_date, home_t, away_t)
        upcoming_all.append({
            "game_id": game_id,
            "date": iso_date,
            "time": str(row.get("time") or "").strip(),
            "home_team": home_t,
            "away_team": away_t,
            "venue": str(row.get("venue") or "").strip(),
            "has_report": slug in saved_slugs,
            "slug": slug,
        })

    upcoming_all.sort(key=lambda x: (x["date"], x["time"]))
    within_14 = [g for g in upcoming_all if g["date"] <= cutoff_str]
    return within_14 if within_14 else upcoming_all[:6]


def ping_gemini_api() -> Dict:
    """測試 GEMINI_API_KEY 是否有效並動態列出最新可用模型"""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {
            "ok": False,
            "configured": False,
            "selected_model": None,
            "available_models": [],
            "message": "伺服器尚未設定 GEMINI_API_KEY 環境變數。",
        }

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        available_set = []
        seen = set()
        for m in client.models.list():
            clean_name = _is_supported_text_gemini_model(m)
            if clean_name and clean_name not in seen:
                seen.add(clean_name)
                available_set.append(clean_name)

        available_sorted = sorted(available_set, key=_gemini_model_sort_key)
        best_model = select_best_gemini_model(client, available_sorted)
        return {
            "ok": True,
            "configured": True,
            "selected_model": best_model,
            "available_models": available_sorted[:12],
            "message": f"Gemini API 連線正常，優先推理模型：{best_model}",
        }
    except Exception as e:
        return {
            "ok": False,
            "configured": True,
            "selected_model": None,
            "available_models": [],
            "message": f"Gemini API 連線測試失敗：{e}",
        }
