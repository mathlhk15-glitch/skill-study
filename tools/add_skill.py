#!/usr/bin/env python3
"""
새 스킬을 학습 사이트에 등록하는 도구 (표준 라이브러리만 사용)

사용법
  python tools/add_skill.py 새스킬.skill
  python tools/add_skill.py 스킬모음.zip --category "업무 자동화"
  python tools/add_skill.py 새버전.skill --update        # 이미 등록된 스킬을 새 버전으로 교체
  python tools/add_skill.py --check                      # 푸시 전 점검 (설치하지 않음)

하는 일
  1. .skill / .zip 압축을 풀어 skills/<id>/ 에 배치 (zip 안의 .skill/.zip도 재귀 처리)
  2. 받은 압축 파일을 original/<id>/ 에 보관 (같은 내용은 중복 저장 안 함, 다른 버전은 날짜·시간을 붙여 보존.
     original/ 은 .gitignore 로 GitHub에 올라가지 않음)
  3. skills/<id>/study.json 이 없으면 기본 틀을 만듦 (있으면 그대로 유지)
  4. skills/index.json 에 스킬 id와 카테고리를 추가
  5. name·description 이 공개 Agent Skills 규격(agentskills.io)에 맞는지 점검해 경고 출력

이미 skills/<id>/ 가 있으면 기본적으로 건너뜁니다.
--update 를 주면 study.json 만 남기고 기존 폴더 내용을 지운 뒤 새 버전을 풉니다.
새 버전에서 사라진 옛 파일이 남지 않으며, 새 압축 안에 study.json 이 있어도
기존 study.json 을 덮어쓰지 않습니다.
되돌리려면 Git 기록(skills/ 폴더)이나 original/<id>/ 의 이전 압축 파일을 이용하세요.
"""
import argparse
import datetime
import hashlib
import io
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"
ORIGINAL = ROOT / "original"
INDEX = SKILLS / "index.json"
TEXT_EXT = {".md", ".json", ".js", ".py", ".txt", ".yaml", ".yml"}


BLOCK_RE = re.compile(r"^[>|](?:[+-][1-9]?|[1-9][+-]?)?$")   # >, >-, >+, >2, >2-, >+2 ... (YAML 블록 스칼라 머리글)


def _unquote(v):
    return v[1:-1] if len(v) > 1 and v[0] == v[-1] and v[0] in "\"'" else v


def parse_frontmatter(text):
    text = text.replace("\r\n", "\n").lstrip("\ufeff")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.S)
    fm = {}
    if not m:
        return fm
    key, sub_indent = None, None
    for line in m.group(1).split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        kv = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if kv:
            key, val = kv.group(1), kv.group(2).strip()
            sub_indent = None
            if key == "metadata" and (val == "" or BLOCK_RE.match(val)):
                fm[key] = {}                                   # 1단계 key-value 매핑
            else:
                fm[key] = "" if (val == "" or BLOCK_RE.match(val)) else _unquote(val)
        elif key:
            if isinstance(fm[key], dict):
                sub = re.match(r"^(\s+)([\w.-]+):\s*(.*)$", line)
                if sub:
                    if sub_indent is None:
                        sub_indent = len(sub.group(1))
                    if len(sub.group(1)) == sub_indent:          # 더 깊은 들여쓰기(중첩·목록)는 읽지 않음
                        fm[key][sub.group(2)] = _unquote(sub.group(3).strip())
            elif isinstance(fm[key], str):
                fm[key] = (fm[key] + " " + line.strip()).strip()
    return fm


def first_sentence(desc):
    m = re.match(r"^.*?\.(\s|$)", desc)
    return (m.group(0) if m else desc[:90]).strip()


def load_index():
    if INDEX.exists():
        return json.loads(INDEX.read_text(encoding="utf-8"))
    return {"site": {"title": "Claude 스킬 교과서", "tagline": "Claude Skills / SKILL.md 학습", "platform": "Claude", "subtitle": ""},
            "categories": [], "skills": []}


def save_index(idx):
    INDEX.write_text(json.dumps(idx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def safe_join(base, rel):
    dest = (base / rel).resolve()
    if base.resolve() not in dest.parents and dest != base.resolve():
        raise ValueError(f"허용되지 않는 경로: {rel}")
    return dest


def is_skill_archive(data):
    """중첩 압축이 스킬(SKILL.md 포함)인지 확인한다. 아니면 일반 파일로 취급."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return any(PurePosixPath(n).name == "SKILL.md" for n in z.namelist())
    except zipfile.BadZipFile:
        return False


LINT_IDS = ("name-format", "name-dir", "desc-length", "compat-length")


def spec_warnings(sid, text):
    """규격 점검 결과를 (id, 메시지) 목록으로 돌려준다. id 는 study.json 의 knownIssues 와 짝을 이룬다."""
    fm = parse_frontmatter(text)
    name, desc = fm.get("name", ""), fm.get("description", "")
    out = []
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name) or len(name) > 64:
        out.append(("name-format", f"name '{name}' 은 소문자·숫자·하이픈만 쓰는 규격에 맞지 않습니다 (폴더 이름과 name을 소문자-하이픈으로 통일하세요)"))
    if name != sid:
        out.append(("name-dir", f"name '{name}' 이 폴더 이름 '{sid}' 과 다릅니다"))
    if not (1 <= len(desc) <= 1024):
        out.append(("desc-length", f"description 길이가 {len(desc)}자입니다 (규격: 1~1024자)"))
    comp = fm.get("compatibility", "")
    if isinstance(comp, str) and len(comp) > 500:
        out.append(("compat-length", f"compatibility 길이가 {len(comp)}자입니다 (규격: 500자 이하)"))
    return out


def known_map(sid):
    """study.json 의 knownIssues (의도적으로 유지하는 규격 위반) 를 {id: 이유} 로 읽는다."""
    try:
        data = json.loads((SKILLS / sid / "study.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k.get("id"): k.get("reason", "") for k in data.get("knownIssues", []) if isinstance(k, dict)}


def install_from_zip(zf, archive_name, raw_bytes, args, report):
    """zf 안에 SKILL.md가 있으면 설치하고 id 목록을 돌려준다."""
    installed = []
    names = [n for n in zf.namelist() if not n.endswith("/")]

    nested_skills = set()
    for n in names:
        if n.lower().endswith((".skill", ".zip")):
            data = zf.read(n)
            if is_skill_archive(data):
                nested_skills.add(n)
                installed += install_from_zip(zipfile.ZipFile(io.BytesIO(data)), PurePosixPath(n).name, data, args, report)

    for md in [n for n in names if PurePosixPath(n).name == "SKILL.md"]:
        parts = PurePosixPath(md).parts
        prefix = "/".join(parts[:-1])
        sid = parts[-2] if len(parts) > 1 else re.sub(r"\.(skill|zip)$", "", archive_name, flags=re.I)
        sid = re.sub(r"[^A-Za-z0-9._-]", "-", sid).strip("-") or "skill"
        dest = SKILLS / sid

        if sid in args._done:
            report.append(f"[건너뜀] {sid}: 이번 실행에서 이미 설치했습니다 (같은 스킬이 압축 안에 두 번 들어 있음)")
            continue
        if dest.exists() and not args.update:
            report.append(f"[건너뜀] skills/{sid}/ 가 이미 있습니다. 새 버전으로 바꾸려면 --update 를 붙이세요.")
            continue
        keep_study = args.update and (dest / "study.json").exists()
        if dest.exists():
            for child in dest.iterdir():          # study.json 만 남기고 모두 삭제
                if child.name == "study.json":
                    continue
                shutil.rmtree(child) if child.is_dir() else child.unlink()

        for n in names:
            if n in nested_skills or (prefix and not n.startswith(prefix + "/")):
                continue
            rel = n[len(prefix) + 1:] if prefix else n
            if keep_study and rel == "study.json":     # 새 압축 안의 study.json 이 내 학습 정리를 덮어쓰지 않게
                continue
            out = safe_join(dest, rel)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(zf.read(n))

        keep_original(sid, archive_name, raw_bytes)

        text = (dest / "SKILL.md").read_text(encoding="utf-8", errors="replace")
        write_stub(sid, dest, args.category)
        known = known_map(sid)
        for wid, w in spec_warnings(sid, text):
            report.append(f"[알려진 사항] {sid}: {w} - 유지하는 이유: {known[wid]}" if wid in known else f"[규격 점검] {sid}: {w}")
        args._done.add(sid)
        installed.append(sid)
    return installed


def keep_original(sid, archive_name, raw):
    """받은 압축 파일을 original/<id>/ 에 보관한다. 내용이 같으면 다시 저장하지 않고,
    다르면 날짜·시간을 앞에 붙여 이전 버전을 덮어쓰지 않는다."""
    keep = ORIGINAL / sid
    keep.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(raw).hexdigest()
    for f in keep.iterdir():
        if f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest() == digest:
            return f
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = keep / f"{stamp}-{archive_name}"
    n = 1
    while dst.exists():
        dst = keep / f"{stamp}-{n}-{archive_name}"
        n += 1
    dst.write_bytes(raw)
    return dst


def write_stub(sid, dest, category):
    study = dest / "study.json"
    if study.exists():
        return
    text = (dest / "SKILL.md").read_text(encoding="utf-8", errors="replace")
    fm = parse_frontmatter(text)
    desc = fm.get("description", "")
    if not isinstance(desc, str):
        desc = ""
    files = []
    for p in sorted(dest.rglob("*")):
        if p.is_file() and p.name not in ("SKILL.md", "study.json") and p.suffix.lower() in TEXT_EXT:
            files.append({"path": p.relative_to(dest).as_posix(), "title": p.name})
    stub = {
        "meta": {
            "title": fm.get("name", sid),
            "category": category or "미분류",
            "level": 2,
            "minutes": max(5, round(len(text) / 700)),
            "summary": first_sentence(desc),
        },
        "core": {"oneLiner": first_sentence(desc), "whenToUse": [], "goal": ""},
        "lesson": {"title": "", "text": ""},
        "workflow": [],
        "rules": [],
        "env": {"items": []},
        "quiz": [],
    }
    if files:
        stub["files"] = files
    study.write_text(json.dumps(stub, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fenced_blocks(text):
    out, cur, inside = [], [], False
    for ln in text.replace("\r\n", "\n").split("\n"):
        if re.match(r"^\s*```", ln):
            if inside:
                out.append("\n".join(cur)); cur = []
            inside = not inside
        elif inside:
            cur.append(ln)
    return out


def check_site():
    """푸시 전 점검: index.json ↔ skills/ 폴더 ↔ study.json 정합성을 확인한다."""
    errors, warns, notes = [], [], []
    idx = load_index()
    ids = idx.get("skills", [])
    for sid in ids:
        if not (SKILLS / sid / "SKILL.md").exists():
            errors.append(f"index.json 의 '{sid}': skills/{sid}/SKILL.md 가 없습니다")
    if SKILLS.exists():
        for d in sorted(p for p in SKILLS.iterdir() if p.is_dir()):
            if (d / "SKILL.md").exists() and d.name not in ids:
                warns.append(f"skills/{d.name}/ 는 index.json 에 등록되지 않아 화면에 나오지 않습니다")
    levels, kinds = {"must", "never", "env", "note"}, {"portable", "env"}
    for sid in ids:
        d = SKILLS / sid
        md = d / "SKILL.md"
        if not md.exists():
            continue
        text = md.read_text(encoding="utf-8", errors="replace")
        known = known_map(sid)
        for wid, w in spec_warnings(sid, text):
            if wid in known:
                notes.append(f"{sid} (규격): {w} - 유지하는 이유: {known[wid]}")
            else:
                warns.append(f"{sid} (규격): {w}")
        sj = d / "study.json"
        if not sj.exists():
            warns.append(f"{sid}: study.json 이 없습니다 (원문 자동 추출로 표시됩니다)")
            continue
        try:
            st = json.loads(sj.read_text(encoding="utf-8"))
        except ValueError as e:
            errors.append(f"{sid}/study.json 문법 오류: {e}")
            continue
        for i, q in enumerate(st.get("quiz", [])):
            ch, ans = q.get("choices"), q.get("answer")
            if not isinstance(ch, list) or len(ch) < 2:
                errors.append(f"{sid}: quiz[{i}] choices 는 2개 이상의 배열이어야 합니다")
            elif not isinstance(ans, int) or isinstance(ans, bool) or not 0 <= ans < len(ch):
                errors.append(f"{sid}: quiz[{i}] answer({ans}) 가 choices 범위를 벗어났습니다")
        for i, r in enumerate(st.get("rules", [])):
            if r.get("level") and r["level"] not in levels:
                errors.append(f"{sid}: rules[{i}] level '{r['level']}' 은 must/never/env/note 중 하나여야 합니다")
        for i, it in enumerate((st.get("env") or {}).get("items", [])):
            if it.get("kind") not in kinds:
                errors.append(f"{sid}: env.items[{i}] kind 는 portable 또는 env 여야 합니다")
        for i, f in enumerate(st.get("files", [])):
            if not (d / f.get("path", "")).is_file():
                errors.append(f"{sid}: files[{i}] {f.get('path')} 파일이 없습니다")
        blocks = fenced_blocks(text)
        for i, e in enumerate(st.get("explain", [])):
            if not any(e.get("match", "\0") in b for b in blocks):
                errors.append(f"{sid}: explain[{i}] match 문자열이 SKILL.md 코드 블록에 없습니다")
        for i, k in enumerate(st.get("knownIssues", [])):
            if not isinstance(k, dict) or k.get("id") not in LINT_IDS:
                warns.append(f"{sid}: knownIssues[{i}] id 는 {', '.join(LINT_IDS)} 중 하나여야 합니다")
            elif not k.get("reason"):
                warns.append(f"{sid}: knownIssues[{i}] reason(이유)을 적어 주세요")
        lv = (st.get("meta") or {}).get("level")
        if lv is not None and lv not in (1, 2, 3):
            warns.append(f"{sid}: meta.level 은 1, 2, 3 중 하나여야 합니다 (지금 값은 보통으로 표시됩니다)")
    for n in notes:
        print("[알려진 사항]", n)
    for w in warns:
        print("[주의]", w)
    for e in errors:
        print("[오류]", e)
    print(f"점검 완료: 스킬 {len(ids)}개, 오류 {len(errors)}건, 주의 {len(warns)}건, 알려진 사항 {len(notes)}건")
    return 1 if errors else 0


def main():
    ap = argparse.ArgumentParser(description="스킬 압축 파일을 학습 사이트에 등록")
    ap.add_argument("archives", nargs="*", help=".skill 또는 .zip 파일")
    ap.add_argument("--check", action="store_true", help="설치 없이 index.json·skills/·study.json 정합성만 점검")
    ap.add_argument("--category", help="카테고리 이름 (예: 업무 자동화)")
    ap.add_argument("--update", action="store_true", help="이미 등록된 스킬을 새 버전으로 교체 (study.json 은 유지)")
    args = ap.parse_args()
    if args.check:
        sys.exit(check_site())
    if not args.archives:
        ap.error("설치할 .skill/.zip 파일을 적거나, 점검만 하려면 --check 를 붙이세요")
    args._done = set()

    SKILLS.mkdir(exist_ok=True)
    idx = load_index()
    report, added = [], []
    for a in args.archives:
        p = Path(a)
        if not p.exists():
            report.append(f"[건너뜀] 파일이 없습니다: {p}")
            continue
        raw = p.read_bytes()
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            report.append(f"[건너뜀] 압축 파일이 아닙니다: {p}")
            continue
        before = len(report)
        ids = install_from_zip(zf, p.name, raw, args, report)
        if not ids and not any("이미 있습니다" in r for r in report[before:]):
            report.append(f"[건너뜀] SKILL.md를 찾지 못했습니다: {p}")
        added += ids

    for sid in added:
        if sid not in idx["skills"]:
            idx["skills"].append(sid)
    if args.category and args.category not in idx["categories"] and added:
        idx["categories"].append(args.category)
    save_index(idx)

    for line in report:
        print(line)
    if added:
        print("등록 완료:", ", ".join(added))
        print("다음 단계: skills/<id>/study.json 을 채우면 핵심·흐름·규칙·퀴즈 탭이 풍부해집니다.")
    else:
        print("새로 등록된 스킬이 없습니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
