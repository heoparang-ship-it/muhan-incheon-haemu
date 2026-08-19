# 로컬 코만도스 참고 경로

이 문서는 **경로만** 적습니다. Commandos 2 원본 파일은 저장소에 넣지 않습니다.

## 위치 (이 맥)

- 추출 에셋: `/Users/pr/Downloads/Commandos2_Assets`
  - `01_소리` `02_영상` `03_그림` `04_글자` `05_폰트` `06_문서` `07_게임데이터` `_data`
  - 브라우저: `00_에셋브라우저.html`
- 게임 설치본: `/Users/pr/Downloads/Commandos 2`
  - `DATA.PCK` `DATA2.PCK` `DATA/` `comm2.exe`

## 규칙

- GitHub(`heoparang-ship-it/muhan-incheon-haemu`)에는 올리지 않는다.
- 해무에 넣는 것은 조선판 원본 장·베이커·측정 메모만.
- 스크립트가 읽을 때는 위 절대경로를 로컬에서만 사용한다.

## 해무 작업본

- 게임: `/Users/pr/Documents/무한인천/haemu/game/`
- 브랜치: `cursor/tut01-painted-map-9274`

## 에셋 브라우저에서 본 것 (2026-08-19)

`00_에셋브라우저.html` 목록은 **5499개 · 1.26 GB**. 상자(`DATA.PCK`/`DATA2.PCK`)를 열어 종류별로 복사한 보관함이다.

**여기 없는 것:** 미션 지도 `.Y64` 20개, 약 815 MB. 바닥 그림·줌 장이 여기 있다. 원본은 설치본 `Commandos 2/DATA/MISIONES/`.

TU01(훈련 1 · 지도 탐색)은 초소 한 곳이다. 해무 하선은 장소만 바꾸고, 손 순서는 같다. 목표 글에 `BLOQUEA`가 있어 한 걸음을 빼면 다음이 안 된다.

| 역할 | 코만도스 TU01 | 해무 하선 |
|---|---|---|
| 눕히기 | 공병, 담배 피는 병사 | 무진, 쉬는 짐꾼 |
| 숨기기 | 숲 | 가마니 |
| 유인 | 담배갑 | 향주머니 |
| 안 보이게 이동 | 도둑 + 전신주 | 해주 + 널빤지 밑 |
| 잠긴 상자 | 절단기 | 사공 칼 |
| 자르기 | 철조망 | 그물 |

TU01에는 `.H2O`(물 장)가 없다. 물은 TU04부터.

## 지금 해무에 필요한 파일 (맥에서 복사)

원본 바이너리는 GitHub에 올리지 않는다. 채팅에 붙이거나 로컬에서만 읽는다.

### 1) 설치본 — 바닥 그림 (브라우저에 없음)

```
/Users/pr/Downloads/Commandos 2/DATA/MISIONES/TU01/
```

있을 법한 이름: `TU01.Y64` `TU01EX.Y64`. 한 장이 수십 MB일 수 있다.

### 2) 보관함 — 물건·길·수첩 (브라우저에 있음, 작음)

```
/Users/pr/Downloads/Commandos2_Assets/07_게임데이터/MA2/MISIONES/TU01/TU01EX.MA2
/Users/pr/Downloads/Commandos2_Assets/07_게임데이터/SEC/MISIONES/TU01/TU01EX.SEC
/Users/pr/Downloads/Commandos2_Assets/07_게임데이터/MIS/MISIONES/TU01/TU01.MIS
/Users/pr/Downloads/Commandos2_Assets/07_게임데이터/BAS/MISIONES/TU01/TU01.BAS
/Users/pr/Downloads/Commandos2_Assets/07_게임데이터/GSC/MISIONES/TU01/TU01.GSC
/Users/pr/Downloads/Commandos2_Assets/07_게임데이터/MSB/MISIONES/TU01/MANUAL_LIBRETA_TU01.MSB
/Users/pr/Downloads/Commandos2_Assets/03_그림/스프라이트_GRL/MISIONES/TU01/TU01LIB.GRL
```

`TU01EX.MA2` 487 KB — 가림 종이(물건).  
`TU01EX.SEC` 60 KB — 구역.  
`TU01.MIS` 69 KB — 사람·상자 자리.  
`TU01LIB.GRL` 96 KB, 그림 2장 278×219 — 수첩 그림이지 맵이 아니다.

한 방에 묶는 예:

```bash
mkdir -p /tmp/tu01-ref
cp "/Users/pr/Downloads/Commandos 2/DATA/MISIONES/TU01/"*.Y64 /tmp/tu01-ref/ 2>/dev/null
cp /Users/pr/Downloads/Commandos2_Assets/07_게임데이터/MA2/MISIONES/TU01/TU01EX.MA2 /tmp/tu01-ref/
cp /Users/pr/Downloads/Commandos2_Assets/07_게임데이터/SEC/MISIONES/TU01/TU01EX.SEC /tmp/tu01-ref/
cp /Users/pr/Downloads/Commandos2_Assets/07_게임데이터/MIS/MISIONES/TU01/TU01.MIS /tmp/tu01-ref/
cp /Users/pr/Downloads/Commandos2_Assets/07_게임데이터/BAS/MISIONES/TU01/TU01.BAS /tmp/tu01-ref/
cp /Users/pr/Downloads/Commandos2_Assets/07_게임데이터/GSC/MISIONES/TU01/TU01.GSC /tmp/tu01-ref/
cp /Users/pr/Downloads/Commandos2_Assets/07_게임데이터/MSB/MISIONES/TU01/MANUAL_LIBRETA_TU01.MSB /tmp/tu01-ref/
cp /Users/pr/Downloads/Commandos2_Assets/03_그림/스프라이트_GRL/MISIONES/TU01/TU01LIB.GRL /tmp/tu01-ref/
ls -lh /tmp/tu01-ref
```

그다음 그 폴더를 채팅에 올리면 된다. `DATA.PCK` 전체나 Y64 20개를 한꺼번에 올리지 말 것.
