import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = [process.env.IVH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => p && fs.existsSync(p));
const ffmpeg = process.env.IVH_FFMPEG || 'ffmpeg';
const run = (cmd,args) => execFileSync(cmd,args,{windowsHide:true,timeout:90000,stdio:['ignore','pipe','pipe']});
const template = fs.readFileSync(path.join(here,'../../ivh-create/modes/standalone/assets/base.html'),'utf8');

test('standalone local media supports source offsets, backward seek, last frame and silent export', {skip:!browser}, async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivh-standalone-'));
  try {
    fs.mkdirSync(path.join(root,'assets'));
    run(ffmpeg,['-v','error','-f','lavfi','-i','color=red:s=320x180:r=30:d=1',
      '-f','lavfi','-i','color=lime:s=320x180:r=30:d=1',
      '-f','lavfi','-i','color=blue:s=320x180:r=30:d=1',
      '-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]','-map','[v]',
      '-c:v','libx264','-pix_fmt','yuv420p',path.join(root,'assets/clip.mp4')]);
    run(ffmpeg,['-v','error','-f','lavfi','-i','color=white:s=20x20','-frames:v','1',path.join(root,'assets/tile.png')]);
    const content='<div class="comp" data-scene data-in="0" data-out="2.5">'+
      '<video src="assets/clip.mp4" data-start="0" data-end="2.5" data-source-in="0.5" data-rate="1" muted preload="auto"></video>'+
      '<img src="assets/tile.png" style="position:absolute;left:0;top:0"></div>';
    const html=template.replace(/1920/g,'320').replace(/1080/g,'180')
      .replace(/(<div id="track">)[\s\S]*?(<\/div><\/div><\/main>)/,'$1'+content+'$2');
    const file=path.join(root,'script.html');fs.writeFileSync(file,html);
    const {captureFrames}=await import('./cdp-shoot.mjs');
    const errors=[];
    const opts={browser,file,times:[.25,1.25,.25,2.5],outDir:root,filePrefix:'frame',size:{w:320,h:180},
      fileNameForTime:(t,i)=>path.join(root,`frame-${i}.png`),log:(a,b,c,d,e)=>{if(e)errors.push(e);}};
    const frames=await captureFrames(opts);
    assert.ok(frames,errors.join('\n'));
    const pixel=(png,x,y)=>[...run(ffmpeg,['-v','error','-i',png,'-vf',`format=rgb24,crop=1:1:${x}:${y}`,'-frames:v','1','-f','rawvideo','-'])];
    const colors=frames.map(f=>pixel(f.png,160,90));
    assert.ok(colors[0][0]>240 && colors[0][1]<10,'source offset starts in red');
    assert.ok(colors[1][1]>240 && colors[1][0]<10,'later timestamp is green');
    assert.deepEqual(fs.readFileSync(frames[0].png),fs.readFileSync(frames[2].png),'backward seek matches');
    assert.ok(colors[3][2]>240 && colors[3][0]<10,'endpoint retains blue final frame');
    assert.deepEqual(pixel(frames[0].png,5,5),[255,255,255],'local image decoded');

    const out=path.join(root,'exports');
    run(process.execPath,[path.join(here,'render.mjs'),file,'--out',out,'--step','0.1','--workers','1']);
    const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path.join(out,'script.mp4')]).toString());
    assert.equal(probe.streams.length,1);assert.equal(probe.streams[0].codec_type,'video');
    assert.equal(probe.streams[0].width,320);assert.equal(probe.streams[0].height,180);
    assert.ok(Math.abs(Number(probe.format.duration)-2.5)<=1/30+.001,'duration within one output frame');
    assert.throws(()=>run(process.execPath,[path.join(here,'shoot.mjs'),file,'--engine','cli','--out',path.join(root,'cli')]));

    run(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=2.5',path.join(root,'assets/voice.wav')]);
    const preview=html.replace("params.get('view') === '1'",'true')
      .replace('<audio id="narration"','<audio src="assets/voice.wav" id="narration"')
      .replace('</body>',`<script>
        const originalSeek=IVH.seekAt;
        IVH.seekAt=async t=>{
          await originalSeek(t);
          const audio=document.getElementById('narration');
          if(Math.abs(audio.currentTime-t)>.01)throw Error('Preview audio seek mismatch');
          if(!audio.paused)throw Error('Seek must pause narration');
        };
      </script></body>`);
    fs.writeFileSync(file,preview);errors.length=0;
    assert.ok(await captureFrames({...opts,times:[0,1.25,.25]}),errors.join('\n'));

    fs.writeFileSync(file,html.replace('</body>','<script>IVH.seekAt = async () => { throw Error("expected media failure"); };</script></body>'));
    errors.length=0;
    assert.equal(await captureFrames({...opts,times:[1]}),null);
    assert.ok(errors.some(e=>e.includes('expected media failure')),'rejected async seek must not produce a frame');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
