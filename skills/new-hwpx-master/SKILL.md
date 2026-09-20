---
name: new_hwpx_master
description: hwpx 공문/기안문 양식을 첨부하면 주제에 맞춰 공문 내용을 자동 작성
---

# HWPX 공문/기안문 자동 채우기 스킬

## 1단계: HWPX 파일 해제

```bash
mkdir -p hwpx_work && cd hwpx_work
cp 원본.hwpx 원본.zip
unzip -o 원본.zip -d original
```

해제 후 핵심 파일:
- Contents/section0.xml: 본문 (수정 대상)
- Contents/header.xml: 서식 정의
- mimetype, META-INF/, BinData/, Preview/: 수정하지 않음

---

## 2단계: section XML 구조 분석 (★ 반드시 실행)

단순히 텍스트를 순회하는 것이 아니라, **문단의 부모 구조(parent tag)** 를 함께 파악해야 한다.
한글 보고서 양식에서 본문 단락(□,○,―,※)은 흔히 **모든 섹션이 동일한 `<sec>` 요소의 직계 자식**으로 연결된다.
이 구조를 무시하면 섹션 경계 탐색이 실패하여 전체 본문이 삭제되는 치명적 오류가 발생한다.

```python
from lxml import etree

with open('original/Contents/section0.xml', 'rb') as f:
    tree = etree.parse(f)
root = tree.getroot()

# ★ sec 요소 찾기
sec_elem = None
for elem in root.iter():
    if etree.QName(elem.tag).localname == 'sec':
        sec_elem = elem
        break

# ★ sec 직계 자식 인덱스 맵핑 (구조 파악 필수)
sec_children = list(sec_elem)
print(f"sec 직계 자식 수: {len(sec_children)}")
for i, child in enumerate(sec_children):
    local = etree.QName(child.tag).localname
    if local == 'p':
        texts = [t.text for t in child.iter()
                 if etree.QName(t.tag).localname == 't' and t.text and t.text.strip()]
        if texts:
            print(f"sec_child[{i}] p: {'|'.join(texts)[:70]}")
    else:
        print(f"sec_child[{i}] {local}")
```

이 출력으로 **각 섹션 본문의 정확한 start/end 인덱스**를 확인한 뒤 다음 단계로 진행한다.

---

## 3단계: XML 수정

### ★★★ 가장 중요한 규칙: linesegarray 삭제 ★★★

텍스트를 수정한 `<hp:p>` 에서 반드시 `<linesegarray>` 자식 요소를 삭제해야 한다.

linesegarray는 원본 편집기가 저장한 "줄 배치 캐시"이다.
텍스트를 변경하면 이 캐시가 무효화되어 글자가 겹쳐 보이는 현상이 발생한다.
삭제하면 한컴오피스가 파일을 열 때 자동으로 줄 배치를 재계산한다.

```python
def remove_linesegarray(p_element):
    """수정된 문단에서 linesegarray를 삭제한다. 필수!"""
    for child in list(p_element):
        if etree.QName(child.tag).localname == 'linesegarray':
            p_element.remove(child)
```

### 절대 금지 사항

- 절대로 XML을 문자열(f-string, concat, replace)로 조합하지 않는다.
- 절대로 XML 선언(<?xml ...?>)을 수동으로 추가하지 않는다.
- 절대로 section0.xml 전체를 새로 작성하지 않는다.
- 절대로 .replace()나 re.sub()로 XML을 조작하지 않는다.
- **절대로 텍스트 내용으로 섹션 경계를 탐색하지 않는다 → 2단계의 인덱스 맵핑을 사용한다.**

---

## 4단계: 섹션 본문 교체 (★★★ sec 공유 구조 대응)

### 핵심 헬퍼 함수

```python
import copy

def clone_para(ref_p, run_texts):
    """
    ref_p를 깊은 복사하여 각 run의 텍스트를 교체.
    run_texts: ['run0에 넣을 텍스트', 'run1에 넣을 텍스트', ...]
    여분의 run은 제거. linesegarray 삭제 필수.
    """
    new_p = copy.deepcopy(ref_p)
    remove_linesegarray(new_p)
    runs = [c for c in new_p if etree.QName(c.tag).localname == 'run']
    for i, txt in enumerate(run_texts):
        if i < len(runs):
            for t in runs[i]:
                if etree.QName(t.tag).localname == 't':
                    t.text = txt
                    break
    for r in runs[len(run_texts):]:
        new_p.remove(r)
    return new_p


def replace_section_body(sec_elem, body_start_idx, body_end_idx,
                          ref_box, ref_circle, ref_dash, ref_note,
                          content_list):
    """
    sec_elem      : 모든 본문 단락의 공통 부모 sec 요소
    body_start_idx: 교체 시작 자식 인덱스 (첫 □ 위치)
    body_end_idx  : 교체 끝 자식 인덱스 + 1 (exclusive)
    ref_box       : □ 두 run 구조 참조 단락 (deepcopy 원본)
    ref_circle    : ○ 단락 참조
    ref_dash      : ― 단락 참조
    ref_note      : ※ 단락 참조
    content_list  : [("box"|"circle"|"dash"|"note", "텍스트"), ...]
    """
    to_remove = list(sec_elem)[body_start_idx:body_end_idx]
    for child in to_remove:
        sec_elem.remove(child)

    sym_map = {
        "box":    (" □  ", True),
        "circle": ("  ○ ", False),
        "dash":   ("   ― ", False),
        "note":   ("     ※ ", False),
    }
    ref_map = {
        "box": ref_box, "circle": ref_circle,
        "dash": ref_dash, "note": ref_note,
    }

    insert_pos = body_start_idx
    for typ, text in content_list:
        sym, two_run = sym_map[typ]
        ref_p = ref_map[typ]
        if two_run:
            new_p = clone_para(ref_p, [sym, text])
        else:
            new_p = clone_para(ref_p, [sym + text])
        sec_elem.insert(insert_pos, new_p)
        insert_pos += 1
```

### ★★★ 반드시 역순(Ⅳ→Ⅲ→Ⅱ→Ⅰ)으로 처리

여러 섹션을 순서대로(Ⅰ→Ⅱ→...) 처리하면 삽입/삭제로 인해 이후 섹션 인덱스가 틀어진다.
**반드시 마지막 섹션부터 역순으로 호출한다.**

```python
# 2단계 출력으로 확인한 실제 인덱스를 아래에 입력
# 참조 단락은 수정 전에 반드시 deepcopy로 저장
sec_children = list(sec_elem)
ref_box    = copy.deepcopy(sec_children[23])  # □ 두 run 구조 (실제 인덱스로 교체)
ref_circle = copy.deepcopy(sec_children[24])  # ○
ref_dash   = copy.deepcopy(sec_children[25])  # ―
ref_note   = copy.deepcopy(sec_children[31])  # ※ (있는 섹션에서 가져옴)

# ★ 역순 처리 (Ⅳ → Ⅲ → Ⅱ → Ⅰ)
replace_section_body(sec_elem, sec4_start, sec4_end, ref_box, ref_circle, ref_dash, ref_note, sec4_content)
replace_section_body(sec_elem, sec3_start, sec3_end, ref_box, ref_circle, ref_dash, ref_note, sec3_content)
replace_section_body(sec_elem, sec2_start, sec2_end, ref_box, ref_circle, ref_dash, ref_note, sec2_content)
replace_section_body(sec_elem, sec1_start, sec1_end, ref_box, ref_circle, ref_dash, ref_note, sec1_content)
```

> **순서 처리가 불가피한 경우**: 각 호출 후 `delta = len(content) - (end - start)`를 계산하여
> 이후 섹션 인덱스에 누적 합산한다.

---

## 5단계: 단순 텍스트 교체 (제목·날짜·기관명 등)

```python
def set_run_text(p_elem, run_idx, new_text, remove_extra_runs=False):
    """p_elem의 run_idx번째 run에 텍스트 설정. linesegarray 삭제."""
    runs = [c for c in p_elem if etree.QName(c.tag).localname == 'run']
    if run_idx < len(runs):
        for t in runs[run_idx]:
            if etree.QName(t.tag).localname == 't':
                t.text = new_text
                break
    if remove_extra_runs:
        for r in runs[run_idx+1:]:
            p_elem.remove(r)
    remove_linesegarray(p_elem)

# 사용 예 (인덱스는 2단계 출력으로 확인)
set_run_text(sec_children[5],  0, "보고서 제목", remove_extra_runs=True)
set_run_text(sec_children[11], 0, "2026. 7. 1.")
set_run_text(sec_children[16], 0, "기관명")
```

subList/tc 내부 단락(섹션 번호 사이드바 등)도 동일하게 처리한다.

---

## 6단계: XML 저장

```python
enc = tree.docinfo.encoding or 'UTF-8'
sa  = tree.docinfo.standalone
tree.write('original/Contents/section0.xml',
           xml_declaration=True,
           encoding=enc,
           standalone=sa)
```

---

## 7단계: HWPX 재패키징

```python
import zipfile, os

output_path = '결과물.hwpx'
with zipfile.ZipFile(output_path, 'w') as zf:
    mimetype_path = os.path.join('original', 'mimetype')
    if os.path.exists(mimetype_path):
        zf.write(mimetype_path, 'mimetype', compress_type=zipfile.ZIP_STORED)
    for dirpath, dirnames, filenames in os.walk('original'):
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            arcname  = os.path.relpath(filepath, 'original')
            if arcname == 'mimetype':
                continue
            zf.write(filepath, arcname, compress_type=zipfile.ZIP_DEFLATED)
```

---

## 8단계: 검증

```python
with zipfile.ZipFile(output_path, 'r') as zf:
    assert zf.testzip() is None, "ZIP 손상"
    with zf.open('Contents/section0.xml') as f:
        tree = etree.parse(f)
print("검증 완료")
```

---

## 9단계: 공문 작성 원칙

- 경어체 (합니다/습니다체)
- 두괄식 서술 (결론 → 배경 → 세부내용)
- 본문 순서: 목적/배경 → 세부 내용 → 요청/협조 사항 → 붙임
- 관용 표현: "~와 관련하여", "아래와 같이", "~하여 주시기 바랍니다"

---

## ★ 작업 체크리스트

| 순서 | 확인 항목 |
|------|-----------|
| ① | 2단계 구조 분석 실행 → `sec` 직계 자식 인덱스 맵 출력 확인 |
| ② | 참조 단락(`ref_box`, `ref_circle`, `ref_dash`, `ref_note`)을 수정 전에 `deepcopy`로 저장 |
| ③ | 섹션 본문 교체는 **역순(마지막 섹션부터)** 으로 처리 |
| ④ | 텍스트를 수정한 모든 `<hp:p>`에서 `linesegarray` 삭제 확인 |
| ⑤ | `mimetype` 비압축 첫 번째 삽입 확인 |
| ⑥ | 최종 ZIP 검증 통과 확인 |
