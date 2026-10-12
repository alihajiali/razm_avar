import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIALOGUES, PLAYER_NAMES } from '../dialogues.mjs';
import { BattleVoice } from '../voice.mjs';
assert.equal(DIALOGUES.length, 53);
assert.equal(new Set(DIALOGUES.map((x) => x.text)).size, 53);
for (const line of DIALOGUES) {
  assert.match(line.text, /[آ-ی]/);
  const bytes = fs.readFileSync(new URL(`../assets/voices/${line.id}.mp3`, import.meta.url));
  assert.ok(bytes.length > 1000, line.id + ' has bundled audio');
}
assert.equal(new Set(PLAYER_NAMES).size, 24);
let at = 0;
const clips = [];
class AudioStub {
  constructor(src) {
    this.src = src;
    this.paused = true;
    clips.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
const subtitle = { textContent: '', hidden: true },
  voice = new BattleVoice(subtitle, { AudioClass: AudioStub, now: () => at });
assert.ok(voice.play('hurt', 'آرش', { priority: 1, variant: 'آخ تیر خوردم!' }));
assert.match(subtitle.textContent, /آرش: آخ تیر خوردم/);
assert.equal(clips.length, 1);
assert.equal(voice.play('reload'), false, 'No chatter over damage');
assert.ok(voice.play('death', 'آرش', { priority: 3, variant: 'چرا منو کشتی؟' }));
assert.ok(clips[0].paused, 'Death replaces damage');
voice.setMuted(true);
assert.ok(clips[1].paused);
at += 4000;
assert.ok(voice.play('respawn'));
assert.equal(clips.length, 2, 'Mute blocks audio, keeps subtitles');
voice.setMuted(false);
voice.setEnabled(false);
at += 4000;
voice.play('start');
assert.equal(clips.length, 2, 'Voice toggle blocks audio');
voice.setEnabled(true);
at += 4000;
voice.play('start');
assert.equal(clips.length, 3);
voice.stop();
assert.ok(subtitle.hidden);
assert.ok(clips[2].paused);
console.log(
  'PASS: 53 distinct Persian clips, Iranian names, priorities, cooldown, replacement, mute, subtitles and dialogue toggle',
);
