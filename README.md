# 무한인천: 해무의 성가

조선 말기 인천 해안. 가짜 선교단에 잠입하는 실시간 분대 잠입 전술.  
**이 저장소는 private. 외부 공개 아님.**

## 바로 보기

- 게임: [`game/index.html`](game/index.html)
- 현황: [`STATUS.md`](STATUS.md)
- 설계: [`docs/DESIGN.md`](docs/DESIGN.md)
- 제목: [`docs/TITLE.md`](docs/TITLE.md)
- 에셋 슬롯: [`assets/README.md`](assets/README.md)
- 다음 작업: [`docs/NEXT.md`](docs/NEXT.md)
- 공개 범위: [`PRIVACY.md`](PRIVACY.md)

## 한 줄 상태 (2026-08-18)

1장 시스템·규칙·카피는 거의 닫힘.  
월드 아트·타이틀·세이브가 없어 후기 프로토.  
`ASSET_DATA = null`. HUD 초상 4장만 `assets/portraits/`에 있음.

## 실행

```bash
python3 -m http.server 8080 --directory game
```
