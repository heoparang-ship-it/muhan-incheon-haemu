#!/usr/bin/env bash
# Marvel-style per-character ability cinematics
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STILLS="$ROOT/videos/stills"
CARDS="$ROOT/videos/cards"
CLIPS="$ROOT/videos/clips"
mkdir -p "$CLIPS"

python3 "$ROOT/scripts/make-marvel-cards.py"

clip() {
  local in="$1" out="$2" w="$3" h="$4" seconds="$5" z1="$6"
  local frames=$((seconds * 30))
  ffmpeg -y -hide_banner -loglevel error -loop 1 -i "$in" \
    -vf "scale=iw*2:ih*2,zoompan=z='min(1+(${z1}-1)*on/${frames},${z1})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=30,format=yuv420p" \
    -t "$seconds" -r 30 -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$out"
}

concat() {
  local list="$1" out="$2"
  ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$list" \
    -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart "$out"
}

build() {
  local id="$1" qimg="$2" ximg="$3" tag="$4" w="$5" h="$6"
  local tmp
  tmp="$(mktemp -d)"
  echo "→ $id $tag"

  if [ "$tag" = "9x16" ]; then
    clip "$CARDS/intro-9x16.png" "$tmp/00.mp4" "$w" "$h" 2 1.0
    clip "$STILLS/${id}-vertical-9x16.png" "$tmp/01.mp4" "$w" "$h" 3 1.18
    clip "$CARDS/${id}-q-9x16.png" "$tmp/02.mp4" "$w" "$h" 1 1.0
    clip "$STILLS/${id}-ability-${qimg}-9x16.png" "$tmp/03.mp4" "$w" "$h" 4 1.12
    clip "$CARDS/${id}-x-9x16.png" "$tmp/04.mp4" "$w" "$h" 1 1.0
    clip "$STILLS/${id}-ability-${ximg}-9x16.png" "$tmp/05.mp4" "$w" "$h" 4 1.12
    clip "$CARDS/${id}-end-9x16.png" "$tmp/06.mp4" "$w" "$h" 3 1.04
    out="$CLIPS/${id}-marvel-vertical.mp4"
  else
    clip "$CARDS/intro-16x9.png" "$tmp/00.mp4" "$w" "$h" 2 1.0
    clip "$STILLS/${id}-closeup-16x9.png" "$tmp/01.mp4" "$w" "$h" 3 1.16
    clip "$CARDS/${id}-q-16x9.png" "$tmp/02.mp4" "$w" "$h" 1 1.0
    clip "$STILLS/${id}-ability-${qimg}-16x9.png" "$tmp/03.mp4" "$w" "$h" 4 1.10
    clip "$CARDS/${id}-x-16x9.png" "$tmp/04.mp4" "$w" "$h" 1 1.0
    clip "$STILLS/${id}-ability-${ximg}-16x9.png" "$tmp/05.mp4" "$w" "$h" 4 1.10
    clip "$CARDS/${id}-end-16x9.png" "$tmp/06.mp4" "$w" "$h" 3 1.04
    out="$CLIPS/${id}-marvel.mp4"
  fi

  {
    echo "file '$tmp/00.mp4'"
    echo "file '$tmp/01.mp4'"
    echo "file '$tmp/02.mp4'"
    echo "file '$tmp/03.mp4'"
    echo "file '$tmp/04.mp4'"
    echo "file '$tmp/05.mp4'"
    echo "file '$tmp/06.mp4'"
  } > "$tmp/list.txt"
  concat "$tmp/list.txt" "$out"
  rm -rf "$tmp"
}

build haeju disguise talk 9x16 1080 1920
build mujin takedown rope 9x16 1080 1920
build dochi water net 9x16 1080 1920
build wolsim bell smoke 9x16 1080 1920

build haeju disguise talk 16x9 1920 1080
build mujin takedown rope 16x9 1920 1080
build dochi water net 16x9 1920 1080
build wolsim bell smoke 16x9 1920 1080

echo "→ 마블 릴"
printf "file '%s'\n" \
  "$CLIPS/haeju-marvel.mp4" \
  "$CLIPS/mujin-marvel.mp4" \
  "$CLIPS/dochi-marvel.mp4" \
  "$CLIPS/wolsim-marvel.mp4" > /tmp/marvel-reel.txt
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i /tmp/marvel-reel.txt \
  -c copy "$CLIPS/marvel-reel.mp4"

echo "done"
ls -lh "$CLIPS"/*marvel*
