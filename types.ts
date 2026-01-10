
export enum GameState {
  SPLASH = 'SPLASH',
  START = 'START',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  LEVEL_SELECT = 'LEVEL_SELECT',
  SETTINGS = 'SETTINGS',
  COUNTDOWN = 'COUNTDOWN',
  CONFIRM_RESET = 'CONFIRM_RESET'
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT'
}

export interface Point {
  x: number;
  y: number;
}

export interface Theme {
  name: string;
  bg: string;
  grid: string;
  head: string;
  body: string;
  food: string;
  accent: string;
}

export interface Difficulty {
  name: string;
  speed: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
