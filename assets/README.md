# 에셋 슬롯

게임은 `ASSET_DATA`가 있으면 그림을 쓰고, 없으면 코드로 그린다.  
지금 플레이 묶음은 `game/asset-data.js`에 슬롯이 들어 있다. 유닛은 idle 4방향만, walk 시트는 아직 없다.

드라이브 폴더 [무한인천-에셋](https://drive.google.com/drive/folders/1q6VNkSSV1IjQa0sqZsPXrXd7ia-A__xH)와 같은 구조다. 2026-08-18 기준 드라이브 안은 비어 있었다.

```
assets/
  anim/loop/       걷기·대기 루프 시트
  buildings/       건물 몸체·지붕
  characters/      대원·경비·주민 스프라이트
  portraits/       HUD 초상  ← 지금 HTML에서 추출한 4장만 있음
  props/           소품
  textures/        지형 타일
```

## 코드가 찾는 파일 ID

주입 시 `ASSET_DATA.assets[id]` 키와 맞출 것.

### textures
`terr_sea` `terr_mud` `terr_sand` `terr_grass` `terr_dirt` `terr_wood` `terr_stone` `terr_salt` `terr_reed` `terr_rock` `terr_floor` `terr_pier` `terr_cave`

### characters — 대원
`agent_haeju` `agent_mujin` `agent_dochi` `agent_wolsim`

### characters — 경비
`guard_acolyte` `guard_steward` `guard_soldier` `guard_sailor` `guard_priest`

### characters — 주민
`civil_villager` `civil_believer` `civil_patient` `civil_child` `civil_prisoner`

### props
`prop_pine` `prop_tree` `prop_bush` `prop_rock` `prop_jar` `prop_net` `prop_rack` `prop_cart` `prop_well` `prop_boat` `prop_wreck` `prop_crate` `prop_kiln` `prop_altar` `prop_belltower` `prop_stalag` `prop_stone_pile`

### buildings
`bld_{id}_body` / `bld_{id}_roof`  
또는 `bld_{roof}_{w}x{h}_body` / `_roof`

건물 id 예: `chapel` `clinic` `office` `store` `tavern` `shrine` `smugStore` `sanctum` `cell` `tideRoom`

### portraits (현재 파일)
- `haeju.jpg` 윤해주
- `mujin.jpg` 강무진
- `dochi.jpg` 백도치
- `wolsim.jpg` 월심

HTML 안에도 같은 초상이 base64로 박혀 있다.

### anim/loop
코드는 방향·프레임 클립을 찾는다. 시트 규격은 `initArt` / `drawSprite`를 볼 것.
