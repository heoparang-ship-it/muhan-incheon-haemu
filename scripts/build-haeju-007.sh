#!/usr/bin/env bash
# Joseon 007 disguise edit: staccato transform, then a long walk through the gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
S="$ROOT/videos/stills/007"
C="$ROOT/videos/clips"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

vf_static='scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p'
vf_push() {
  local frames=$1
  echo "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='min(1.12,1+0.12*on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p"
}

hold() {
  local in="$1" out="$2" sec="$3"
  ffmpeg -y -hide_banner -loglevel error -loop 1 -i "$in" -t "$sec" -r 30 \
    -vf "$vf_static" -an -c:v libx264 -preset veryfast -crf 18 "$out"
}

push() {
  local in="$1" out="$2" sec="$3"
  local frames=$((sec * 30))
  ffmpeg -y -hide_banner -loglevel error -loop 1 -i "$in" -t "$sec" -r 30 \
    -vf "$(vf_push "$frames")" -an -c:v libx264 -preset veryfast -crf 18 "$out"
}

black() {
  local out="$1" sec="$2"
  ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=0x03070a:s=1080x1920:d=${sec}:r=30" \
    -pix_fmt yuv420p -an -c:v libx264 -preset veryfast -crf 18 "$out"
}

# 15.00s  007: click-click transform, then the walk
black "$TMP/00.mp4" 0.20
hold "$S/haeju007-01-eye.png"    "$TMP/01.mp4" 0.40
black "$TMP/02.mp4" 0.12
hold "$S/haeju007-02-collar.png" "$TMP/03.mp4" 0.34
hold "$S/haeju007-03-white.png"  "$TMP/04.mp4" 0.28
hold "$S/haeju007-04-goreum.png" "$TMP/05.mp4" 0.34
hold "$S/haeju007-05-seal.png"   "$TMP/06.mp4" 0.32
hold "$S/haeju007-06-hat.png"    "$TMP/07.mp4" 0.34
hold "$S/haeju007-07-mirror.png" "$TMP/08.mp4" 0.90
push "$S/haeju007-08-walk.png"   "$TMP/09.mp4" 2
hold "$S/haeju007-09-check.png"  "$TMP/10.mp4" 1.6
hold "$S/haeju007-09b-pass.png"  "$TMP/11.mp4" 1.2
push "$S/haeju007-10-corridor.png" "$TMP/12.mp4" 4
push "$S/haeju007-11-gate.png"   "$TMP/13.mp4" 3

list="$TMP/list.txt"
: > "$list"
for i in 00 01 02 03 04 05 06 07 08 09 10 11 12 13; do
  echo "file '$TMP/${i}.mp4'" >> "$list"
done

ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$list" \
  -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -movflags +faststart \
  "$C/haeju-007-disguise.mp4"

ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$C/haeju-007-disguise.mp4"
ls -lh "$C/haeju-007-disguise.mp4"
