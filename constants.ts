
import { Theme, Difficulty } from './types';

export const GRID_SIZE = 20;
export const UI_HEIGHT = 80;
export const WINDOW_WIDTH = 800;
export const WINDOW_HEIGHT = 680; // UI_HEIGHT (80) + GAME_HEIGHT (600)
export const GAME_WIDTH = WINDOW_WIDTH;
export const GAME_HEIGHT = 600; 
export const GRID_WIDTH = Math.floor(GAME_WIDTH / GRID_SIZE); // 40
export const GRID_HEIGHT = Math.floor(GAME_HEIGHT / GRID_SIZE); // 30

export const THEMES: Record<string, Theme> = {
  Modern: {
    name: 'Modern',
    bg: '#0a0a14',
    grid: '#232337',
    head: '#00ff7f',
    body: '#009650',
    food: '#ff3c3c',
    accent: '#00ff7f'
  },
  Neon: {
    name: 'Neon',
    bg: '#05050f',
    grid: '#282850',
    head: '#ff00ff',
    body: '#00ffff',
    food: '#ff3232',
    accent: '#00ffff'
  },
  Classic: {
    name: 'Classic',
    bg: '#9bbc0f',
    grid: '#8bac0f',
    head: '#0f380f',
    body: '#306230',
    food: '#ff4500',
    accent: '#306230'
  }
};

export const DIFFICULTIES: Difficulty[] = [
  { name: 'EASY', speed: 150, color: '#00ffff' },
  { name: 'MEDIUM', speed: 100, color: '#ffd700' },
  { name: 'HARD', speed: 60, color: '#ff2828' }
];

export const COLORS = {
  UI_BG: '#05050f',
  GOLD: '#ffd700',
  WHITE: '#fafafa',
  RED: '#ff2828',
  CYAN: '#00ffff',
  LAMBO_CYAN: '#00bfff',
  OBSTACLE: '#646478'
};
