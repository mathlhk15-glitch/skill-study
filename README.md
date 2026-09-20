# Claude 스킬 교과서

Claude에서 쓰는 스킬(`SKILL.md`)을 **읽는 것에서 끝내지 않고 공부하기 위한** 정적 웹 사이트입니다. 들어 있는 스킬은 모두 Claude용으로 만든 것입니다.
별도의 빌드 과정과 외부 JavaScript 라이브러리 없이 GitHub Pages에서 동작합니다. 외부에서 불러오는 것은 글꼴(jsDelivr의 Pretendard) 하나뿐이며, 접속이 안 되면 기기 기본 글꼴로 대신 나옵니다.

Claude 스킬은 Anthropic이 처음 개발한 뒤 2025년 말 공개 표준(Agent Skills)으로 공개한 `SKILL.md` 기반 형식을 씁니다. `SKILL.md`에 `references/`, `scripts/`, `assets/` 같은 자료를 함께 묶는 구조이며, 다른 AI 도구도 이 형식을 지원하는 것으로 알려져 있습니다.
이 스킬들은 Claude의 스킬 실행 환경(도구, `/mnt/skills/...` 같은 경로, 스크립트)을 전제로 쓴 부분이 있어서, 스킬마다 **다른 곳으로 옮겨도 통하는 부분과 Claude 환경에 기대는 부분**을 나눠 표시하고, 카드에 `환경 의존 있음` 또는 `지침 위주` 표시를 붙입니다.

스킬마다 아래 순서로 나눠서 봅니다.

| 탭 | 내용 |
|---|---|
| 핵심 | 한 줄 정의, 언제 쓰나, 목표, 여기서 배울 점, 범용/환경 의존 구분(SKILL.md에 `compatibility`가 있으면 자동 포함), 형식 점검, 내 메모 |
| 언제 쓰나 | description에 적힌 사용자 표현 예시와 설계 해설 |
| 작동 흐름 | 단계별 아코디언(펼침·접힘) |
| 규칙 | 반드시·금지·환경 의존·참고로 나눈 규칙 카드, 강조 표현 형광펜 표시 |
| 예시 | SKILL.md 속 서식·코드 블록만 모아 보기 |
| 코드 해설 | 코드를 '쉬운 설명'과 '코드 보기'로 전환 (`study.json`에 `explain`이 있을 때) |
| 레이아웃 · 디자인 · 참고 파일 | `references/`, `assets/`가 있는 스킬용 (`study.json`에 정의할 때) |
| 퀴즈 | 문제 풀이와 해설. 정답률 80% 이상이면 진도에 자동 반영 |
| 원문 | frontmatter 전체(name, description, license, compatibility, metadata 등)와 SKILL.md 원문 (보기 좋게 / 원문 Markdown 전환) |

그 밖에 전체 검색(원문, 학습 정리, 퀴즈, 참고 파일 포함), 즐겨찾기(⭐), 학습 진도, 스킬별 메모, 어두운 화면을 지원합니다. 참고 파일은 파일마다 검색 결과를 3건까지만 보여 줍니다.
학습 기록과 메모는 방문자 브라우저(`localStorage`)에만 저장되므로 저장소에는 아무 것도 쌓이지 않습니다.

> 각 스킬 화면의 **학습 정리는 이해를 돕기 위한 재구성**입니다. 실행 규칙의 기준은 항상 원문(`SKILL.md`)입니다.

## 폴더 구조

```
skill-study/
├─ index.html            화면 (이 파일 하나가 사이트 전체)
├─ assets/
│  ├─ style.css
│  └─ app.js
├─ skills/
│  ├─ index.json         스킬 목록, 카테고리 순서, 사이트 제목
│  └─ <스킬-id>/
│     ├─ SKILL.md        스킬 원문 (필수)
│     ├─ study.json      학습용 정리 (선택)
│     └─ references/, assets/ ...   스킬에 딸린 파일 (선택)
├─ tools/add_skill.py    새 스킬 등록 도구
├─ .gitignore
└─ .nojekyll            숨김 파일이지만 GitHub Pages에서는 필수입니다
```

`original/` 폴더는 `add_skill.py`가 받은 압축 파일을 내 컴퓨터에 보관할 때 만드는 폴더입니다(`original/<스킬-id>/`). 같은 내용은 다시 저장하지 않고, 내용이 다른 새 버전은 `20260921-101500-이름.skill`처럼 날짜·시간을 붙여 **이전 버전을 덮어쓰지 않습니다.** `.gitignore`에 들어 있어서 Git으로 올리면 제외됩니다. 웹 화면에서 직접 업로드할 때는 이 폴더를 끌어다 놓지 마세요.

확인한 `.skill` 파일은 ZIP 호환 패키지였습니다. 압축을 풀면 내부의 `SKILL.md`와 리소스를 볼 수 있고, 사이트는 압축을 푼 `skills/` 폴더를 읽습니다.

## 내 컴퓨터에서 보기

`index.html`을 더블클릭해서 열면 브라우저가 파일 읽기를 막아 빈 화면이 나옵니다. 아래처럼 실행하세요.

```bash
cd skill-study
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## GitHub Pages로 공개하기

1. GitHub에서 새 저장소를 만듭니다. 무료 계정에서 Pages를 쓰려면 공개(Public)여야 합니다.
2. 이 폴더의 **내용**(`index.html`, `assets`, `skills`, `tools` 등)을 저장소 최상위에 올립니다.
3. **`.nojekyll` 파일이 저장소에 올라갔는지 반드시 확인합니다.** (아래 설명 참고)
4. 저장소 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, Branch를 `main`, 폴더를 `/ (root)`로 지정하고 Save를 누릅니다.
5. 1~2분 뒤 `https://<사용자명>.github.io/<저장소명>/` 으로 접속됩니다.

사이트의 모든 경로는 상대 경로라서 저장소 이름이 무엇이어도 동작합니다.

### `.nojekyll`은 필수입니다

GitHub Pages는 기본적으로 Jekyll이라는 도구로 사이트를 만듭니다. Jekyll은 **맨 윗줄이 `---`로 시작하는 파일**(모든 `SKILL.md`가 해당)을 Markdown 문서로 보고 `SKILL.html`로 바꿔 버립니다. 그러면 `SKILL.md` 주소는 404가 되어 화면에 스킬이 하나도 나오지 않습니다. 저장소 맨 위에 `.nojekyll`이라는 **빈 파일**이 있으면 Jekyll을 건너뛰고 파일을 그대로 공개합니다.

`.nojekyll`은 이름이 점으로 시작하는 숨김 파일이라 **폴더를 끌어다 올릴 때 빠지기 쉽습니다.** 저장소 첫 화면의 파일 목록에 `.nojekyll`이 보이지 않으면 직접 만드세요.

1. 저장소 화면에서 **Add file → Create new file**을 누릅니다.
2. 파일 이름 칸에 `.nojekyll`을 입력합니다 (앞의 점 포함, 내용은 비워 둡니다).
3. **Commit changes**를 누릅니다.

다른 방법: **Settings → Pages → Source**를 `GitHub Actions`로 바꾸고 제안되는 `Static HTML` 워크플로를 만들면 Jekyll 없이 배포되므로 `.nojekyll`이 필요 없습니다.

### 첫 화면에 빨간 안내가 뜰 때

`skills/index.json에 등록된 스킬 5개 중 0개만 불러왔습니다`와 함께 각 `SKILL.md`가 `HTTP 404`로 나오면 거의 항상 위의 `.nojekyll` 문제입니다. 사이트가 스스로 `SKILL.html`이 있는지 확인해서, 그렇다면 원인과 해결 순서를 화면에 보여 줍니다. 직접 확인하려면 브라우저에서 `https://<사용자명>.github.io/<저장소명>/skills/gianmun-writer/SKILL.html`을 열어 보세요. 열리면 Jekyll이 변환한 것입니다.

`SKILL.html`도 없다면 `skills/<스킬 이름>/SKILL.md`가 저장소에 실제로 올라갔는지(폴더째 올릴 때 하위 폴더가 빠지는 경우가 있습니다), 파일 이름의 대소문자가 맞는지 확인하세요.

## 새 스킬 추가하기

### 방법 1. 도구로 추가 (권장)

```bash
python tools/add_skill.py 새스킬.skill --category "업무 자동화"
python tools/add_skill.py 스킬모음.zip                  # zip 안의 .skill/.zip도 알아서 풀어 줍니다
python tools/add_skill.py 새버전.skill --update         # 이미 등록된 스킬을 새 버전으로 교체
```

- 압축을 풀어 `skills/<id>/`에 배치하고, 원본을 `original/<id>/`에 보관하고, `skills/index.json`에 등록하고, `study.json` 기본 틀을 만듭니다.
- 이미 `skills/<id>/`가 있으면 건너뜁니다. `--update`를 붙이면 **`study.json`만 남기고 기존 폴더를 비운 뒤** 새 버전을 풉니다. 새 버전에서 사라진 옛 파일이 남지 않고, 새 압축 안에 `study.json`이 들어 있어도 내 학습 정리를 덮어쓰지 않습니다. 되돌리려면 Git 기록(`skills/` 폴더)이나 `original/<id>/`의 이전 압축 파일을 이용하세요.
- 규격 점검 경고를 출력합니다. `name`은 소문자·숫자·하이픈만 쓰고, 하이픈으로 시작하거나 끝나거나 연속될 수 없으며, 64자 이하이고 폴더 이름과 같아야 합니다. `description`은 1~1024자, `compatibility`는 500자 이하입니다.
- frontmatter의 여러 줄 값(`>`, `>-`, `>+`, `|`, `|-`, `|+`, 들여쓰기 숫자 포함)을 읽습니다. `metadata:`는 **아래 1단계의 단순 `key: value`만** 읽고, 더 깊은 중첩이나 목록은 읽지 않습니다.
- 압축 안의 `.zip`은 `SKILL.md`가 들어 있을 때만 다른 스킬로 취급하고, 아니면 일반 파일로 풉니다. 같은 스킬이 한 압축 안에 두 번 들어 있어도 한 번만 설치합니다.
- 폴더 이름이 규격(소문자·숫자·하이픈)에 맞지 않아도 설치는 하되 경고를 출력합니다. 규격에 맞지 않는 스킬도 공부 대상이 될 수 있고, 화면의 '형식 점검'에서 잡아내기 위해서입니다.

### 푸시 전 점검

```bash
python tools/add_skill.py --check
```

설치는 하지 않고 다음을 확인합니다. 오류가 있으면 종료 코드가 1입니다.

- **`.nojekyll`이 있는지** (없으면 오류, GitHub Actions로 배포하면 무시)
- `index.json`에 적힌 스킬의 `SKILL.md`가 있는지
- `skills/` 안에 폴더는 있는데 `index.json`에 등록하지 않아 **화면에 나오지 않는** 스킬이 있는지
- `study.json`의 문법, 퀴즈 `answer` 범위, `rules.level`, `env.items.kind`, `files[].path` 존재, `explain.match`
- `name`·`description`이 Agent Skills 규격에 맞는지(의도적으로 유지하는 항목은 `knownIssues`로 표시한 것만 "알려진 사항"으로 따로 집계)

손으로 파일을 고치거나 추가했다면 올리기 전에 한 번 실행하세요.

### 방법 2. 손으로 추가

1. `skills/<id>/SKILL.md`를 넣습니다.
2. `skills/index.json`의 `skills` 배열에 `<id>`를 추가합니다.

이것만으로도 **핵심, 언제 쓰나, 작동 흐름, 규칙, 예시, 원문** 탭이 자동으로 만들어집니다.

| 탭 | 자동으로 만드는 방법 |
|---|---|
| 언제 쓰나 | description의 큰따옴표 표현을 사용자 표현 예시로 추출 |
| 작동 흐름 | `Step` 또는 `단계`가 들어간 제목을 단계로 사용 |
| 규칙 | 반드시, 필수, 절대, 금지, 주의, 원칙이 들어간 줄을 추출 |
| 예시 | 코드 블록을 제목별로 수집 |
| 형식 점검 | name·description(있으면 compatibility)을 Agent Skills 규격 기준으로 점검 |
| 환경 의존 | SKILL.md에 `compatibility` 필드가 있으면 자동으로 "환경 의존"에 표시 |

`study.json`을 채우면 사람이 다듬은 내용으로 바뀝니다.

### 불러오기에 문제가 있을 때

- `study.json`이 **없는** 것은 정상입니다(선택 파일).
- `study.json`에 **문법 오류**가 있거나, `SKILL.md`를 불러오지 못하면 홈 화면과 해당 스킬 화면 위에 빨간 안내가 나옵니다. 문제가 있는 파일 경로가 함께 표시됩니다.
- `study.json`의 **내용이 어긋난 경우**(퀴즈 `answer`가 보기 범위 밖, `rules.level`이나 `env.items.kind`가 허용값이 아님, `explain.match`가 코드 블록에 없음, `files[].path` 파일이 없음 등)에도 같은 안내가 나옵니다. `files[].path`는 화면이 뜬 뒤 백그라운드에서 확인하며, 404는 "파일을 찾지 못했습니다", 그 밖의 서버 오류는 "불러오지 못했습니다(HTTP 코드)", 네트워크 오류는 "확인하지 못했습니다"로 구분해 알립니다.
- `skills/` 폴더에는 있지만 `index.json`에 **등록하지 않은** 스킬은 브라우저가 폴더 목록을 볼 수 없어 화면에 알릴 수 없습니다. `--check`로 찾으세요.

## study.json 형식

모든 항목이 선택입니다. 비워 두면 위의 자동 추출이 대신합니다.

```jsonc
{
  "meta":   { "title": "화면에 보일 이름", "category": "업무 자동화", "level": 2, "minutes": 10, "summary": "카드에 보일 한 줄", "platform": "Claude" },
  "core":   { "oneLiner": "한 줄 정의", "whenToUse": ["..."], "goal": "...", "caution": "내 환경에 맞추려면..." },
  "lesson": { "title": "배울 점 제목", "text": "이 스킬에서 배울 설계 원리" },
  "triggers": { "phrases": ["직접 지정할 표현"], "note": "description 읽기", "review": "학습 메모" },
  "workflow": [ { "title": "단계 이름", "detail": "설명 또는 설명 배열", "branches": [ { "label": "갈래", "text": "설명" } ] } ],
  "rules":  [ { "level": "must | never | env | note", "text": "규칙", "why": "이유" } ],
  "env":    { "items": [ { "name": "항목", "kind": "portable | env", "note": "설명" } ] },
  "explain":[ { "match": "SKILL.md 코드 블록 안의 문자열", "title": "제목", "points": ["..."], "why": "쉬운 설명" } ],
  "layouts":[ { "type": "cover", "name": "표지", "use": "...", "fields": "...", "note": "..." } ],
  "design": { "intro": "...", "colors": [ { "name": "blue", "hex": "0064E0", "role": "..." } ], "sizes": [ { "el": "제목", "size": "25pt" } ], "rules": ["..."] },
  "files":  [ { "path": "references/a.md", "title": "a.md", "desc": "설명", "notes": ["읽는 법"] } ],
  "quiz":   [ { "q": "문제", "choices": ["가", "나", "다"], "answer": 1, "why": "해설" } ],
  "knownIssues": [ { "id": "name-format", "reason": "원본을 그대로 보존하려고 고치지 않음" } ]
}
```

- `level`은 1(기본), 2(보통), 3(심화)입니다.
- `meta.platform`은 카드와 스킬 화면에 `Claude 스킬`처럼 표시되는 이름입니다. 생략하면 `skills/index.json`의 `site.platform`(현재 `Claude`)을 씁니다. Claude가 아닌 도구용 스킬을 추가하면 그 스킬의 `platform`만 바꾸거나 빈 문자열(`""`)로 두어 표시를 끄세요.
- `rules.level`의 `env`는 특정 실행 환경의 경로나 도구에 기대는 규칙(노란색), `env.items.kind`의 `portable`은 어디서나 통하는 설계, `env`는 환경 의존입니다.
- `explain.match`는 SKILL.md의 코드 블록 중 그 문자열을 포함한 첫 블록을 찾아 붙여 줍니다. 코드를 두 번 적을 필요가 없습니다.
- `knownIssues`는 형식 점검에서 걸렸지만 **의도적으로 유지하는 항목**입니다. `id`는 `name-format`, `name-dir`, `desc-length`, `compat-length` 중 하나이고 `reason`(이유)이 반드시 필요합니다. 화면에는 "알려진 사항"과 이유가 그대로 표시되고, `--check`에서는 "주의"가 아닌 "알려진 사항"으로 따로 집계됩니다. 숨기는 것이 아니라 "알고 있고 이유가 있다"고 표시하는 장치입니다.
- 퀴즈는 보기를 화면에서 섞지 않으므로, 문제를 만들 때 `answer` 위치를 고르게 분산해 두세요.
- `layouts`는 `cover, bullets, compare, process, table, image, quote, closing` 8가지 모양의 그림을 지원합니다. 다른 이름은 점선 상자로 표시됩니다.
- `files`에 적은 `.md`는 보기 좋게 렌더링되고, 그 밖의 파일은 코드로 표시됩니다.

## 공개하기 전에 확인하세요

- 스킬 원문에 **학교명, 이름, 연락처, 내부 규정, 실제 공문 내용**이 들어 있지 않은지 확인하세요. 현재 5개 스킬에서는 실제 개인 이름이나 전화번호 같은 직접적인 개인정보를 찾지 못했습니다. 다만 경기도교육청, 교육정보부 같은 기관·부서 이름과 '담당자 연락처', '내선' 같은 예시 항목은 들어 있습니다.
- 다른 사람이 만든 스킬이나 문서는 재배포 가능 여부를 확인하세요. `skills/` 폴더에도 같은 원문이 들어 있습니다.
- 학습 기록은 방문자 각자의 브라우저에만 저장되며, 주인에게 전송되지 않습니다.

## 알아 둘 점

- `SKILL.md` 안의 실행 경로(`/mnt/skills/...`)와 도구 이름(`message_compose_v1` 등)은 Claude의 스킬 실행 환경 기준입니다. 내 컴퓨터나 다른 도구에서 그대로 실행하려면 바꿔야 합니다.
- '형식 점검'은 공개 규격(agentskills.io)의 name·description 조건을 기준으로 합니다. Claude에서 동작하는지와는 별개로, 규격에 맞는지 보는 점검입니다.
- 화면의 학습 정리(`study.json`)는 원문을 바탕으로 사람이 다시 정리한 것입니다. 원문과 다르게 보이는 부분은 **원문 탭이 기준**입니다.
