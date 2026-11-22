import text from './text.js';
import { block, item, head } from './mc.js';
import { image, shape } from './shapes.js';
import { background, particles, border } from './fill.js';

export const TYPES = { text, block, item, head, image, shape, background, particles, border };

export const ADD_MENU = [
  ['text', 'Text', 'Title, IP, tagline, Minecraft color codes'],
  ['block', '3D block', 'Any Minecraft block, spinning or posed'],
  ['item', 'Item', 'Swords, tools, food, any item, flat or 3D'],
  ['head', 'Player', 'Skin head, bust or full body by username or upload'],
  ['image', 'Image', 'Your logo or any picture'],
  ['shape', 'Shape', 'Panels, buttons, ribbons, stars, badges'],
  ['background', 'Background', 'Gradients, block textures, aurora, rays, stars'],
  ['particles', 'Particles', 'Leaves, snow, sparkles, XP, hearts, embers'],
  ['border', 'Border', 'Solid, RGB, marching, glow, pixel frame'],
];
