#!/usr/bin/env bash
# Grok stills → Ken Burns character clips for 무한인천: 해무의 성가
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STILLS="$ROOT/videos/stills"
CLIPS="$ROOT/videos/clips"
FONT="/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
mkdir -p "$CLIPS"

kenburns() {
  local in="$1" out="$2" w="$3" h="$4" seconds="$5" z1="$6"
  local frames=$((seconds * 30))
  ffmpeg -y -hide_banner -loglevel error -loop 1 -i "$in" \
    -vf "scale=iw*2:ih*2,zoompan=z='min(1+(${z1}-1)*on/${frames},${z1})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=30,format=yuv420p" \
    -t "$seconds" -r 30 -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "$out"
}

overlay() {
  local in="$1" out="$2" name="$3" role="$4" w="$5"
  local fs_name=48 fs_role=24 pad=48
  if [ "$w" -lt 900 ]; then
    fs_name=36
    fs_role=18
    pad=28
  fi
  ffmpeg -y -hide_banner -loglevel error -i "$in" \
    -vf "fade=t=in:st=0:d=0.35,fade=t=out:st=4.45:d=0.5,\
drawtext=fontfile=${FONT}:text='${name}':fontsize=${fs_name}:fontcolor=0xf2d075:x=${pad}:y=h-${pad}-52:shadowcolor=0x000000aa:shadowx=2:shadowy=2:alpha='if(lt(t,0.5),0,if(lt(t,1.2),(t-0.5)/0.7,1))',\
drawtext=fontfile=${FONT}:text='${role}':fontsize=${fs_role}:fontcolor=0xbfe0ef:x=${pad}:y=h-${pad}-18:shadowcolor=0x000000aa:shadowx=1:shadowy=1:alpha='if(lt(t,0.7),0,if(lt(t,1.4),(t-0.7)/0.7,1))'" \
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "$out"
}

xfade_pair() {
  local a="$1" b="$2" out="$3"
  ffmpeg -y -hide_banner -loglevel error -i "$a" -i "$b" \
    -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.85:offset=4.15,fade=t=in:st=0:d=0.3,fade=t=out:st=8.7:d=0.45,format=yuv420p" \
    -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "$out"
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

build_char() {
  local id="$1" name="$2" role="$3"
  echo "→ $name 가로"
  kenburns "$STILLS/${id}-closeup-16x9.png" "$tmp/${id}-a.mp4" 1920 1080 5 1.16
  kenburns "$STILLS/${id}-cinematic-16x9.png" "$tmp/${id}-b.mp4" 1920 1080 5 1.12
  overlay "$tmp/${id}-a.mp4" "$tmp/${id}-a-t.mp4" "$name" "$role" 1920
  overlay "$tmp/${id}-b.mp4" "$tmp/${id}-b-t.mp4" "$name" "$role" 1920
  xfade_pair "$tmp/${id}-a-t.mp4" "$tmp/${id}-b-t.mp4" "$CLIPS/${id}.mp4"

  echo "→ $name 세로"
  kenburns "$STILLS/${id}-vertical-9x16.png" "$tmp/${id}-v.mp4" 1080 1920 6 1.14
  overlay "$tmp/${id}-v.mp4" "$CLIPS/${id}-vertical.mp4" "$name" "$role" 1080
}

build_char haeju "윤해주" "역관 겸 의술 보조"
build_char mujin "강무진" "파직된 영종진 수군"
build_char dochi "백도치" "감나루 뱃사공"
build_char wolsim "월심" "당집을 떠난 무녀의 제자"

echo "→ 분대"
kenburns "$STILLS/squad-cinematic-16x9.png" "$tmp/squad.mp4" 1920 1080 8 1.10
ffmpeg -y -hide_banner -loglevel error -i "$tmp/squad.mp4" \
  -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=7.4:d=0.55,\
drawtext=fontfile=${FONT}:text='무한인천: 해무의 성가':fontsize=44:fontcolor=0xf2d075:x=64:y=h-120:shadowcolor=0x000000aa:shadowx=2:shadowy=2,\
drawtext=fontfile=${FONT}:text='조사패 네 사람':fontsize=24:fontcolor=0xbfe0ef:x=64:y=h-70:shadowcolor=0x000000aa:shadowx=1:shadowy=1" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "$CLIPS/squad.mp4"

echo "→ 릴"
printf "file '%s'\n" "$CLIPS/squad.mp4" "$CLIPS/haeju.mp4" "$CLIPS/mujin.mp4" "$CLIPS/dochi.mp4" "$CLIPS/wolsim.mp4" > "$tmp/list.txt"
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$tmp/list.txt" \
  -c copy "$CLIPS/reel.mp4"

echo "done"
ls -lh "$CLIPS"
