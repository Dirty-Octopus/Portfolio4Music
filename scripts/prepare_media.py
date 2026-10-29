"""Create portable website assets without modifying source recordings.

Existing deployable media and track metadata are reused. To prepare only selected
items, pass their IDs, for example: npm run media -- --only arcane cyberpunk
website_bootup website_Water1 website_Water2.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess

from waveforms import waveform

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/media'
ART = ROOT / 'public/art'
MANIFEST = ROOT / 'src/media.json'
AUDIO_SOURCES = ROOT / 'audio-sources'
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aif', '.aiff'}
SITE_TITLES = {
    'pad': '环境背景音乐', 'website_bootup': '启动音效', 'flicker': '屏幕闪烁音效',
    'preselect': '界面预选音效', 'clack': '旋钮反馈音效', 'lowerclack': '滚动反馈音效',
    'clickeffect': '点击反馈音效', 'clickevent': '交互反馈音效', 'suprise': '惊喜音效',
    'neuraasliderto': '滑块移入音效', 'neuraasliderfrom': '滑块移出音效', 'round': '进度完成音效',
    'scanner': '扫描音效', 'notification': '启动通知音效',
    'website_Water1': '涟漪水滴音效 1', 'website_Water2': '涟漪水滴音效 2',
}
VIDEO_SPECS = (
    dict(id='magic', filename='magic-sound-design-2026-10-29.mp4', assetVersion='20261029',
         title='Magic / 音效设计', titleEn='Magic / Sound Design',
         poster='art/magic-poster.jpg', posterTime=1,
         sourceTitle='Mage VS Psychic', sourceAuthor='Grimazure',
         sourceUrl='https://www.youtube.com/watch?v=dTSXf0SZ6_g'),
    dict(id='arcane', filename='ArcaneSoundDesignTest.mp4',
         title='Arcane / 音效设计', titleEn='Arcane / Sound Design',
         poster='art/arcane-poster.jpg',
         sourceTitle='Arcane · Season 1, Episode 2',
         sourceTitleZh='《Arcane》第一季第二集',
         sourceNote='Netflix 剧集 · YouTube 公开片段',
         sourceNoteEn='Netflix series · Publicly available clip on YouTube'),
    dict(id='cyberpunk', filename='CyberpunkTest20261014.mp4',
         title='Cyberpunk / 音效设计', titleEn='Cyberpunk / Sound Design',
         poster='art/cyberpunk-poster.jpg',
         sourceTitle='What does it feel like to be a Samurai in Cyberpunk 2077',
         sourceAuthor='SamClaymor',
         sourceUrl='https://www.youtube.com/watch?v=O1tIQIp2vf0'),
    dict(id='showreel', filename='影视预告片配乐:音效设计练习.mp4',
         title='影视预告片配乐:音效设计练习',
         titleEn='Film Trailer / Scoring & Sound Design',
         poster='art/video-poster.jpg',
         sourceTitle='TRON: Ares', sourceTitleZh='《TRON: Ares / 创：战神》',
         sourceNote='电影预告片', sourceNoteEn='Film trailer'),
)


def ff(*args):
    # Never overwrite an existing asset, including those made by earlier runs.
    return subprocess.check_output(['ffmpeg', '-v', 'error', '-n', *map(str, args)])


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)
    ]))


def category(name):
    if any(x in name for x in ['音效', '反馈', '提示音', '启动音', '点击音', '转场音', '扫描音', '闪烁音', '完成音', '滑块', '旋钮', '滚动']):
        return 'sound-design'
    if any(x in name for x in ['影视', '管弦']):
        return 'cinematic'
    if any(x in name for x in ['游戏', '音游']):
        return 'game'
    if any(x in name for x in ['凯尔特', '阿拉伯']):
        return 'world'
    return 'contemporary'


def retained_track(ident, dest, existing):
    track = existing.get(ident)
    if track is not None and track['src'] == f'media/{dest.name}' and dest.exists():
        return track
    return None


def prepare_track(source, ident, title, filename, track_category, existing, only):
    ext = source.suffix.lower()
    dest = OUT / f'{ident}{ext}'
    retained = retained_track(ident, dest, existing)
    if retained is not None:
        return retained
    if only is not None and ident not in only:
        raise ValueError(f'{ident} is not prepared; include it in --only or run without --only')
    if not dest.exists():
        if ext == '.wav':
            # No -ar or -ac: preserve the source sample rate and channel count.
            ff('-i', source, '-map', '0:a:0', '-c:a', 'pcm_s16le', dest)
        else:
            shutil.copy2(source, dest)
    meta = probe(dest)
    audio = next(s for s in meta['streams'] if s.get('codec_type') == 'audio')
    return dict(id=ident, title=title, filename=filename, src=f'media/{dest.name}',
                category=track_category, duration=float(meta['format']['duration']),
                sampleRate=audio['sample_rate'], format=ext[1:].upper(), peaks=waveform(dest))


def prepare_video(spec, existing, only):
    ident = spec['id']
    previous = existing.get(ident, {})
    # Keep the original showreel filename/title/path when upgrading an existing manifest.
    filename = previous.get('filename', spec['filename']) if ident == 'showreel' else spec['filename']
    source = ROOT / filename
    src = previous.get('src', f'media/{ident}.mp4') if ident == 'showreel' else f'media/{ident}.mp4'
    poster = previous.get('poster', spec['poster']) if ident == 'showreel' else spec['poster']
    dest = ROOT / 'public' / src
    poster_path = ROOT / 'public' / poster
    selected = only is None or ident in only
    if not selected and not previous:
        raise ValueError(f'{ident} is not prepared; include it in --only or run without --only')
    if not dest.exists():
        if not selected:
            raise ValueError(f'{dest.name} is missing; include {ident} in --only')
        source_meta = probe(source)
        video = next(s for s in source_meta['streams'] if s.get('codec_type') == 'video')
        audio = next((s for s in source_meta['streams'] if s.get('codec_type') == 'audio'), None)
        if video['codec_name'] == 'h264' and (audio is None or audio['codec_name'] == 'aac'):
            # Explicit maps discard data/subtitle tracks; stream copy keeps A/V lossless.
            # Disable automatic recreation of a timecode data track from stream tags.
            ff('-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-write_tmcd', '0',
               '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', dest)
        else:
            # Compatibility for an older showreel source that needs browser-safe codecs.
            ff('-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-write_tmcd', '0',
               '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dest)
    meta = probe(dest)
    video = next(s for s in meta['streams'] if s.get('codec_type') == 'video')
    duration = float(meta['format']['duration'])
    if not poster_path.exists():
        if not selected:
            raise ValueError(f'{poster_path.name} is missing; include {ident} in --only')
        ff('-ss', spec.get('posterTime', min(18, duration / 2)), '-i', dest, '-frames:v', '1',
           '-vf', 'scale=1280:-2', '-q:v', '2', poster_path)
    record = dict(previous)
    record.update(id=ident, title=previous.get('title', spec['title']) if ident == 'showreel' else spec['title'],
                  titleEn=spec['titleEn'], filename=filename, src=src, poster=poster,
                  duration=duration, width=video['width'], height=video['height'])
    if spec.get('assetVersion'):
        record['src'] = f"{src}?v={spec['assetVersion']}"
        record['poster'] = f"{poster}?v={spec['assetVersion']}"
    for key in ('sourceTitle', 'sourceTitleZh', 'sourceAuthor', 'sourceUrl', 'sourceNote', 'sourceNoteEn'):
        if key in spec:
            record[key] = spec[key]
    return record


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', metavar='ID', help='Prepare only these IDs; reuse all other existing assets')
    args = parser.parse_args(argv)
    only = set(args.only) if args.only is not None else None
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    existing_tracks = {t['id']: t for t in manifest.get('tracks', [])}
    existing_videos = {v['id']: v for v in manifest.get('videos', [])}
    sources = sorted(p for folder in ('music', 'sound-design')
                     for p in (AUDIO_SOURCES / folder).iterdir()
                     if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS)
    music_ids = {hashlib.sha1(p.name.encode()).hexdigest()[:10] for p in sources}
    known_ids = music_ids | set(SITE_TITLES) | {v['id'] for v in VIDEO_SPECS}
    if only is not None and only - known_ids:
        parser.error(f'Unknown asset IDs: {", ".join(sorted(only - known_ids))}')
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    tracks = []
    for source in sources:
        ident = hashlib.sha1(source.name.encode()).hexdigest()[:10]
        tracks.append(prepare_track(source, ident, source.stem, source.name,
                                    category(source.stem), existing_tracks, only))
    sfx = {}
    for name, title in SITE_TITLES.items():
        source = AUDIO_SOURCES / 'site-sfx' / f'{name}.wav'
        tracks.append(prepare_track(source, name, title, source.relative_to(ROOT).as_posix(),
                                    'sound-design' if name == 'pad' else 'sfx', existing_tracks, only))
        sfx[name] = f'media/{name}.wav'
    videos = [prepare_video(spec, existing_videos, only) for spec in VIDEO_SPECS]
    manifest.update(tracks=tracks, videos=videos, sfx=sfx)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')))
    print(f'Prepared {len(tracks)} audio entries (including {sum(t["category"] == "sfx" for t in tracks)} SFX), {len(videos)} videos.')


if __name__ == '__main__':
    main()
