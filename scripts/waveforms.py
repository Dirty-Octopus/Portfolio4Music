"""Peak envelopes derived from deployable recordings; never modifies source media."""
from pathlib import Path
import array
import json
import subprocess


def waveform(path, count=1536):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path),
                                   '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'])
    samples = array.array('f', raw)
    peaks = [max((abs(x) for x in samples[i * len(samples) // count:(i + 1) * len(samples) // count]), default=0)
             for i in range(count)]
    top = max(peaks) or 1
    return [round(x / top, 3) for x in peaks]


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    path = root / 'src/media.json'
    manifest = json.loads(path.read_text())
    for track in manifest['tracks']:
        track['peaks'] = waveform(root / 'public' / track['src'])
    path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')))
    print(f"Updated {len(manifest['tracks'])} source-derived waveforms (1536 peaks each).")
