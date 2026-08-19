# 다른 AI에게 넘길 때

원본: https://github.com/heoparang-ship-it/muhan-incheon-haemu  
이 저장소는 **public**.

플레이 파일: [`game/index.html`](game/index.html)  
에셋: [`game/assets/`](game/assets/)  
스크립트: [`scripts/`](scripts/)  
현황: [`STATUS.md`](STATUS.md)  
설계: [`docs/DESIGN.md`](docs/DESIGN.md)  
백서: [`docs/WHITEPAPER.md`](docs/WHITEPAPER.md)

---

## 한 줄

조선판 코만도스. 96×96 아이소메트릭, 단일 HTML+Canvas, 외부 라이브러리 0.  
백서 1차·2차는 이미 들어 있다. 건물 마젠타 헤일로도 제거됨.

---

## 절대 바꾸지 말 것

- **1장 감나루** 맵 크기 96×96, 조수 공식, 미션 42분
- 대원 역할(해주·무진·도치·월심) — 튜토리얼은 둘만 내보내되 역할은 그대로
- 총격/킬 전투, 탈것 조작, 90° 카메라 회전, 멀티플레이, 외부 라이브러리

튜토리얼(선창 검문소)은 별장. 32×32, 12분, 조수 없음. 1장을 줄인 것이 아니다.

---

## 이미 있는 것

| 층 | 내용 |
|---|---|
| 장 | `tut01` 선창 검문소(32×32, 해주·무진) / `ch1` 감나루(96×96, 4인) |
| 엔진 | 아이소·A*·LOS·조수·경보·저장 v3 |
| 1차 | 퀵세이브, 시야 2존, 경로, 소리파동, 깨어남, 증원 |
| 2차 | 집사 문답, 등불 복구, 부대선택, 난이도, 신스 사운드, 결과통계 |
| 그래픽 | 프리렌더 건물/유닛/프롭/지형. 건물 분홍 원반 제거됨 |
| 모바일 | 터치 세로면 `#app`을 가로로 강제 회전. 돌리라는 오버레이 없음 |

가드 시야·속도는 요청대로 원래 값의 50%.

---

## 아직 남은 것

1. 걷기 4×4 시트 (지금은 4방향 대기 + 걷기 바운스)
2. 담장(`kind==='wall'`)은 아직 코드 드로우
3. 백서 3차: D13 2장 프레임, D14 리플레이 고스트, D15 접근성
4. 실제 샘플 효과음 없음 (신스만)

---

## 다른 AI에게 줄 프롬프트

```
너는 무한인천: 해무의 성가 후속 개발자다.
원본은 https://github.com/heoparang-ship-it/muhan-incheon-haemu (public).

읽을 것:
- HANDOFF.md
- STATUS.md
- docs/DESIGN.md
- docs/WHITEPAPER.md  (1·2차는 이미 반영. 3차만 남음)
- game/index.html  (실제 게임. 단일 IIFE + Canvas)
- game/asset-data.js
- game/assets/
- scripts/

제약:
- 맵 96×96 / 조수 공식 / 대원 역할 유지
- 외부 라이브러리 금지
- 총격·탈것·90도 카메라·멀티 금지
- 한국어 UI

현재 엔진은 예전 모듈형 HAEMU.html(a_core…j_assets)이 아니다.
단일 파일 game/index.html 이다. 백서 1·2차는 이미 반영됨. 처음부터 다시 짜지 마라.

다음 작업은 남은 것부터. 맵·조수·역할을 리팩터하지 마라.
```
