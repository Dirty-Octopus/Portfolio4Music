"""Create portable website assets without modifying the source recordings."""
from pathlib import Path
import subprocess, json, array, shutil, hashlib
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/media'
OUT.mkdir(parents=True, exist_ok=True)
def ff(*args):
    return subprocess.check_output(['ffmpeg','-v','error','-y',*map(str,args)])
def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(p)]))
def category(name):
    if any(x in name for x in ['音效','反馈','提示音','启动音','点击音','转场音','扫描音','闪烁音','完成音','滑块','旋钮','滚动']): return 'sound-design'
    if any(x in name for x in ['影视','管弦']): return 'cinematic'
    if any(x in name for x in ['游戏','音游']): return 'game'
    if any(x in name for x in ['凯尔特','阿拉伯']): return 'world'
    return 'contemporary'
def waveform(p):
    raw=ff('-i',p,'-map','0:a:0','-ac','1','-ar','4000','-f','f32le','-')
    samples=array.array('f',raw)
    step=max(1,len(samples)//192)
    peaks=[max(map(abs,samples[i*step:min(len(samples),(i+1)*step)]),default=0) for i in range(192)]
    top=max(peaks) or 1
    return [round(x/top,3) for x in peaks]
tracks=[]
audio_sources=ROOT/'audio-sources'
sources=sorted([p for folder in ('music','sound-design') for p in (audio_sources/folder).iterdir() if p.is_file()])
for p in sources:
    if p.suffix.lower() not in ['.mp3','.wav','.m4a','.flac','.ogg','.aif','.aiff']: continue
    ident=hashlib.sha1(p.name.encode()).hexdigest()[:10]
    ext='.wav' if p.suffix.lower()=='.wav' else p.suffix.lower()
    dest=OUT/f'{ident}{ext}'
    if not dest.exists():
        if ext=='.wav': ff('-i',p,'-map','0:a:0','-c:a','pcm_s16le',dest)
        else: shutil.copy2(p,dest)
    meta=probe(dest); audio=next(s for s in meta['streams'] if s.get('codec_type')=='audio')
    tracks.append(dict(id=ident,title=p.stem,filename=p.name,src=f'media/{dest.name}',category=category(p.stem),duration=float(meta['format']['duration']),sampleRate=audio['sample_rate'],format=ext[1:].upper(),peaks=waveform(dest)))
sfx={}
site_titles={
    'pad':'环境背景音乐','bootupcrt':'启动音效','flicker':'屏幕闪烁音效',
    'preselect':'界面预选音效','clack':'旋钮反馈音效','lowerclack':'滚动反馈音效',
    'clickeffect':'点击反馈音效','clickevent':'交互反馈音效','suprise':'惊喜音效',
    'neuraasliderto':'滑块移入音效','neuraasliderfrom':'滑块移出音效','round':'进度完成音效',
    'scanner':'扫描音效','notification':'启动通知音效',
}
for name,title in site_titles.items():
    dest=OUT/f'{name}.wav'
    source=audio_sources/'site-sfx'/f'{name}.wav'
    ff('-i',source,'-c:a','pcm_s16le',dest)
    sfx[name]=f'media/{dest.name}'
    category='sound-design' if name == 'pad' else 'sfx'
    tracks.append(dict(id=name,title=title,filename=f'audio-sources/site-sfx/{name}.wav',src=sfx[name],category=category,duration=float(probe(dest)['format']['duration']),sampleRate='44100',format='WAV',peaks=waveform(dest)))
videos=[]
for p in sorted(ROOT.glob('*.mp4')):
    dest=OUT/'showreel.mp4'
    if not dest.exists():
        ff('-i',p,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',dest)
    ff('-ss','18','-i',dest,'-frames:v','1','-vf','scale=1280:-1',ROOT/'public/art/video-poster.jpg')
    meta=probe(dest); stream=next(s for s in meta['streams'] if s.get('codec_type')=='video')
    videos.append(dict(id='showreel',title=p.stem,filename=p.name,src=f'media/{dest.name}',poster='art/video-poster.jpg',duration=float(meta['format']['duration']),width=stream['width'],height=stream['height']))
(ROOT/'src/media.json').write_text(json.dumps(dict(tracks=tracks,videos=videos,sfx=sfx),ensure_ascii=False,separators=(',',':')))
print(f'Prepared {len(tracks)} audio files (including 2 SFX), {len(videos)} video.')
