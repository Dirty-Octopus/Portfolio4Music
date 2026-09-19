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
for p in sorted(ROOT.iterdir()):
    if p.suffix.lower() not in ['.mp3','.wav','.m4a','.flac','.ogg']: continue
    ident=hashlib.sha1(p.name.encode()).hexdigest()[:10]
    ext='.wav' if p.suffix.lower()=='.wav' else p.suffix.lower()
    dest=OUT/f'{ident}{ext}'
    if not dest.exists():
        if ext=='.wav': ff('-i',p,'-map','0:a:0','-c:a','pcm_s16le',dest)
        else: shutil.copy2(p,dest)
    meta=probe(dest); audio=next(s for s in meta['streams'] if s.get('codec_type')=='audio')
    tracks.append(dict(id=ident,title=p.stem,filename=p.name,src=f'media/{dest.name}',category=category(p.stem),duration=float(meta['format']['duration']),sampleRate=audio['sample_rate'],format=ext[1:].upper(),peaks=waveform(dest)))
sfx={}
for name in ['clickeffect','notification']:
    dest=OUT/f'{name}.wav'
    ff('-i',ROOT/f'SFX/{name}.wav','-c:a','pcm_s16le',dest)
    sfx[name]=f'media/{dest.name}'
    tracks.append(dict(id=name,title='界面点击音效' if name=='clickeffect' else '启动通知音效',filename=f'SFX/{name}.wav',src=sfx[name],category='sfx',duration=float(probe(dest)['format']['duration']),sampleRate='44100',format='WAV',peaks=waveform(dest)))
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
