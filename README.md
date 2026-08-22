# 무한인천: 해무의 성가

조선 말기 인천 해안. 가짜 선교단에 잠입하는 실시간 분대 잠입 전술.

https://github.com/heoparang-ship-it/muhan-incheon-haemu

## 바로 보기

- 게임: [`game/index.html`](game/index.html)
- 인수인계: [`HANDOFF.md`](HANDOFF.md)
- 현황: [`STATUS.md`](STATUS.md)
- 설계: [`docs/DESIGN.md`](docs/DESIGN.md)
- 백서: [`docs/WHITEPAPER.md`](docs/WHITEPAPER.md)
- 다음 작업: [`docs/NEXT.md`](docs/NEXT.md)

## 구조

```
game/                 플레이 묶음 (엔진+에셋)
    index.html          단일 파일 엔진
    asset-data.js
    assets/             bld chars props tex ui
scripts/              크로마·에셋 베이크·QA
docs/                 설계·백서·다음 작업
assets/refs/          초상 레퍼런스
haemu-unity/          tut01 포교선 · 문화재청 돛 이식 (로컬 Unity에 복사)
```

현재 엔진은 예전 모듈형 `docs/archive/HAEMU-modular.html`이 아니다. `game/index.html`이다.

## 한 줄 상태 (2026-08-19)

1·2차 시스템 + 코만도스 프리렌더 + 마젠타 제거.  
걷기 4×4 시트와 백서 3차가 남음.

## 실행

```bash
python3 -m http.server 8080 --directory game
```
