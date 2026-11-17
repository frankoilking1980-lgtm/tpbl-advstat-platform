import copy
import re
from typing import Any, Dict, List, Optional

_TEAM_PREFIX_RE = re.compile(
    r"^(?:新北中信特攻|新北國王|福爾摩沙夢想家|高雄全家海神|桃園台啤永豐雲豹|臺北台新戰神|台北台新戰神|新竹御嵿攻城獅|新竹御頂攻城獅|中信特攻|新北特攻|台新戰神|台北戰神|臺北戰神|桃園雲豹|台啤雲豹|高雄海神|新竹攻城獅|特攻|國王|夢想家|海神|雲豹|戰神|攻城獅)\s*[｜|]\s*"
)

_DEFAULT_TAGS_BY_SIDE = {
    "offense": ["進攻戰術", "團隊配合", "半場陣地戰"],
    "defense": ["防守反制", "輪轉協防", "壓迫防守"],
}


def strip_team_prefix(name: str) -> str:
    cleaned = str(name or "").strip()
    return _TEAM_PREFIX_RE.sub("", cleaned).strip()


def _is_valid_phase(ph: Any) -> bool:
    if not isinstance(ph, dict):
        return False
    title = str(ph.get("title") or "").strip()
    desc = str(ph.get("description") or "").strip()
    off = ph.get("offense")
    dfn = ph.get("defense")
    if len(title) < 2 or len(desc) < 4:
        return False
    if not isinstance(off, list) or len(off) != 5:
        return False
    if not isinstance(dfn, list) or len(dfn) != 5:
        return False
    return True


def sanitize_playbook_item(
    raw: Any,
    *,
    require_tags: bool = False,
    strip_clip_info: bool = False,
    default_side: str = "offense",
) -> Optional[Dict[str, Any]]:
    """
    驗證並正規化單筆戰術資料：
    - 過濾缺少 stages (<3)、缺少 tags (當 require_tags=True)、或 title/summary < 4 字的殘缺髒資料（如 'P' / 'G'）
    - 自動剔除標題中多餘的「隊名｜」前綴
    - 確保輸出統一包含 tacticalPattern (tactic_name)、3~6 個 tacticalTags、playName、tacticalGoal、3 階段 phases
    """
    if not isinstance(raw, dict):
        return None

    raw_name = raw.get("playName") or raw.get("title") or ""
    play_name = strip_team_prefix(str(raw_name))
    goal = str(raw.get("tacticalGoal") or raw.get("summary") or "").strip()
    phases = raw.get("phases") or raw.get("stages") or []

    if len(play_name) < 4 or len(goal) < 4:
        return None
    if not isinstance(phases, list) or len(phases) < 3:
        return None
    if not all(_is_valid_phase(ph) for ph in phases[:3]):
        return None

    raw_tags = raw.get("tacticalTags") or raw.get("tags") or []
    tags: List[str] = []
    if isinstance(raw_tags, list):
        for t in raw_tags:
            ts = str(t or "").strip()
            if len(ts) >= 2 and ts not in tags:
                tags.append(ts)

    if require_tags and len(tags) == 0:
        return None

    tactical_pattern = str(raw.get("tacticalPattern") or raw.get("tactic_name") or "").strip()
    if len(tactical_pattern) < 2:
        tactical_pattern = play_name

    if tactical_pattern not in tags:
        tags.insert(0, tactical_pattern)

    side = str(raw.get("side") or default_side or "offense").strip()
    if side not in {"offense", "defense"}:
        side = "offense"
    for fallback_tag in _DEFAULT_TAGS_BY_SIDE[side]:
        if len(tags) >= 3:
            break
        if fallback_tag not in tags:
            tags.append(fallback_tag)
    tags = tags[:6]

    cleaned = copy.deepcopy(raw)
    cleaned["playName"] = play_name
    cleaned["tacticalGoal"] = goal
    cleaned["tacticalPattern"] = tactical_pattern
    cleaned["tacticalTags"] = tags
    cleaned["phases"] = phases[:3]

    if strip_clip_info:
        for k in (
            "relatedPlays",
            "related_plays",
            "youtubeSeconds",
            "youtubeUrl",
            "sourceQuarter",
            "sourceClock",
            "eventSummary",
        ):
            cleaned.pop(k, None)

    return cleaned


def filter_clean_playbook_list(
    items: Any,
    *,
    limit: int = 2,
    require_tags: bool = False,
    strip_clip_info: bool = False,
    default_side: str = "offense",
) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    result: List[Dict[str, Any]] = []
    seen_names = set()
    for raw in items:
        cleaned = sanitize_playbook_item(
            raw,
            require_tags=require_tags,
            strip_clip_info=strip_clip_info,
            default_side=default_side,
        )
        if not cleaned:
            continue
        if cleaned["playName"] in seen_names:
            continue
        seen_names.add(cleaned["playName"])
        result.append(cleaned)
        if len(result) >= limit:
            break
    return result
