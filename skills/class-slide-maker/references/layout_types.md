# 슬라이드 타입 & content.json 스키마

`assets/build_deck.js`는 `content.json`의 `slides` 배열을 그대로 읽어 **배열 길이만큼** 슬라이드를 만든다.
즉 개요 항목 수 = 슬라이드 장수. 순서도 입력 순서를 그대로 따른다.

```json
{
  "title": "전체 발표/수업 제목 (pptx 메타데이터용)",
  "subject": "표지 eyebrow 기본값으로 쓰일 과목/차시 (선택)",
  "slides": [ { "type": "...", ... }, ... ]
}
```

공통 필드(대부분의 타입에 존재): `chapter`(우상단 라벨, 예 "01. Overview"), `title`, `subtitle`.
`chapter`/`subtitle`은 선택值이며 없으면 자동으로 레이아웃이 조정된다.

## 1. cover — 표지
```json
{
  "type": "cover",
  "eyebrow": "로봇과 공학세계 · 3주차",
  "title": "AI는 어떻게 우리의 문제 해결을 도와줄까?",
  "subtitle": "센서 데이터를 이해하고, AI와 협업하여 로봇을 설계해봅시다.",
  "image": "cover.png",
  "showImageSlot": true,
  "imageLabel": "수업 대표 이미지"
}
```
- `image`에 파일명을 주고 imgDir에 실제 파일이 있으면 이미지가 삽입된다.
- 파일이 없어도 `showImageSlot: true`면 점선 박스 + 라벨만 표시된다(자리 표시 전용).
- 이미지 자체가 필요 없는 슬라이드는 `image`/`showImageSlot`을 모두 생략.

## 2. bullets — 핵심 내용 나열 (가장 많이 쓰는 타입)
```json
{
  "type": "bullets",
  "chapter": "01. 오늘의 목표",
  "title": "이 시간에 배울 세 가지",
  "subtitle": "학습 목표를 먼저 확인하고 시작합니다",
  "bullets": ["문장1", "문장2", "문장3"],
  "showImageSlot": true,
  "imageLabel": "관련 사진"
}
```
- `bullets`는 2~6개 권장. 개수에 따라 폰트 크기가 자동으로 줄어든다.
- 이미지 자리를 넣으면 좌측 55% 텍스트 + 우측 45% 이미지로 분할된다.

## 3. compare — 2단 비교
```json
{
  "type": "compare",
  "chapter": "02. 비교하기",
  "title": "사람의 학습 vs AI의 학습",
  "leftTitle": "사람의 학습", "leftItems": ["...", "..."],
  "rightTitle": "AI의 학습",  "rightItems": ["...", "..."]
}
```

## 4. process — 단계/절차 (3~5단계 권장)
```json
{
  "type": "process",
  "chapter": "03. 절차 이해하기",
  "title": "라인트레이서가 선을 따라가는 4단계",
  "steps": [
    { "title": "센서 감지", "desc": "적외선 센서로 바닥 색을 인식" },
    { "title": "데이터 판단", "desc": "검은 선 위인지 아닌지 비교" }
  ]
}
```
- `steps`는 문자열 배열(`["1단계","2단계"]`)로도 가능(그 경우 desc 없이 title만 표시).
- 6개 이상이면 원 크기가 좁아져 가독성이 떨어지므로 5개 이하 권장.

## 5. table — 표 정리
```json
{
  "type": "table",
  "chapter": "04. 정리하기",
  "title": "센서별 특징 한눈에 보기",
  "headers": ["센서", "측정하는 값", "활용 예"],
  "rows": [["적외선 센서", "빛의 반사량", "라인트레이서"]]
}
```
- 행이 6개를 넘으면 글자가 작아져 가독성이 떨어지므로, 많으면 슬라이드를 나눈다.

## 6. image — 사진/자료 중심
```json
{
  "type": "image",
  "chapter": "05. 실습 미리보기",
  "title": "오늘의 실습 장비",
  "image": null,
  "imageLabel": "실습 장비 사진",
  "caption": "출처: 교실 촬영 사진"
}
```
- 큰 중앙 이미지 자리(또는 실제 이미지) + 하단 캡션.

## 7. quote — 한 문장 강조/발문
```json
{
  "type": "quote",
  "chapter": "06. 생각해보기",
  "quote": "실패한 데이터도 AI에게는 훌륭한 학습 재료가 된다",
  "attribution": "오늘의 핵심 문장"
}
```
- 토론 발문, 핵심 개념 한 줄 요약, 명언 등에 사용.

## 8. closing — 마무리
```json
{
  "type": "closing",
  "chapter": "마무리",
  "title": "오늘 배운 내용을 정리해봅시다",
  "message": "센서는 로봇의 눈과 감각이고, AI는 그 데이터를 해석하는 두뇌입니다.",
  "question": "Q. 우리 주변에서 센서가 사용되는 곳은 또 어디가 있을까요?"
}
```
- `question`은 파란 배너로 강조되어 마지막 발문/과제 안내에 적합.

## 이미지 처리 원칙
- 이 스킬은 **실존 사진을 생성하지 않는다.** 사용자가 나중에 넣을 수 있도록 점선 박스 + 라벨만 표시.
- 사용자가 실제 이미지 파일을 첨부하면 `imgDir`에 넣고 `image` 필드에 파일명을 지정 → 자동 삽입.
