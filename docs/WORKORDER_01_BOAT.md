# 상세 작업지시서 #1 — 배 · 담기(containment)

발행 2026-08-19 · 대상 `game/index.html` (단일 파일, 6,869줄)
근거 문서 [`COMMANDOS_PARITY_PLAN.md`](COMMANDOS_PARITY_PLAN.md) · [`COMMANDOS2_REF.md`](COMMANDOS2_REF.md)

> 이 문서 하나만 읽고 바로 구현할 수 있게 썼습니다. 추측할 부분이 없어야 정상입니다.
> 줄번호는 **2026-08-19 시점 `main` 브랜치 기준 실측**입니다. 코드를 고치면 밀리니, 줄번호보다 **함수 이름**으로 찾으세요.

---

## 0. 확정된 결정 3건

| 갈림길 | 결정 | 영향 |
|---|---|---|
| 개발 순서 | **배 먼저** → 배경 → 대본 → 애니 → 소지품 → 규칙 | 이 문서가 1단계 |
| 카메라 4방향 회전 | **넣는다** (원본 동일) | 2단계 배경을 4회 굽는다. **캐릭터 스프라이트는 추가 비용 0** (아래 참조) |
| 현재 제작 목표 | **튜토리얼(훈련 맵)** | 감나루 본편 3막은 그 다음. 훈련 맵이 이식 증명 겸 튜토리얼 |

### 카메라 4방향에 대한 중요한 사실

8방향 스프라이트는 방향이 45°씩 나뉩니다. 카메라를 90° 돌리면 **방향 색인이 정확히 2칸 밀립니다.**
→ **8방향 시트 한 벌로 4회전을 전부 커버합니다. 캐릭터 아트 추가 비용 0.**
(원본이 8방향을 쓴 이유가 이것입니다.)

추가 비용이 드는 것은 **배경·가림 마스크뿐** (×4). 지금 4방향인 우리 시트는 어차피 8방향으로 늘려야 하므로(4단계), 회전 결정이 아트 예산을 늘리지 않습니다.

---

## 1. 현재 코드 지도 (실측)

`game/index.html`은 단일 파일이지만 안에 옛 모듈 구분 주석이 남아 있습니다.

| 줄 | 섹션 | 내용 |
|---|---|---|
| 647 | `a_core.js` | 상수 · 좌표 · 시드난수 · 소리합성 · 카메라 |
| 889 | `b_map.js` | 맵 생성 |
| 1475 | `c_nav.js` | **조수 · 통행 · A\* · 시야 · 소리** ← 여기 손댐 |
| 1746 | `d_render.js` | 렌더러 |
| 2638 | `j_assets.js` | 에셋 슬롯 |
| 2836 | `e_units.js` | **유닛 정의 · 이동** ← 여기 손댐 |
| 3439 | `f_ai.js` | 경비 AI |
| 4073 | `g_play.js` | **미션 규칙 · 상호작용** ← 여기 손댐 |
| 4957 | `h_ui.js` | HUD |
| 5299 | `i_main.js` | **루프 · 그리기정렬 · 입력** ← 여기 손댐 |

### 손댈 함수 정확한 위치

| 함수 | 줄 | 하는 일 |
|---|---|---|
| `waterDepth(i)` | 1497 | 타일 물 깊이. **그대로 씀** |
| `DEEP = 0.30` | 1503 | 걸어서 못 지나는 깊이 |
| `walkableAt(tx,ty,lv,unit)` | 1506 | **← 분기 2개 추가** |
| `stepOk(a,b)` | 1535 | 고저차 통행. **← 배 예외** |
| `moveCost(tx,ty,unit)` | 1543 | A\* 비용. **← 배 분기** |
| `findPath(sx,sy,tx,ty,unit,limit)` | 1576 | 그대로 재사용 |
| `nearestOpen(tx,ty,unit,maxR)` | 1568 | 그대로 재사용 |
| `groundZ(tx,ty,lv)` | 1735 | 지면 높이 |
| `AGENT_DEFS` | 2841 | 대원 4명 정의 |
| `baseUnit(o)` | 2899 | **← 필드 2개 추가** |
| `spawnAll()` | 2908 | **← `spawnBoats()` 호출 추가** |
| `moveUnit(u,dt)` | 3000 | **← 헤엄 분기 추가** |
| `unitScreen(u)` | 3097 | 화면 좌표 |
| `drawFigure(g,u,opt)` | 3102 | 사람 그리기 |
| `emitNoise(tx,ty,r,type,src)` | 3480 | 소리 전파 |
| `nearestInteract(a,maxD)` | 4178 | **← 배 후보 추가** |
| `interact(a,fromQueue)` | 4217 | **← 배 분기 추가** |
| `startAction(a,dur,done,label)` | 4497 | 시전 동작 |
| `toast(text,kind)` | 5142 | 알림 |
| 그리기 정렬 `items.push` | 5735~5740 | **← 배 항목 추가** |
| `update(dt)` | 5851 | **← `updateBoats(dt)` 호출 추가** |
| `setPath(a,tx,ty)` | 5517 부근 | **← 조타 중이면 배로 위임** |
| 클릭 이동 처리 | 6064~6082 | 그대로 (setPath가 처리) |

### 핵심 상수 (건드리지 말 것)

```js
const TW = 64, TH = 32, ZH = 20;          // 654줄
isoX = (tx-ty)*32 ,  isoY = (tx+ty)*16 - z*20
MAP_W = MAP_H = 96
DEEP = 0.30                                // 걸어서 못 지나는 깊이
waterDepth(i) = waterLevel() - map.elev[i]
```

---

## 2. 설계 원칙 — 원본에서 그대로 가져오는 것

원본 코만도스 2 해독 결과 확정된 사실 (근거: `COMMANDOS2_REF.md`)

1. **배는 탈것이면서 동시에 사람을 담는 그릇이다.** 구역 순간이동이 아니다. 유닛이 배의 **자식 목록**에 들어간다.
2. **그 담기 구조는 인벤토리·수풀 은신·시체 나르기와 완전히 같은 메커니즘이다.**
   → 그래서 담기를 먼저 만들면 5단계(소지품)가 거의 공짜가 된다.
3. **좌석 배열의 길이가 곧 정원이다.** 정원 숫자 필드는 원본에 없다.
4. **좌석마다 탑승/하선 동작이 "타는 사람의 현재 물리상태"별로 다르다.** 물리상태는 딱 2개 — 걷는 중 / 헤엄치는 중.
5. **조종 자격은 화이트리스트다.** 원본에서 고무보트를 몰 수 있는 건 사공 하나뿐이다.
6. **미션 판정도 담기로 한다.** `대원 전원이 배 안에 있고 + 배가 탈출 구역에 있으면 성공`.
7. **익사는 없다.** 산소 타이머 없음. 물속 긴장은 조수와 적으로 만든다.

**우리 고유로 추가하는 것 하나** — 원본에 조수가 없으므로 배가 항상 떠 있다. 우리는 **흘수(draft)** 를 넣어 물이 얕으면 좌초시킨다.

---

## 3. 붙여넣을 코드 — 새 섹션 `k_boat.js`

**삽입 위치**: `/* ===== f_ai.js ===== */` (3439줄) **바로 앞**.
이유: 유닛 정의(`e_units`) 다음, AI 앞이어야 `baseUnit`·`moveUnit`을 쓸 수 있고 AI가 배를 참조할 수 있다.

```js
/* ===== k_boat.js ===== */
/* ============================================================
   배 · 담기(containment)
   원본 코만도스 2 이식:
     HABITACULO.DATOS[]  → seats[]          좌석 배열 = 정원
     PUEDE_CONDUCIR      → canDrive[]       조종 자격 화이트리스트
     PUNTOMANEJO         → board[]          승선 접근 지점
     BICHOS[] 자식       → holds[]          담기
     GESTOR_ANIMACIONES.MAMBOLEO → roll     파도 흔들림 (원본 수치 그대로)
     FST_ANDANDO/FST_NADANDO    → u.swimming
   우리 고유:
     draft  — 흘수. 물 깊이가 이보다 얕으면 좌초한다 (원본엔 조수가 없어 이 개념이 없음)
   ============================================================ */

const BOAT_DEFS = {
  naru: {
    name: '나룻배',
    canDrive: ['dochi'],          // 원본: ZODIAK을 몰 수 있는 건 사공뿐
    draft: 0.22,                  // 이보다 얕으면 좌초 (DEEP 0.30보다 낮게 — 걸어선 못 가는데 배는 뜨는 구간이 생기도록)
    speed: 2.6,
    /* 좌석 — 길이가 곧 정원. pos = 배 중심 기준 타일 단위 오프셋 */
    seats: [
      { pos: [-0.26, -0.14], flags: ['draw', 'helm'] },   // 조타석
      { pos: [ 0.26, -0.14], flags: ['draw'] },
      { pos: [-0.26,  0.18], flags: ['draw'] },
      { pos: [ 0.26,  0.18], flags: ['draw'] }
    ],
    board: [[-1, 0], [1, 0], [0, -1], [0, 1]],            // 원본 PUNTOMANEJO
    /* 원본 ComporZodiac.GESTOR_ANIMACIONES 수치 그대로 (단위만 우리 화면에 맞춤) */
    roll:  { velA: 5.05, velB: 4.59, velZ: 5.48, maxA: 2.05, maxB: 2.05, heave: 1.28 },
    spray: [[0.5, 0.28], [0.5, -0.28], [-0.5, 0.28], [-0.5, -0.28]],
    oarNoise: 5.2,                // 노 젓는 소리 반경 (타일)
    oarEvery: 1.6                 // 초
  }
};

let boats = [];

/* ---------- 담기 (containment) ----------
   원본은 이 하나로 타기·숨기·소지품·시체나르기를 전부 처리한다. */
function holdsOf(h) { if (!h.holds) h.holds = []; return h.holds; }

function putInside(u, holder, seat) {
  if (u.inside) takeOutside(u);
  const hs = holdsOf(holder);
  hs[seat] = u;
  u.inside = { holder, seat };
  u.path = [];
  if (u.queue) u.queue.length = 0;
  u.action = null;
  u.crouch = false;
}

function takeOutside(u, tx, ty) {
  if (!u.inside) return null;
  const h = u.inside.holder;
  holdsOf(h)[u.inside.seat] = null;
  u.inside = null;
  if (tx != null) { u.tx = tx; u.ty = ty; }
  return h;
}

function countInside(holder) { return holdsOf(holder).filter(Boolean).length; }

/* 원본 CondBichosEnBichos {NECESARIO_TODOS} */
function allInside(list, holder) {
  return list.length > 0 && list.every(u => u.inside && u.inside.holder === holder);
}

/* ---------- 배 생성 ---------- */
function addBoat(type, tx, ty) {
  const def = BOAT_DEFS[type];
  const b = {
    kind: 'boat', isBoat: true, type, def,
    tx, ty, angle: 0.8, level: 0,
    path: [], speed: def.speed, draft: def.draft,
    holds: new Array(def.seats.length).fill(null),
    afloat: false, aground: false, broken: false,
    bob: rnd() * TAU, moveT: 0, oarT: 0, warnT: 0
  };
  boats.push(b);
  return b;
}

function spawnBoats() {
  boats = [];
  /* 시작 지점 근처 갯벌. 튜토리얼에서는 여기서 배를 처음 만난다. */
  addBoat('naru', 27, 71);
}

/* ---------- 물 위 통행 ---------- */
function boatFloatsAt(tx, ty, draft) {
  if (!inMap(tx, ty)) return false;
  const i = idx(tx, ty);
  if (map.solid[i]) return false;
  return waterDepth(i) >= draft;
}
function boatAfloat(b) { return boatFloatsAt(Math.round(b.tx), Math.round(b.ty), b.draft); }

function helmSeat(b) { return b.def.seats.findIndex(s => s.flags.includes('helm')); }
function helmOf(b) { const k = helmSeat(b); return k >= 0 ? b.holds[k] : null; }
function boatCrewed(b) {
  const h = helmOf(b);
  return !!(h && h.alive && !h.unconscious && b.def.canDrive.includes(h.id));
}
/* 이 대원이 지금 배를 몰고 있는가 */
function drivingBoat(a) {
  if (!a || !a.inside) return null;
  const b = a.inside.holder;
  if (!b.isBoat) return null;
  return (a.inside.seat === helmSeat(b) && b.def.canDrive.includes(a.id)) ? b : null;
}

/* ---------- 승선 / 하선 ---------- */
function boardBoat(a, b) {
  if (b.broken) { toast('부서진 배다', 'warn'); return; }
  let seat = -1;
  const hk = helmSeat(b);
  if (b.def.canDrive.includes(a.id) && !b.holds[hk]) seat = hk;
  if (seat < 0) seat = b.holds.findIndex((u, k) => !u && k !== hk);
  if (seat < 0) seat = b.holds.findIndex(u => !u);
  if (seat < 0) { toast(b.def.name + '이(가) 찼다 — 자리 ' + b.def.seats.length + '칸', 'warn'); return; }
  startAction(a, 0.9, () => {
    putInside(a, b, seat);
    a.swimming = false;
    const nm = (a.kind === 'agent' && AGENT_DEFS[a.id]) ? AGENT_DEFS[a.id].name : '사람';
    toast(nm + (seat === hk ? '이(가) 노를 잡았다' : '이(가) 배에 탔다') +
          ' — ' + countInside(b) + '/' + b.def.seats.length, 'good');
    emitNoise(b.tx, b.ty, 3.0, '배에 오르는 소리', a);
  }, '배에 오르는 중');
}

/* 원본 SALIDA: 물이면 헤엄 상태, 뭍이면 걷기 상태 */
function leaveBoat(a) {
  const b = a.inside && a.inside.holder;
  if (!b || !b.isBoat) return;
  const bx = Math.round(b.tx), by = Math.round(b.ty);
  const dry = nearestOpen(bx, by, a, 3);
  if (dry) {
    takeOutside(a, dry[0], dry[1]);
    a.swimming = false;
    toast('뭍에 내렸다', 'good');
  } else {
    takeOutside(a, bx, by);
    setSwimming(a, true);
    toast('물로 뛰어내렸다 — 헤엄치는 중', 'warn');
    emitNoise(a.tx, a.ty, 4.4, '물에 뛰어드는 소리', a);
  }
}

/* ---------- 헤엄 (원본 FST_NADANDO) ----------
   원본에 익사·산소는 없다. 느리고 시끄럽고 능력을 못 쓸 뿐이다. */
function setSwimming(u, on) {
  u.swimming = !!on;
  if (on) { u.crouch = false; u.carrying = null; }
}
function updateSwim(u) {
  if (!u.swimming) return;
  const i = tileAt(u.tx, u.ty);
  if (waterDepth(i) < 0.12) u.swimming = false;   // 얕아지면 자동으로 일어선다
}

/* ---------- 배 이동 ---------- */
function setBoatPath(b, tx, ty) {
  if (!boatCrewed(b)) { toast('노를 잡을 사람이 없다', 'warn'); return false; }
  if (!b.afloat) { toast('배가 좌초했다 — 물이 더 들어와야 한다', 'warn'); return false; }
  let gx = Math.round(tx), gy = Math.round(ty);
  if (!boatFloatsAt(gx, gy, b.draft)) {
    const alt = nearestFloat(gx, gy, b.draft, 6);
    if (!alt) { toast('그곳은 배가 못 간다', 'warn'); return false; }
    gx = alt[0]; gy = alt[1];
  }
  const p = findPath(b.tx, b.ty, gx, gy, b);
  if (!p.length) { toast('물길이 막혔다', 'warn'); return false; }
  b.path = p;
  return true;
}

function nearestFloat(tx, ty, draft, maxR) {
  const R = maxR || 6;
  for (let r = 0; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (boatFloatsAt(x, y, draft)) return [x, y];
    }
  }
  return null;
}

function updateBoats(dt) {
  for (const b of boats) {
    const was = b.afloat;
    b.afloat = boatAfloat(b);
    b.aground = !b.afloat;

    /* 막 좌초했을 때 한 번만 알린다 */
    if (was && !b.afloat) toast(b.def.name + '이(가) 갯벌에 얹혔다', 'warn');
    if (!was && b.afloat && countInside(b)) toast(b.def.name + '이(가) 떴다', 'good');

    if (!b.afloat) { b.path = []; }
    else if (b.path.length) {
      const t = b.path[0];
      const dx = t.tx - b.tx, dy = t.ty - b.ty, d = Math.hypot(dx, dy);
      if (d < 0.001) { b.path.shift(); }
      else {
        b.angle = Math.atan2(dy, dx);
        const step = b.speed * dt;
        if (d <= step) { b.tx = t.tx; b.ty = t.ty; b.path.shift(); }
        else { b.tx += dx / d * step; b.ty += dy / d * step; }
        b.moveT = 0.25;
        /* 노 젓는 소리 — 주기적으로 */
        b.oarT -= dt;
        if (b.oarT <= 0) {
          b.oarT = b.def.oarEvery;
          emitNoise(b.tx, b.ty, b.def.oarNoise, '노 젓는 소리', helmOf(b));
        }
      }
    }
    if (b.moveT > 0) b.moveT -= dt;

    /* 탄 사람 좌표 동기 */
    for (const u of b.holds) { if (!u) continue; u.tx = b.tx; u.ty = b.ty; u.level = b.level; u.path = []; }
  }
}

/* ---------- 그리기 ---------- */
function drawBoat(g2, b) {
  const z = groundZ(Math.round(b.tx), Math.round(b.ty));
  const sx = isoX(b.tx + .5, b.ty + .5), sy = isoY(b.tx + .5, b.ty + .5, z);
  const r = b.def.roll, t = state.t;
  /* 원본 MAMBOLEO: 서로 다른 주기 두 축을 겹쳐 파도 위에 뜬 느낌 */
  const rollA = b.afloat ? Math.sin(t * r.velA * 0.32 + b.bob) * r.maxA : 0;
  const rollB = b.afloat ? Math.sin(t * r.velB * 0.32 + b.bob * 1.7) * r.maxB * 0.5 : 0;
  const heave = b.afloat ? Math.sin(t * r.velZ * 0.32 + b.bob * 0.6) * r.heave : 0;

  g2.save();
  g2.translate(sx, sy + heave);
  g2.rotate((rollA + rollB) * Math.PI / 180);

  /* 실사 스프라이트가 있으면 그것으로 (에셋 슬롯 규칙) */
  let drawn = false;
  if (typeof ART !== 'undefined' && ART.has('prop_boat')) {
    const dirs = ART.img.prop_boat.meta.dirs || 1;
    const d = dirs > 1 ? dirIndex(b.angle, dirs) : 0;
    drawn = drawSprite(g2, 'prop_boat', 'idle', d, 0);
  }
  if (!drawn) {
    /* 코드 그림 폴백 — 조각배 실루엣 */
    g2.fillStyle = 'rgba(0,0,0,.28)';
    g2.beginPath(); g2.ellipse(0, 6, 30, 11, 0, 0, TAU); g2.fill();
    g2.fillStyle = b.broken ? '#4a3f34' : '#6b563c';
    g2.beginPath();
    g2.moveTo(-32, 0); g2.quadraticCurveTo(0, -13, 32, 0);
    g2.quadraticCurveTo(0, 11, -32, 0); g2.fill();
    g2.strokeStyle = '#3d3125'; g2.lineWidth = 1.4; g2.stroke();
    g2.fillStyle = '#8a7250';
    g2.fillRect(-18, -3, 36, 2.4);
  }
  g2.restore();

  /* 물보라 — 움직일 때만 */
  if (b.afloat && b.moveT > 0) {
    g2.save(); g2.translate(sx, sy + heave);
    g2.fillStyle = 'rgba(190,220,230,.30)';
    for (const s of b.def.spray) {
      const px = isoX(s[0], s[1]), py = isoY(s[0], s[1], 0);
      const k = (Math.sin(t * 9 + s[0] * 3 + s[1] * 5) + 1) * 0.5;
      g2.beginPath(); g2.ellipse(px, py + 2, 3 + k * 3, 1.6 + k * 1.4, 0, 0, TAU); g2.fill();
    }
    g2.restore();
  }

  /* 탄 사람 */
  b.holds.forEach((u, k) => {
    if (!u) return;
    const st = b.def.seats[k];
    if (!st.flags.includes('draw')) return;
    const ox = isoX(st.pos[0], st.pos[1]), oy = isoY(st.pos[0], st.pos[1], 0);
    g2.save(); g2.translate(sx + ox, sy + oy + heave);
    if (u.kind === 'agent') {
      const D = AGENT_DEFS[u.id];
      drawFigure(g2, u, { color: D.color, coat: D.coat, robe: D.robe, scale: 0.86 });
    } else {
      const C = CIVIL_TYPES[u.type] || { color: '#b8a98c', coat: '#4a4234' };
      drawFigure(g2, u, { color: C.color, coat: C.coat, scale: 0.82 });
    }
    g2.restore();
  });

  /* 좌초 표시 */
  if (b.aground) {
    g2.save(); g2.translate(sx, sy - 22);
    g2.fillStyle = 'rgba(3,9,12,.8)';
    g2.beginPath(); g2.roundRect(-22, -9, 44, 14, 3); g2.fill();
    g2.fillStyle = '#e8b06a'; g2.font = '600 10px "Noto Sans KR",sans-serif'; g2.textAlign = 'center';
    g2.fillText('좌초', 0, 1);
    g2.restore();
  }
}
```

---

## 4. 기존 함수 수정 — 정확한 diff

아래 8곳을 고칩니다. **각각 "찾을 것 / 바꿀 것"을 그대로 적었습니다.**

### 4-1. `walkableAt()` — 배·헤엄 분기 (c_nav, 1506줄)

**찾을 것**
```js
function walkableAt(tx, ty, lv, unit) {
  if (!inMap(tx, ty)) return false;
  const i = idx(tx, ty);
  if (lv === 1) {
```
**바꿀 것** — `const i = ...` 바로 다음에 배 분기를 넣습니다.
```js
function walkableAt(tx, ty, lv, unit) {
  if (!inMap(tx, ty)) return false;
  const i = idx(tx, ty);
  /* 배: 물만 다닌다. 흘수보다 얕으면 못 간다 */
  if (unit && unit.isBoat) {
    if (map.solid[i]) return false;
    return waterDepth(i) >= unit.draft;
  }
  if (lv === 1) {
```

**그리고 같은 함수 아래쪽**, 찾을 것
```js
  const dep = waterDepth(i);
  if (dep > DEEP) {
    if (unit && unit.waterWalk) return true;
    return false;
  }
```
**바꿀 것** — 헤엄 상태를 추가.
```js
  const dep = waterDepth(i);
  if (dep > DEEP) {
    if (unit && (unit.waterWalk || unit.swimming)) return true;
    return false;
  }
```

### 4-2. `stepOk()` — 배는 고저차 무시 (c_nav, 1535줄)

**찾을 것**
```js
function stepOk(ax, ay, bx, by, unit) {
  const ia = idx(ax, ay), ib = idx(bx, by);
```
**바꿀 것**
```js
function stepOk(ax, ay, bx, by, unit) {
  if (unit && unit.isBoat) return true;      // 배는 수면 위를 간다
  const ia = idx(ax, ay), ib = idx(bx, by);
```

### 4-3. `moveCost()` — 배 비용 (c_nav, 1543줄)

**찾을 것**
```js
function moveCost(tx, ty, unit) {
  const i = idx(tx, ty);
  let c = 1 / (TERRAIN[map.terr[i]].speed || 1);
```
**바꿀 것** — 배는 지형 대신 깊이로 비용을 낸다(깊을수록 안전·빠름).
```js
function moveCost(tx, ty, unit) {
  const i = idx(tx, ty);
  if (unit && unit.isBoat) {
    const dp = waterDepth(i);
    return 1 + Math.max(0, (unit.draft + 0.18) - dp) * 6;   // 아슬아슬한 얕은 물은 피한다
  }
  let c = 1 / (TERRAIN[map.terr[i]].speed || 1);
```

### 4-4. `baseUnit()` — 필드 2개 추가 (e_units, 2899줄)

**찾을 것**
```js
    footT: 0, lastPrint: 0, tied: false, wakeAt: 0, hidingAwake: false, level: 0
  }, o);
```
**바꿀 것**
```js
    footT: 0, lastPrint: 0, tied: false, wakeAt: 0, hidingAwake: false, level: 0,
    inside: null, swimming: false
  }, o);
```

### 4-5. `spawnAll()` — 배 생성 호출 (e_units, 2908줄)

**찾을 것**
```js
function spawnAll() {
  agents = []; guards = []; civilians = [];
```
**바꿀 것**
```js
function spawnAll() {
  agents = []; guards = []; civilians = [];
  spawnBoats();
```
> `spawnBoats`는 `k_boat.js` 섹션(3439줄 앞)에 정의되지만 함수 선언은 호이스팅되므로 순서 문제 없습니다.

### 4-6. `moveUnit()` — 담긴 유닛은 안 움직임 + 헤엄 (e_units, 3000줄)

**찾을 것**
```js
function moveUnit(u, dt) {
  if (u.carriedBy) { u.tx = u.carriedBy.tx; u.ty = u.carriedBy.ty; return; }
```
**바꿀 것**
```js
function moveUnit(u, dt) {
  if (u.inside) { const h = u.inside.holder; u.tx = h.tx; u.ty = h.ty; u.path = []; return; }
  if (u.carriedBy) { u.tx = u.carriedBy.tx; u.ty = u.carriedBy.ty; return; }
```

**그리고 속도 계산부**, 찾을 것
```js
  if (u.kind === 'agent' && u.id === 'dochi' && dep > 0.02) sp *= 1.55;
```
**바꿀 것**
```js
  if (u.kind === 'agent' && u.id === 'dochi' && dep > 0.02) sp *= 1.55;
  if (u.swimming) sp *= (u.id === 'dochi' ? 0.85 : 0.55);   // 헤엄은 느리다
```

**같은 함수 끝부분에** 헤엄 상태 갱신 한 줄을 넣습니다 (`u.path.shift()` 처리 뒤 아무 곳):
```js
  updateSwim(u);
```

### 4-7. `nearestInteract()` — 배 후보 추가 (g_play, 4178줄)

**찾을 것** (함수 마지막의 `vale` 블록 앞)
```js
  if (vale && !vale.caught && !state.valeEscaped) {
```
**바꿀 것** — 그 앞에 배 검사를 넣습니다.
```js
  for (const b of boats) {
    if (b.broken) continue;
    const dd = Math.hypot(b.tx - a.tx, b.ty - a.ty);
    if (dd < bd) { bd = dd; best = { type: 'boat', o: b, d: dd }; }
  }
  if (vale && !vale.caught && !state.valeEscaped) {
```

### 4-8. `interact()` — 배 분기 (g_play, 4217줄)

**찾을 것**
```js
  if (a.carrying) { dropCarried(a); return; }

  const n = nearestInteract(a);
```
**바꿀 것** — 이미 배에 타 있으면 내리는 게 먼저입니다.
```js
  if (a.inside && a.inside.holder.isBoat) { leaveBoat(a); return; }
  if (a.carrying) { dropCarried(a); return; }

  const n = nearestInteract(a);
```

**그리고 분기 목록에** (`if (n.type === 'door')` 근처 아무 곳) 추가:
```js
  if (n.type === 'boat') return boardBoat(a, o);
```

### 4-9. `setPath()` — 조타 중이면 배를 움직인다 (i_main, 5517줄 부근)

**찾을 것**
```js
  const pts = findPath(a.tx, a.ty, tx, ty, a);
```
가 들어 있는 `setPath` 함수의 **맨 앞**에 다음을 넣습니다.
```js
function setPath(a, tx, ty) {
  const b = drivingBoat(a);
  if (b) return setBoatPath(b, tx, ty);      // 노를 잡고 있으면 배가 간다
  if (a.inside) { toast('배에서 내려야 움직일 수 있다', 'warn'); return false; }
  ...기존 코드...
```

### 4-10. `update()` — 배 갱신 호출 (i_main, 5851줄)

**찾을 것**
```js
  updateGuards(dt);
```
**바꿀 것**
```js
  updateBoats(dt);
  updateGuards(dt);
```

### 4-11. 그리기 정렬 — 배 항목 추가 (i_main, 5735줄 부근)

**찾을 것**
```js
  for (const a of agents) { if (!a.alive || !inView(a.tx, a.ty)) continue; items.push({ d: a.tx + a.ty + (a.level || 0) * 0.4, z: 1.5 + (a.level || 0), f: () => drawAgent(g2, a) }); }
```
**바꿀 것** — 배를 먼저 넣고, 배에 탄 유닛은 개별 그리기에서 건너뜁니다.
```js
  for (const b of boats) { if (!inView(b.tx, b.ty)) continue; items.push({ d: b.tx + b.ty, z: 1.3, f: () => drawBoat(g2, b) }); }
  for (const a of agents) { if (!a.alive || a.inside || !inView(a.tx, a.ty)) continue; items.push({ d: a.tx + a.ty + (a.level || 0) * 0.4, z: 1.5 + (a.level || 0), f: () => drawAgent(g2, a) }); }
```
**그리고 위쪽 시민·경비 줄에도** `|| c.inside` / `|| g.inside` 를 같은 방식으로 추가합니다.

### 4-12. 저장/불러오기 — 배 상태 포함

`saveSnapshot` / `loadSnapshot` 계열 함수에 다음을 추가합니다.
```js
/* 저장 */
boats: boats.map(b => ({
  type: b.type, tx: b.tx, ty: b.ty, angle: b.angle, broken: b.broken,
  holds: b.holds.map(u => u ? { kind: u.kind, id: u.id || null, cid: u.cid || null } : null)
}))
/* 불러오기: 배를 다시 만들고, 저장된 참조로 putInside 를 다시 호출한다 */
```
> **주의**: 담기는 객체 참조라서 JSON으로 그냥 안 됩니다. 반드시 **id로 저장하고 로드 후 다시 연결**하세요. 이걸 빼먹으면 로드 후 배가 빈 채로 뜹니다.

---

## 5. 완료 판정 — 자동 테스트 8개

`tests/` 아래에 `boat.py`(Playwright)로 추가합니다. **8개 전부 통과해야 1단계 완료입니다.**

| # | 검사 | 기대 |
|---|---|---|
| 1 | 도치가 배에 접근해 `E` | 좌석 0(조타석)에 앉음. `drivingBoat(dochi)` 가 배를 반환 |
| 2 | 해주가 같은 배에 `E` | 좌석 1~3 중 하나. 조타석 아님 |
| 3 | 5번째 유닛 승선 시도 | 거부 + 토스트 `자리 4칸` |
| 4 | 만조(수위 상승)에 갯벌 타일 위 | `boatAfloat` = true, 그 타일로 `setBoatPath` 성공 |
| 5 | 간조에 같은 타일 | `boatAfloat` = false, `b.aground` = true, 경로 명령 거부 |
| 6 | 뭍 옆에서 하선 | `swimming` = false, 위치가 마른 타일 |
| 7 | 깊은 물 한가운데서 하선 | `swimming` = true, 이동은 되지만 속도 0.55배 |
| 8 | 기존 플레이 테스트 32개 | **전부 통과** (회귀 없음) |

추가 확인 (테스트 아님, 눈으로)
- 배가 좌우로 흔들리고 위아래로 출렁인다 (원본 MAMBOLEO 수치)
- 움직일 때 물보라 4점이 뜬다
- 노 젓는 소리에 근처 경비 의심이 오른다

---

## 6. 1단계에서 하지 말 것

- **격자를 다각형 navmesh로 바꾸지 말 것.** 조수 공식이 격자 높이에 물려 있다. 원본도 그림과 판정이 분리돼 있으므로 판정이 격자여도 문제없다.
- **익사·산소 타이머 넣지 말 것.** 원본에 없다.
- **배에 무기·충돌 데미지 넣지 말 것.** 2단계 이후.
- **맵 크기·조수 공식·대원 4역할 건드리지 말 것.**

---

## 7. 다음 단계 예고 (이 문서 범위 밖)

| 단계 | 내용 | 별도 지시서 |
|---|---|---|
| 2 | 배경 3D 베이크 + 가림 4단계 + **카메라 4방향** | `WORKORDER_02_*.md` |
| 3 | 경비 대본 (명령 20종 · 반응 플래그 4종) | `WORKORDER_03_*.md` |
| 4 | 8방향 생활 애니메이션 | |
| 5 | 소지품·줍기 (담기 재사용) | |
| 6 | 규칙 엔진 (조건 10 / 동작 6) + 힌트 | |
| 7 | 튜토리얼 훈련 맵 | |

---

## 8. 튜토리얼(현재 제작 목표) 미리보기

7단계로 미루지 않고, **1단계가 끝나면 바로 배를 가르치는 훈련 맵**을 만듭니다.
원본 훈련4가 "강 건너 → 탈것 훔쳐 → 타고 나간다"인 것에 대응해, 우리는:

```
1. 갯벌에 좌초한 나룻배를 찾는다          ← 배가 뭔지 배운다
2. 물이 들어오길 기다린다 (조수 게이지)     ← ★우리 고유. 원본엔 없는 수업
3. 도치가 노를 잡는다                     ← 조종 자격
4. 갇힌 주민 2명을 태운다                  ← 좌석 정원
5. 갯골을 따라 탈출 지점까지 간다           ← 물길 이동
```
목표 판정은 원본 그대로:
`allInside([대원들, 주민들], 배) && 배가 탈출구역 안`

원본 힌트 구조(`BLOQUEA` = 앞 단계 미완이면 다음이 안 열림)도 그대로 씁니다.
