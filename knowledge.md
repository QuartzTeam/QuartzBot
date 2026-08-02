# Quartz Mod — Knowledge Base

> The bot reads this file to answer questions. Facts pulled from the Quartz source.
> Current version: v2.0.0 (alpha). Repo: https://github.com/QuartzTeam/Quartz
> Discord: https://discord.gg/mAzAghu5Xq

## How to Answer

- Q&A only — no small talk, no open-ended chatting, no roleplay. If someone
  greets you or tries to chat, reply with one line asking what their Quartz
  question is.
- Only answer questions about Quartz: the mod itself, installing/updating it
  (MelonLoader or UMM), settings, troubleshooting, and releases. For anything
  unrelated, reply with one short sentence saying you only answer Quartz
  questions — do not answer the unrelated question, even partially.
- Keep answers brief: 1–4 sentences, or a short numbered list for
  step-by-step instructions. No greetings, no filler, no emoji.
- Only ask a follow-up question when you cannot answer without it.
- Answer in the language the question was asked in (English or Korean). For
  Korean answers, use the translation words at the bottom of this file.

## Overview

**Q: What is Quartz?**
A: An all-in-one mod for the rhythm game *A Dance of Fire and Ice* (ADOFAI). It bundles many gameplay, visual, overlay/HUD, and editor features into one mod with its own in-game settings menu.

**Q: Who made Quartz?**
A: koren and sbrothers7 (and more contributors). It's a v2 rewrite of koren's original "KorenResourcePack".

**Q: What version is it / is it stable?**
A: v2.0.0, currently in both alpha and beta. Expect bugs and frequent updates.

**Q: Where do I download it?**
A: GitHub releases: https://github.com/PrismMods/Quartz/releases

**Q: Is it free?**
A: Yes. It's open source on GitHub with the GPL-3.0 license.

**Q: Where do I get support / report bugs?**
A: The Discord server: https://discord.gg/mAzAghu5Xq, or GitHub issues.

**Q: Is Quartz the best mod in ADOFAI?**
A: Definitely.

## Install / Setup

**Q: How do I install Quartz?**
A: Two builds ship each release. `Quartz.zip` is the MelonLoader build (recommended). `QuartzUmm.zip` is the UnityModManager build (only if you already use UMM). Both use the same in-game menu.

**Q: How do I install the MelonLoader build (recommended)?**
A: 1) Download the modlist.org app and Quartz. 2) If you don't have MelonLoader, install it via the modlist.org app. 3) In the app press "Install Mod From File" and pick `Quartz.zip`. Done. (Manual alternative: drop `Quartz.zip` contents into your ADOFAI folder.)

**Q: How do I install on Mac?**
A: There's an auto installer (UMMInstall) for convenience. If not using the auto installer, use the modlist app. Make sure to use the "Copy Native Launch Options" button on the Installed tab and paste it into your Steam launch arguments if you're using the modlist app.
WARNING: If installing manually, clicking replace replaces the whole folder instead of adding files — drag the files in manually to be safe.

**Q: How do I install the UnityModManager build?**
A: Set up UMM for ADOFAI first, then in the UMM installer use "Install mod" and pick `QuartzUmm.zip` (or extract the `Quartz` folder into your UMM mods dir). Open settings with the mod's in-game keybind — the UMM IMGUI panel is NOT used. So do not ask about it. As instructed at the bottom of the screen, use "Alt+K" if on Windows or use "Option+K" if on mac.

**Q: How do I open the Quartz menu?**
A: Press the toggle keybind (default: Alt/Option+K). It's rebindable in settings ("Toggle Menu Keybind").

## Settings / General

**Q: What general settings does Quartz have?**
A: Language, UI Scale, Window Opacity, Accent Color, Fonts (including a separate Settings Window Font), "Show Quartz Settings at Startup", and the menu toggle keybind.

**Q: Does it support multiple languages?**
A: Yes — there's a Language setting. English and Korean are both supported (the README ships in both).

**Q: What are Profiles?**
A: Saveable named setting profiles you can switch between (create, rename, delete; middle-click to set a default).

**Q: Does it update itself?**
A: It has a built-in updater — Check for Updates, view notes, Install, Skip, or Undo an update from the Updates section. But this may break time to time so check the discord for more accurate updates.

**Q: Can I import settings?**
A: Yes, there's an Import option (Interop) for bringing in settings.

## Features — Gameplay

**Q: What is the Key Limiter?**
A: Only counts your allowed keys as gameplay hits (mouse buttons always allowed). Only enforced during play, so menu/editor typing is unaffected.

**Q: What is the Chatter Blocker?**
A: A keyboard chatter blocker. If a key re-fires within a configurable millisecond threshold (a switch "chattering"), the repeat is dropped. Repeats within ~5ms pass through (those are the engine double-reporting, not chatter).

**Q: What is Judgement Restriction / Death Limit?**
A: Restriction fails your run the instant a hit breaks a chosen rule (accuracy floor, Perfect-only, a custom allowed set, or no Too-Early). Death Limit fails the run once misses/overloads exceed a configured cap (useful since those don't end a no-fail run on their own). The fail message is customizable.

**Q: What is Auto Deafen?**
A: Auto-deafens you in Discord once a run passes a configured progress %, and undeafens on death/finish/leave. Works through Discord's local RPC using your own Discord OAuth app (client id + token, set up in the Gameplay tab). There's a setup tutorial video.

**Q: What are the Tweaks?**
A: Small gameplay/visual toggles: Remove All Checkpoints, Remove Ball Core Particles, Disable Tile Hit Glow, Remove Planet Glow, Disable Auto Pause (auto-play won't pause on focus loss), Block Mouse Wheel Scroll While Playing, and Hide selected Detailed Results rows.

**Q: What is the Optimizer?**
A: Engine/runtime performance toggles the game doesn't expose itself — GC scheduling, OS process priority, background execution. It doesn't change how levels look (that's the Effect Remover). Engine defaults are restored when toggled off.

**Q: What is the Effect Remover?**
A: Strips visual/audio effect events (filters, decorations, camera moves, etc.) from a level as it loads, so heavy charts play clean. While it's on, the editor's Save buttons are disabled (so you don't overwrite the original chart) unless you re-enable saving.

## Features — Overlays / HUD

**Q: What are Panels?**
A: User-composed HUD panels — named, draggable boxes showing the stat lines you choose, with per-panel appearance. Replaces the old fixed Left/Right Status HUD. Use Reorganize mode to drag/position them.

**Q: What stats can overlays show?**
A: Live stats like Accuracy, Attempts, KPS (Auto KPS), Checkpoints, Holds, BPM, and more.

**Q: What is the Combo overlay?**
A: Counts consecutive Perfect (optionally Auto) hits, resetting on any non-Perfect hit, with a center-screen pulse animation.

**Q: What is the Judgement overlay?**
A: Per-judgement hit counters for the run across nine slots: Overload, Too Early, Very Early, Early Perfect, Perfect (+Auto), Late Perfect, Very Late, Too Late, Miss.

**Q: What is the Key Viewer?**
A: An on-screen key viewer overlay. It supports DM Note-style custom CSS (gradients, :before/:after layers, @font-face fonts, transform, filter, transition, blend modes, backdrop-filter) for fully custom key visuals.

**Q: What is the Progress Bar?**
A: A top-of-screen progress bar HUD. Partial/checkpoint runs fill from the checkpoint anchor, not 0%. Rounding/radius is adjustable; draggable in Reorganize mode.

**Q: What is the Song Title overlay?**
A: A customizable in-game song-title overlay that replaces the game's own title label. Uses a `{artist}`/`{title}` format with custom font, size, color, drop shadow, and drag placement.

**Q: What is the UI Hider?**
A: Hides parts of the game's own HUD/UI. Two profiles (Playing / Recording) with independent flag sets, and a rebindable shortcut to flip between them for a clean capture layout.

**Q: What does "Enable Overlays" do?**
A: A master switch that turns the HUD overlays (Combo, Judgement, Song Title, etc.) on or off together.

## Features — Visual / Cosmetic

**Q: What are Planet Colors?**
A: Custom planet (ball) colors. Each of the three planet slots gets its own ball color/opacity and tail color/opacity; special planet skins are disabled while active.

**Q: What is the Otto Icon feature?**
A: Replaces the editor's Otto (auto-play) icon with the mod's own recolored/repositioned sprite.

**Q: What is Nostalgia / Back To The Past?**
A: A faithful port of tjwogud's BackToThePast mod. Reverts modern ADOFAI behavior/visuals/sounds to older versions: legacy result/flash/twirl, hide difficulty/no-fail, old practice mode, SFX mutes, old editor buttons, old menu background, the alpha-warning skip, and the OldXO secret-level easter egg.

**Q: What does the Status / BPM feature track?**
A: BPM math: TBPM (chart bpm × song pitch × system speed) and CBPM (the real current bpm including BPM-change tiles × song pitch).

**Q: What is Play Count?**
A: Per-map tracking: lifetime Total Attempts, Best Progress (highest % ever reached), and a per-session attempt counter. Persisted to `UserData/Quartz/PlayCount.json`.

## Features — Editor

**Q: What editor tweaks are there?**
A: "Horizontal Properties" renders each inspector property as "label [field]" on one row instead of label-above-field, and a selected-tile readout drawing total angle/beats/count/duration of the selection on a tile.

## Troubleshooting

**Q: On Mac the mod replaced my whole folder / files are missing.**
A: Known Mac behavior — the install can replace the folder instead of merging. Reinstall and drag the mod files in manually.

**Q: Should I use the MelonLoader or UMM build?**
A: MelonLoader (`Quartz.zip`) is recommended for everyone. Only use `QuartzUmm.zip` if you already run UnityModManager.

**Q: Auto Deafen isn't working.**
A: It needs your own Discord OAuth app — set the client id + token in the Gameplay tab. Follow the setup tutorial video, and make sure Discord is running locally.

**Q: Something's broken / I found a bug.**
A: It's alpha software. Report it in the Discord (https://discord.gg/mAzAghu5Xq) or on GitHub issues.

**Q: I can't reposition ___.**
A: It's probably in the "Reorganize" menu. In the "Overlay" tab above on top.

## English to Korean Translation words

Reorganize: 재배치
Keybind: 단축키
Discord: 디스코드
Quartz: 쿼츠
Toggle Menu Keybind: 메뉴 단축키
Gameplay: 게임플레이
Overlay: 오버레이
Visual: 비주얼
Settings: 설정
Profile: 프로필
Language: 언어
UI Scale: 화면 배율
Window Opacity: 창 투명도
Accent Color: 강조 색상
Font: 폰트
Import: 가져오기
Editor: 에디터
Update: 업데이트
Check for Updates: 업데이트 확인
Install: 설치
Skip: 건너뛰기
Undo: 되돌리기

Key Limiter: 키 제한
Chatter Blocker: 채터링 차단
Judgement Restriction: 판정 제한
Death Limit: 죽음 개수 제한
Auto Deafen: 자동 헤드셋 음소거
Tweaks: 트윅
Optimizer: 최적화
Effect Remover: 이펙트 제거
Panels: 패널
Enable Overlays: 오버레이 활성화
Combo: 콤보
Judgement: 판정
Key Viewer: 키 뷰어
Progress Bar: 진행도 바
Song Title: 노래 제목
UI Hider: UI 숨기기
Planet Colors: 행성 색상
Otto Icon: Otto 아이콘
Nostalgia: 추억
Status: 상태
Play Count: 플레이 횟수

Planet: 행성
Accuracy: 정확도
Attempt: 시도
Total Attempts: 총 시도
Best Progress: 최고 진행도
Progress: 진행도
Checkpoint: 체크포인트
Holds: 홀드
Auto KPS: 자동 KPS

Perfect: 정확
Early Perfect: 빠름
Late Perfect: 느림
Very Early: 빠름!
Very Late: 느림!
Too Early: 너무 빠름
Too Late: 너무 느림
Miss: 미스
Overload: 과부하

Mod: 모드
Download: 다운로드
Release: 릴리스
Pre-release: 프리릴리스 / 알파 릴리스
Version: 버전
A Dance of Fire and Ice (ADOFAI): 얼불춤
MelonLoader: 멜론로더
