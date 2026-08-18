# 다른 AI에게 넘길 때

원본: https://github.com/heoparang-ship-it/muhan-incheon-haemu  
이 저장소는 **public**.

플레이 파일: [`game/index.html`](game/index.html)  
에셋: [`game/assets/`](game/assets/)  
스크립트: [`scripts/`](scripts/)  
현황: [`STATUS.md`](STATUS.md)  
1장 출시 기준: [`docs/SHIP-CH1.md`](docs/SHIP-CH1.md)  
설계: [`docs/DESIGN.md`](docs/DESIGN.md)  
백서: [`docs/WHITEPAPER.md`](docs/WHITEPAPER.md) — 2026-08-18 기록. 1·2차는 반영됨.

---

## 한 줄

조선판 코만도스. 96×96 아이소메트릭, 단일 HTML+Canvas, 외부 라이브러리 0.  
백서 1차·2차는 이미 들어 있다. 건물 마젠타 헤일로도 제거됨.

---

## 절대 바꾸지 말 것

- 맵 크기 96×96, 조수 공식, 미션 42분
- 대원 역할(해주·무진·도치·월심)
- 총격/킬 전투, 탈것 조작, 90° 카메라 회전, 멀티플레이, 외부 라이브러리

---

## 이미 있는 것

| 층 | 내용 |
|---|---|
| 엔진 | 아이소·A*·LOS·조수·경보·저장 v3 |
| 1차 | 퀵세이브, 시야 2존, 경로, 소리파동, 깨어남, 증원 |
| 2차 | 집사 문답, 등불 복구, 부대선택, 난이도, 신스 사운드, 결과통계 |
| 그래픽 | 프리렌더 건물/유닛/프롭/지형. 건물 분홍 원반 제거됨 |
| 모바일 | 터치 세로면 `#app`을 가로로 강제 회전. 돌리라는 오버레이 없음 |

가드 시야·속도는 요청대로 원래 값의 50%.

---

## 아직 남은 것

출시 순서는 [`docs/SHIP-CH1.md`](docs/SHIP-CH1.md). 백서 3차(D13–D15)는 1장 출시 밖.

1. **1파** 대원·경비·주민 걷기 4×4 시트 — 들어 있음 (`*_walk.png`)
2. **2파** 크리티컬 패스 한 판 검증 + 모바일 첫 줄 힌트
3. **3파** 샘플 효과음 — 출시를 막지 않음. 담장은 `bld_wall` 타일 연결됨

---

## 다른 AI에게 줄 프롬프트

```
너는 무한인천: 해무의 성가 후속 개발자다.
원본은 https://github.com/heoparang-ship-it/muhan-incheon-haemu (public).

읽을 것:
- docs/SHIP-CH1.md   (1장 출시 기준. 파도 순서)
- HANDOFF.md
- STATUS.md
- docs/DESIGN.md
- docs/WHITEPAPER.md  (2026-08-18 기록. 1·2차는 이미 반영. 3차는 1장 출시 밖)
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

다음 작업은 SHIP-CH1 파도 하나만. 맵·조수·역할을 리팩터하지 마라.
D13·D14·D15를 1장 출시 티켓으로 열지 마라.
```
