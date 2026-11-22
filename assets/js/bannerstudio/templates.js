import { newDoc, newLayer, uid } from './model.js';

function build(preset, name, scenes, fn) {
  const doc = newDoc(preset);
  doc.name = name;
  doc.scenes = scenes.map((dur, i) => ({ id: uid(), name: 'Scene ' + (i + 1), dur }));
  const S = doc.scenes.map(s => s.id);
  const add = (type, over) => {
    const l = newLayer(doc, type, over);
    doc.layers.push(l);
    return l;
  };
  fn({ doc, S, add, W: doc.w, H: doc.h });
  return doc;
}

const enter = (type, dur = 500, delay = 0, ease = 'outBack') => ({ type, dur, delay, ease });
const exit = (type, dur = 300, ease = 'inCubic') => ({ type, dur, ease });
const mo = (type, amp, cycles, extra) => Object.assign({ type, cycles }, amp == null ? {} : { amp }, extra || {});

export const TEMPLATES = [
  {
    id: 'serverlist-classic',
    name: 'Server list classic',
    desc: '468x60 with a spinning block, title, then your IP and modes.',
    make: () => build('serverlist', 'Server list banner', [2600, 2600], ({ S, add, W, H }) => {
      add('background', { name: 'Aurora', kind: 'aurora', colors: ['#1e6b35', '#2a7fff', '#5b2a9e', '#13a07a'], base: '#0b0a12', vignette: 0.35 });
      add('particles', { name: 'Sparkles', kind: 'sparkle', count: 14, size: 2 });
      add('block', { name: 'Grass block', block: 'grass_block', size: 46, x: 34, y: H / 2, motion: [mo('turn', null, 1)] });
      add('block', { name: 'Diamond ore', block: 'diamond_ore', size: 46, x: W - 34, y: H / 2, motion: [mo('turn', null, 1, { reverse: true })] });
      add('text', { name: 'Title', text: '&6&lMY SERVER', size: 24, x: W / 2, y: H / 2 - 1, scene: S[0], enter: enter('charsPop', 700), exit: exit('fade'), fx: [{ type: 'shine', color: '#ffffff', width: 30, angle: 20, cycles: 1, portion: 0.4, opacity: 0.8 }] });
      add('text', { name: 'IP', text: '&fplay.myserver.net', size: 16, x: W / 2, y: H / 2 - 9, scene: S[1], enter: enter('typewriter', 900, 0, 'linear'), exit: exit('fade'), cursor: true });
      add('text', { name: 'Modes', text: '&aSurvival &8| &bSkyblock &8| &dEvents', size: 8, x: W / 2, y: H / 2 + 12, scene: S[1], enter: enter('slideUp', 500, 300, 'outCubic'), exit: exit('fade') });
      add('border', { name: 'Border', style: 'rgb', width: 2, cycles: 1 });
    }),
  },
  {
    id: 'discord-hero',
    name: 'Discord server hero',
    desc: '960x540 banner with stone bricks, a waving player and falling leaves.',
    make: () => build('discord-banner', 'Discord server banner', [3200, 3200], ({ S, add, W, H }) => {
      add('background', { name: 'Stone bricks', kind: 'texture', tex: 'block/stone_bricks', tileSize: 64, scrollX: 1, darken: 0.55, vignette: 0.6 });
      add('particles', { name: 'Leaves', kind: 'leaves', count: 36, size: 4 });
      add('head', { name: 'Player', username: 'Notch', view: 'body', size: 420, x: W * 0.78, y: H * 0.56, yaw: -25, motion: [mo('wave_arm', 1, 2)] });
      add('text', { name: 'Title', text: '&a&lMY SERVER', size: 96, outline: 6, outlineColor: '#0b1a0b', x: W * 0.38, y: H * 0.36, enter: enter('drop', 700, 0, 'outBounce'), fx: [{ type: 'glow', color: '#55ff55', blur: 24, strength: 1, pulse: 0.4, cycles: 2 }, { type: 'shine', color: '#ffffff', width: 60, angle: 20, cycles: 1, portion: 0.35, opacity: 0.85 }] });
      add('shape', { name: 'IP panel', kind: 'mcpanel', w: 440, h: 72, px: 4, x: W * 0.38, y: H * 0.62, scene: S[0], enter: enter('pop', 450, 300) });
      add('text', { name: 'IP', text: '&8play.myserver.net', size: 32, shadowMode: 'none', x: W * 0.38, y: H * 0.62, scene: S[0], enter: enter('typewriter', 900, 500, 'linear') });
      add('shape', { name: 'Join button', kind: 'mcbutton', w: 440, h: 72, px: 4, x: W * 0.38, y: H * 0.62, scene: S[1], enter: enter('pop', 450, 0) });
      add('text', { name: 'Version', text: '&fJava and Bedrock 1.21', size: 32, x: W * 0.38, y: H * 0.62, scene: S[1], enter: enter('charsUp', 600, 150, 'outCubic') });
      add('text', { name: 'Tagline', text: '&7Survival, but cozier', size: 32, x: W * 0.38, y: H * 0.78, enter: enter('fade', 600, 400) });
      add('border', { name: 'Frame', style: 'pixel', px: 6, color: '#3a3a3a', color2: '#7a7a7a' });
    }),
  },
  {
    id: 'profile-rays',
    name: 'Profile banner rays',
    desc: '680x240 Discord profile banner with spinning sun rays and rainbow name.',
    make: () => build('discord-profile', 'Profile banner', [3000], ({ add, W, H }) => {
      add('background', { name: 'Rays', kind: 'rays', rays: 18, colors: ['#ffb02e', '#ff7a1a'], spin: 1, cx: 0.22, cy: 0.5, vignette: 0.55 });
      add('head', { name: 'Head', view: 'head', size: 170, x: W * 0.22, y: H / 2, yaw: 25, motion: [mo('rock', 25, 1), mo('float', 6, 2)], fx: [{ type: 'shadow', color: '#000000', dx: 6, dy: 8, blur: 0, opacity: 0.35 }] });
      add('text', { name: 'Name', text: 'YourName', size: 56, x: W * 0.64, y: H * 0.44, outline: 4, outlineColor: '#3a1a00', motion: [mo('rainbow', null, 1), mo('wave', 4, 2)] });
      add('text', { name: 'Tag', text: '&fBuilder &8| &fRedstone nerd', size: 24, x: W * 0.64, y: H * 0.68 });
    }),
  },
  {
    id: 'season-launch',
    name: 'Season launch',
    desc: 'Square post: count-up to the new season under a starry sky.',
    make: () => build('square', 'Season launch', [3600], ({ add, W, H }) => {
      add('background', { name: 'Night', kind: 'stars', colors: ['#0a0820', '#2b145a'], count: 160 });
      add('particles', { name: 'Fireflies', kind: 'fireflies', count: 18, size: 3, glow: true });
      add('shape', { name: 'Burst', kind: 'burst', w: 420, h: 420, points: 24, inner: 0.7, color: '#ffd84a', color2: '#ff8a1f', fillMode: 'radial', spin: 1, opacity: 0.25, x: W / 2, y: H * 0.45 });
      add('text', { name: 'Kicker', text: '&eNOW LIVE', size: 32, x: W / 2, y: H * 0.22, enter: enter('fade', 400), motion: [mo('blink', 0.4, 3)] });
      add('text', { name: 'Season', text: 'SEASON 2', size: 80, fillMode: 'gradient', colors: ['#fff1a8', '#ffb02e'], outline: 6, outlineColor: '#3a1a00', extrude: 8, x: W / 2, y: H * 0.45, enter: enter('countUp', 1200, 200, 'outCubic'), fx: [{ type: 'glint', color: '#a35cff', strength: 0.55, cycles: 1, scale: 1 }] });
      add('block', { name: 'Beacon', block: 'beacon', size: 120, x: W / 2, y: H * 0.73, motion: [mo('turn', null, 1), mo('float', 6, 2)], fx: [{ type: 'glow', color: '#6ae7ff', blur: 26, strength: 2, pulse: 0.5, cycles: 2 }] });
      add('text', { name: 'IP', text: '&7play.myserver.net', size: 24, x: W / 2, y: H * 0.92 });
    }),
  },
  {
    id: 'store-sale',
    name: 'Store sale',
    desc: 'Discord banner for a store sale: spinning diamond, confetti, counting discount.',
    make: () => build('discord-banner', 'Store sale', [3000], ({ add, W, H }) => {
      add('background', { name: 'Gradient', kind: 'linear', colors: ['#3b0d6b', '#7a1fa2', '#c2185b'], angle: 135, shift: 1 });
      add('particles', { name: 'Confetti', kind: 'confetti', count: 60, size: 4 });
      add('item', { name: 'Diamond', tex: 'item/diamond', size: 220, x: W * 0.22, y: H / 2, motion: [mo('turn', null, 1), mo('float', 10, 2)], fx: [{ type: 'glow', color: '#5ff7ff', blur: 30, strength: 2, pulse: 0.4, cycles: 2 }] });
      add('shape', { name: 'Tooltip', kind: 'mctooltip', w: 520, h: 300, px: 4, x: W * 0.64, y: H / 2, enter: enter('pop', 500) });
      add('text', { name: 'Sale', text: '50% OFF', size: 96, fillMode: 'gradient', colors: ['#fff6a0', '#ffb02e'], outline: 0, x: W * 0.64, y: H * 0.42, enter: enter('countUp', 1100, 200, 'outCubic'), motion: [mo('heartbeat', 0.06, 2)] });
      add('text', { name: 'Detail', text: '&5&oEverything in the store\n&7This weekend only', size: 32, x: W * 0.64, y: H * 0.62, enter: enter('fade', 500, 600) });
      add('border', { name: 'Lights', style: 'lights', width: 10, cycles: 4 });
    }),
  },
  {
    id: 'nether',
    name: 'Nether event',
    desc: 'Netherrack, embers and a glowing glitch title.',
    make: () => build('discord-profile', 'Nether event', [1600, 1600], ({ S, add, W, H }) => {
      add('background', { name: 'Netherrack', kind: 'texture', tex: 'block/netherrack', tileSize: 48, scrollY: 1, darken: 0.45, vignette: 0.7, tintColor: '#ff3300', tintAmount: 0.15 });
      add('particles', { name: 'Embers', kind: 'embers', count: 50, size: 3, glow: true });
      add('block', { name: 'Magma', block: 'magma_block', size: 120, x: W * 0.14, y: H / 2, yaw: 30, motion: [mo('rock', 20, 1)] });
      add('block', { name: 'Portal', block: 'crying_obsidian', size: 120, x: W * 0.86, y: H / 2, yaw: 60, motion: [mo('rock', 20, 1, { offset: 0.5 })] });
      add('text', { name: 'Title', text: '&c&lNETHER WEEK', size: 48, x: W / 2, y: H * 0.42, scene: S[0], enter: enter('glitch', 500, 0, 'linear'), exit: exit('glitch', 300, 'linear'), fx: [{ type: 'glow', color: '#ff3b00', blur: 20, strength: 2, pulse: 0.5, cycles: 2 }] });
      add('text', { name: 'Detail', text: '&6Double XP &8| &6Boss raid Saturday', size: 24, x: W / 2, y: H * 0.42, scene: S[1], enter: enter('scramble', 600, 0, 'linear'), exit: exit('fade') });
      add('text', { name: 'IP', text: '&7play.myserver.net', size: 16, x: W / 2, y: H * 0.72 });
    }),
  },
  {
    id: 'signature',
    name: 'Forum signature',
    desc: '500x150 with a walking player, XP bar and hearts.',
    make: () => build('sig', 'Forum signature', [2400], ({ add, W, H }) => {
      add('background', { name: 'Dirt', kind: 'texture', tex: 'block/dirt', tileSize: 32, scrollX: 2, darken: 0.5, pixelate: 1 });
      add('head', { name: 'Player', view: 'body', size: 140, x: 60, y: H / 2 + 4, yaw: 70, pitch: 5, motion: [mo('walk', 35, 2)] });
      add('text', { name: 'Name', text: '&e&lYourName', size: 32, align: 'left', x: 280, y: 38 });
      add('shape', { name: 'Hearts', kind: 'healthbar', count: 10, fill: 8.5, px: 2, w: 180, h: 18, x: 200, y: 82, beat: 2 });
      add('shape', { name: 'XP', kind: 'xpbar', w: 182, h: 10, px: 2, fill: 0.6, animateFill: true, x: 200, y: 106 });
      add('text', { name: 'Level', text: '&a42', size: 16, x: 200, y: 124 });
      add('border', { name: 'Border', style: 'panel', px: 3 });
    }),
  },
  {
    id: 'twitch-panel',
    name: 'Twitch panel',
    desc: '320x160 Minecraft button style panel header.',
    make: () => build('twitch', 'Twitch panel', [2000], ({ add, W, H }) => {
      add('background', { name: 'Planks', kind: 'texture', tex: 'block/oak_planks', tileSize: 32, darken: 0.35 });
      add('shape', { name: 'Button', kind: 'mcbutton', w: 260, h: 60, px: 3, hover: true, x: W / 2, y: H / 2 });
      add('text', { name: 'Label', text: 'ABOUT ME', size: 24, x: W / 2, y: H / 2, motion: [mo('jump', 4, 1)] });
      add('particles', { name: 'Sparkle', kind: 'sparkle', count: 8, size: 2 });
    }),
  },
  {
    id: 'youtube-banner',
    name: 'YouTube channel art',
    desc: '2048x1152 with everything important inside the safe area.',
    make: () => build('youtube', 'YouTube banner', [3000], ({ add, W, H }) => {
      add('background', { name: 'Aurora', kind: 'aurora', colors: ['#ff4fa3', '#5b2a9e', '#2a7fff', '#1ed1a0'], base: '#0d0b14' });
      add('particles', { name: 'Cherry', kind: 'cherry', count: 70, size: 5 });
      add('item', { name: 'Pickaxe', tex: 'item/netherite_pickaxe', size: 220, x: W / 2 - 470, y: H / 2, tilt: -20, motion: [mo('sway', 8, 2)] });
      add('item', { name: 'Sword', tex: 'item/netherite_sword', size: 220, x: W / 2 + 470, y: H / 2, tilt: 20, motion: [mo('sway', 8, 2, { offset: 0.5 })] });
      add('text', { name: 'Channel', text: 'YOUR CHANNEL', size: 128, outline: 8, outlineColor: '#1a0b2e', x: W / 2, y: H / 2 - 30, fx: [{ type: 'shine', color: '#ffffff', width: 90, angle: 20, cycles: 1, portion: 0.35, opacity: 0.85 }] });
      add('text', { name: 'Schedule', text: '&fNew builds every Friday', size: 48, x: W / 2, y: H / 2 + 90 });
    }),
  },
  {
    id: 'blank-dark',
    name: 'Blank',
    desc: 'Empty canvas, pick any size.',
    make: (preset = 'discord-banner') => build(preset, 'Untitled banner', [3000], () => {}),
  },
];
