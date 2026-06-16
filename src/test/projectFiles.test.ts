import { describe, it, expect } from 'vitest';
import { unapprovedScenes, dirOfPath } from '../services/projectFiles';
import { makeProject, scene, text } from './fixtures';
import type { Block } from '../types';

const imgGen = (id: string, src: string): Block => ({ id, type: 'image-gen', src } as Block);
const vidGen = (id: string, src: string): Block => ({ id, type: 'video-gen', src } as Block);

describe('unapprovedScenes', () => {
  it('flags scenes whose image-gen/video-gen src still points at history/', () => {
    const p = makeProject([
      scene('s1', 'Clean', [text('t', 'hi'), imgGen('i', 'assets/pic.png')]),
      scene('s2', 'DirtyImg', [imgGen('i2', 'history/raw.png')]),
      scene('s3', 'DirtyVid', [vidGen('v', 'history/clip.mp4')]),
    ]);
    expect(unapprovedScenes(p)).toEqual(['DirtyImg', 'DirtyVid']);
  });

  it('returns nothing when all generated media is approved', () => {
    const p = makeProject([scene('s1', 'OK', [imgGen('i', 'assets/x.png')])]);
    expect(unapprovedScenes(p)).toEqual([]);
  });

  it('ignores non-media blocks', () => {
    const p = makeProject([scene('s1', 'Text', [text('t', 'history/looks-like-a-path')])]);
    expect(unapprovedScenes(p)).toEqual([]);
  });
});

describe('dirOfPath', () => {
  it('returns the directory for unix and windows paths', () => {
    expect(dirOfPath('/home/user/story.html')).toBe('/home/user');
    expect(dirOfPath('C:\\proj\\out\\story.html')).toBe('C:\\proj\\out');
  });

  it('falls back to "." when there is no separator', () => {
    expect(dirOfPath('story.html')).toBe('.');
  });
});
