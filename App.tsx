
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Direction, Point, Particle } from './types';
import { 
  GRID_SIZE, UI_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT, 
  GRID_WIDTH, GRID_HEIGHT, THEMES, DIFFICULTIES, COLORS, GAME_HEIGHT 
} from './constants';
import { audioService } from './services/audioService';
import { getTacticalAdvice } from './services/geminiService';

interface MatrixColumn {
  x: number;
  y: number;
  speed: number;
  chars: string[];
}

interface SessionStats {
  duration: number;
  growth: number;
  efficiency: number;
}

const App: React.FC = () => {
  // --- Game State ---
  const [gameState, setGameState] = useState<GameState>(GameState.SPLASH);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficultyIdx, setDifficultyIdx] = useState(1);
  const [themeIdx, setThemeIdx] = useState(0);
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  const [direction, setDirection] = useState<Direction>(Direction.RIGHT);
  const [nextDirection, setNextDirection] = useState<Direction>(Direction.RIGHT);
  const [food, setFood] = useState<Point>({ x: 15, y: 15 });
  const [isGoldFood, setIsGoldFood] = useState(false);
  const [obstacles, setObstacles] = useState<Point[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [aiAdvice, setAiAdvice] = useState("INITIALIZING AG~3 OS...");
  const [shake, setShake] = useState(0);
  const [isBoosted, setIsBoosted] = useState(false);
  const [foodPulse, setFoodPulse] = useState(0);
  const [previewSurge, setPreviewSurge] = useState(false);
  const [uiTime, setUiTime] = useState(0);
  
  // --- Stats Tracking ---
  const [playStartTime, setPlayStartTime] = useState<number>(0);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ duration: 0, growth: 0, efficiency: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const snakeHistoryRef = useRef<Point[][]>([]);
  const matrixRef = useRef<MatrixColumn[]>([]);

  const themes = Object.values(THEMES);
  const currentTheme = themes[themeIdx];
  const currentDifficulty = DIFFICULTIES[difficultyIdx];

  // Drive UI animations independently
  useEffect(() => {
    let frame: number;
    const update = (time: number) => {
      setUiTime(time);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  // --- Initialize Matrix Rain ---
  useEffect(() => {
    const columns = Math.floor(WINDOW_WIDTH / 18);
    const initialMatrix: MatrixColumn[] = [];
    const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ마미ムメモヤユヨラリルレロワヲン";
    
    for (let i = 0; i < columns; i++) {
      initialMatrix.push({
        x: i * 18,
        y: Math.random() * -WINDOW_HEIGHT,
        speed: Math.random() * 4 + 2,
        chars: Array.from({ length: 25 }, () => characters[Math.floor(Math.random() * characters.length)])
      });
    }
    matrixRef.current = initialMatrix;
  }, []);

  // --- Initialization ---
  useEffect(() => {
    const saved = localStorage.getItem('snake_highscore');
    if (saved) setHighScore(parseInt(saved));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === GameState.SPLASH) {
        setGameState(GameState.START);
        audioService.init();
        return;
      }

      const key = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(key) && direction !== Direction.DOWN) setNextDirection(Direction.UP);
      if (['arrowdown', 's'].includes(key) && direction !== Direction.UP) setNextDirection(Direction.DOWN);
      if (['arrowleft', 'a'].includes(key) && direction !== Direction.RIGHT) setNextDirection(Direction.LEFT);
      if (['arrowright', 'd'].includes(key) && direction !== Direction.LEFT) setNextDirection(Direction.RIGHT);

      if (key === 'p' && gameState === GameState.PLAYING) setGameState(GameState.PAUSED);
      if (key === 'p' && gameState === GameState.PAUSED) setGameState(GameState.PLAYING);
      if (key === ' ' && gameState === GameState.PLAYING) setIsBoosted(true);
      if (key === 'escape') setGameState(GameState.START);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setIsBoosted(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, direction]);

  // --- AI Advice ---
  useEffect(() => {
    if (gameState === GameState.PLAYING && score > 0 && score % 50 === 0) {
      getTacticalAdvice(score, currentDifficulty.name).then(setAiAdvice);
    }
  }, [score, gameState, currentDifficulty.name]);

  // --- Helpers ---
  const calculateObstacles = (currentScore: number): Point[] => {
    const newObs: Point[] = [];
    if (currentScore >= 100) {
      const midX = Math.floor(GRID_WIDTH / 2);
      const midY = Math.floor(GRID_HEIGHT / 2);
      for (let i = -4; i <= 4; i++) {
        if (i !== 0) {
          newObs.push({ x: midX + i, y: midY });
          newObs.push({ x: midX, y: midY + i });
        }
      }
    }
    if (currentScore >= 250) {
      for (let i = 0; i < 6; i++) {
        newObs.push({ x: i + 2, y: 2 });
        newObs.push({ x: GRID_WIDTH - i - 3, y: 2 });
        newObs.push({ x: i + 2, y: GRID_HEIGHT - 3 });
        newObs.push({ x: GRID_WIDTH - i - 3, y: GRID_HEIGHT - 3 });
      }
    }
    return newObs;
  };

  const spawnFood = useCallback((currentSnake: Point[], currentObstacles: Point[]) => {
    let attempts = 0;
    const maxRandomAttempts = 200;
    while (attempts < maxRandomAttempts) {
      const potential = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT)
      };
      const onSnake = currentSnake.some(s => s.x === potential.x && s.y === potential.y);
      const onObstacle = currentObstacles.some(o => o.x === potential.x && o.y === potential.y);
      if (!onSnake && !onObstacle) {
        setFood(potential);
        setIsGoldFood(Math.random() < 0.15);
        return;
      }
      attempts++;
    }

    const available: Point[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        const onSnake = currentSnake.some(s => s.x === x && s.y === y);
        const onObstacle = currentObstacles.some(o => o.x === x && o.y === y);
        if (!onSnake && !onObstacle) available.push({ x, y });
      }
    }

    if (available.length > 0) {
      const picked = available[Math.floor(Math.random() * available.length)];
      setFood(picked);
      setIsGoldFood(Math.random() < 0.15);
    }
  }, []);

  const createExplosion = (x: number, y: number, color: string, count: number = 15) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        x: x * GRID_SIZE + GRID_SIZE / 2,
        y: y * GRID_SIZE + GRID_SIZE / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        size: Math.random() * 4 + 2
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];
  };

  const resetGame = () => {
    const initialSnake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    setSnake(initialSnake);
    snakeHistoryRef.current = [];
    setScore(0);
    setDirection(Direction.RIGHT);
    setNextDirection(Direction.RIGHT);
    setGameState(GameState.COUNTDOWN);
    setCountdown(3);
    setObstacles([]);
    setAiAdvice("AG~3 LINK ESTABLISHED. READY.");
    spawnFood(initialSnake, []);
    audioService.playTick();
  };

  const tick = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;
    snakeHistoryRef.current = [JSON.parse(JSON.stringify(snake)), ...snakeHistoryRef.current].slice(0, 6);
    setDirection(nextDirection);
    const head = snake[0];
    const newHead = { ...head };
    if (nextDirection === Direction.UP) newHead.y -= 1;
    if (nextDirection === Direction.DOWN) newHead.y += 1;
    if (nextDirection === Direction.LEFT) newHead.x -= 1;
    if (nextDirection === Direction.RIGHT) newHead.x += 1;
    
    const hitWall = newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT;
    const hitSelf = snake.some(s => s.x === newHead.x && s.y === newHead.y);
    const hitObstacle = obstacles.some(o => o.x === newHead.x && o.y === newHead.y);
    
    if (hitWall || hitSelf || hitObstacle) {
      const duration = Math.floor((Date.now() - playStartTime) / 1000);
      const efficiency = Math.floor((score / (duration || 1)) * 10);
      setSessionStats({
        duration,
        growth: snake.length - 3,
        efficiency
      });
      setGameState(GameState.GAME_OVER);
      audioService.playDeath();
      setShake(30);
      createExplosion(newHead.x, newHead.y, COLORS.RED, 40);
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('snake_highscore', score.toString());
      }
      return;
    }
    
    const newSnake = [newHead, ...snake];
    if (newHead.x === food.x && newHead.y === food.y) {
      const points = isGoldFood ? 50 : 10;
      const updatedScore = score + points;
      const updatedObstacles = calculateObstacles(updatedScore);
      setScore(updatedScore);
      setObstacles(updatedObstacles);
      audioService.playEat();
      setShake(8);
      createExplosion(food.x, food.y, isGoldFood ? COLORS.GOLD : currentTheme.food);
      spawnFood(newSnake, updatedObstacles);
    } else {
      newSnake.pop();
    }
    setSnake(newSnake);
  }, [gameState, snake, nextDirection, food, isGoldFood, obstacles, score, highScore, spawnFood, currentTheme, playStartTime]);

  // --- Animation Loop ---
  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState === GameState.SPLASH) {
      ctx.fillStyle = 'rgba(5, 5, 15, 0.25)';
      ctx.fillRect(0, 0, WINDOW_WIDTH, GAME_HEIGHT);
      ctx.font = '16px JetBrains Mono';
      ctx.textAlign = 'center';
      
      matrixRef.current.forEach(col => {
        col.chars.forEach((char, idx) => {
          const charY = col.y + (idx * 20);
          if (charY > -20 && charY < GAME_HEIGHT + 20) {
            const alpha = idx / col.chars.length;
            if (idx === col.chars.length - 1) {
              ctx.fillStyle = '#e0fff0';
              ctx.shadowBlur = 15;
              ctx.shadowColor = '#00ff41';
            } else {
              ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
              ctx.shadowBlur = 0;
            }
            ctx.fillText(char, col.x, charY);
          }
        });
        col.y += col.speed;
        if (col.y > GAME_HEIGHT) {
          col.y = Math.random() * -GAME_HEIGHT;
          col.speed = Math.random() * 4 + 2;
        }
        if (Math.random() > 0.97) {
          col.chars[Math.floor(Math.random() * col.chars.length)] = 
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ마미ムメモヤユヨラリルレロワヲン"[Math.floor(Math.random() * 80)];
        }
      });
      ctx.shadowBlur = 0;
    } else {
      const speed = isBoosted ? currentDifficulty.speed / 2.5 : currentDifficulty.speed;
      setFoodPulse(Math.sin(time / 150) * 4);
      if (time - lastTickRef.current > speed) {
        tick();
        lastTickRef.current = time;
      }

      particlesRef.current = particlesRef.current
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.2, life: p.life - 0.02 }))
        .filter(p => p.life > 0);

      ctx.clearRect(0, 0, WINDOW_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = currentTheme.bg;
      ctx.fillRect(0, 0, WINDOW_WIDTH, GAME_HEIGHT);

      ctx.strokeStyle = currentTheme.grid;
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= WINDOW_WIDTH; x += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_HEIGHT); ctx.stroke(); }
      for (let y = 0; y <= GAME_HEIGHT; y += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WINDOW_WIDTH, y); ctx.stroke(); }

      ctx.fillStyle = COLORS.OBSTACLE;
      obstacles.forEach(o => {
        ctx.fillRect(o.x * GRID_SIZE + 2, o.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        ctx.strokeStyle = COLORS.WHITE;
        ctx.strokeRect(o.x * GRID_SIZE + 5, o.y * GRID_SIZE + 5, GRID_SIZE - 10, GRID_SIZE - 10);
      });

      const historyCount = snakeHistoryRef.current.length;
      snakeHistoryRef.current.forEach((oldBody, hIdx) => {
        const alpha = 0.5 * (1 - hIdx / historyCount);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = currentTheme.body;
        oldBody.forEach(s => { ctx.beginPath(); ctx.roundRect(s.x * GRID_SIZE + 1, s.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2, 4); ctx.fill(); });
      });
      ctx.globalAlpha = 1.0;

      const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
      const fy = food.y * GRID_SIZE + GRID_SIZE / 2;
      const foodColor = isGoldFood ? COLORS.GOLD : currentTheme.food;
      ctx.shadowBlur = 15; ctx.shadowColor = foodColor; ctx.fillStyle = foodColor;
      ctx.beginPath(); ctx.arc(fx, fy, 8 + Math.abs(foodPulse), 0, Math.PI * 2); ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1.0;
      ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? currentTheme.head : currentTheme.body;
        const rx = s.x * GRID_SIZE + 1, ry = s.y * GRID_SIZE + 1;
        ctx.beginPath(); ctx.roundRect(rx, ry, GRID_SIZE - 2, GRID_SIZE - 2, 4); ctx.fill();
        if (i === 0) { ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(rx + 6, ry + 6, 2, 0, Math.PI * 2); ctx.arc(rx + 14, ry + 6, 2, 0, Math.PI * 2); ctx.fill(); }
      });

      particlesRef.current.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1.0; });
    }

    if (shake > 0) setShake(s => s - 1);
    requestRef.current = requestAnimationFrame(animate);
  }, [tick, currentDifficulty, isBoosted, currentTheme, food, isGoldFood, snake, obstacles, shake, foodPulse, gameState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);

  useEffect(() => {
    if (gameState === GameState.COUNTDOWN) {
      const timer = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { 
            setGameState(GameState.PLAYING); 
            setPlayStartTime(Date.now());
            audioService.playGo(); 
            clearInterval(timer); 
            return 3; 
          }
          audioService.playTick(); return c - 1;
        });
      }, 800);
      return () => clearInterval(timer);
    }
  }, [gameState]);

  const handleThemeChange = (idx: number) => {
    audioService.playMenuSelect();
    setThemeIdx(idx);
    setPreviewSurge(true);
    setTimeout(() => setPreviewSurge(false), 500);
  };

  return (
    <div className="relative w-full h-screen bg-[#05050f] overflow-hidden flex flex-col items-center justify-center">
      {/* UI Header - Fixed height to prevent flex squashing */}
      <div className="w-[800px] h-[80px] flex-shrink-0 bg-[#05050f] border-b-2 border-[#1a1a3a] flex items-center justify-between px-8 z-20">
        <div className="flex flex-col">
          <span className="text-gray-400 text-[10px] font-mono uppercase">AG~3_SCORE</span>
          <span className="text-2xl font-black text-white">{score.toString().padStart(6, '0')}</span>
        </div>
        
        <div className="flex flex-col items-center max-w-[400px]">
          <span className="text-[#00ffff] text-[8px] font-mono tracking-widest mb-1 uppercase">SYSTEM STATUS</span>
          <div className="px-3 py-1 bg-[#1a1a3a] border border-[#00ffff]/30 rounded text-cyan-400 font-mono text-[10px] animate-pulse italic text-center truncate">
            {aiAdvice}
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-gray-400 text-[10px] font-mono uppercase">AG~3_BEST</span>
          <span className="text-xl font-black text-yellow-500">{highScore.toString().padStart(6, '0')}</span>
        </div>
      </div>

      {/* GAME CONTAINER - Content-box with explicit dimensions and no-squash */}
      <div 
        className="relative overflow-hidden border-2 border-[#1a1a3a] flex-shrink-0"
        style={{ 
          boxSizing: 'content-box',
          width: WINDOW_WIDTH, 
          height: GAME_HEIGHT, 
          transform: shake > 0 
            ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)` 
            : 'none' 
        }}
      >
        <canvas 
          ref={canvasRef} 
          width={WINDOW_WIDTH} 
          height={GAME_HEIGHT} 
          style={{ width: WINDOW_WIDTH, height: GAME_HEIGHT, display: 'block' }}
        />

        {/* Screens Overlay */}
        {gameState === GameState.SPLASH && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
            <h1 className="text-8xl font-black text-white italic tracking-tighter animate-bounce glitch-text drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">AG~3</h1>
            <p className="mt-8 text-[#00ff41] font-mono animate-pulse tracking-[0.3em] uppercase drop-shadow-[0_0_8px_rgba(0,255,65,0.5)]">BOOTING NEURAL SYSTEM...</p>
            <p className="mt-20 text-gray-400 text-sm font-mono tracking-widest">PRESS ANY KEY TO LOGIN</p>
          </div>
        )}

        {gameState === GameState.START && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-40 backdrop-blur-sm">
            <h2 className="text-6xl font-black text-white italic mb-12 tracking-tighter">AG~3 // <span className="text-cyan-400">OS</span></h2>
            <div className="flex flex-col gap-4 w-64">
              <button onClick={() => { audioService.playMenuSelect(); resetGame(); }} className="group relative px-6 py-3 bg-white text-black font-black uppercase tracking-widest hover:bg-cyan-400 transition-all duration-300">Launch Mission<div className="absolute top-0 right-0 w-2 h-2 bg-black"></div></button>
              <button onClick={() => { audioService.playMenuSelect(); setGameState(GameState.LEVEL_SELECT); }} className="px-6 py-3 border border-white text-white font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all">Difficulty</button>
              <button onClick={() => { audioService.playMenuSelect(); setGameState(GameState.SETTINGS); }} className="px-6 py-3 border border-white text-white font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all">Themes</button>
            </div>
          </div>
        )}

        {gameState === GameState.LEVEL_SELECT && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-40">
            <h3 className="text-4xl font-black text-white mb-8 italic uppercase tracking-widest">Neural Frequency</h3>
            <div className="flex flex-col gap-4 w-64">
              {DIFFICULTIES.map((d, i) => (
                <button key={d.name} onClick={() => { audioService.playMenuSelect(); setDifficultyIdx(i); setGameState(GameState.START); }} className={`px-6 py-3 border font-black uppercase tracking-widest transition-all ${difficultyIdx === i ? 'bg-white text-black scale-110' : 'text-gray-400 border-gray-400 hover:text-white hover:border-white'}`} style={{ color: difficultyIdx === i ? '#000' : d.color, borderColor: d.color }}>{d.name}</button>
              ))}
            </div>
            <button onClick={() => setGameState(GameState.START)} className="mt-8 text-white font-mono uppercase text-sm border-b border-white">Back</button>
          </div>
        )}

        {gameState === GameState.SETTINGS && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-40 p-10">
            <h3 className="text-4xl font-black text-white mb-6 italic uppercase tracking-widest">Aesthetic Override</h3>
            
            {/* PREVIEW SNAKE AREA */}
            <div className={`mb-10 p-6 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-1 w-72 h-32 relative overflow-hidden ${previewSurge ? 'theme-surge' : ''}`}>
              <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent"></div>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-sm transition-colors duration-300"
                  style={{
                    backgroundColor: i === 0 ? currentTheme.head : currentTheme.body,
                    boxShadow: i === 0 ? `0 0 20px ${currentTheme.head}` : 'none',
                    transform: `translateY(${Math.sin((uiTime / 200) - (i * 0.6)) * 12}px)`,
                    opacity: 1 - (i * 0.15)
                  }}
                />
              ))}
              <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/20 font-mono tracking-widest uppercase">Visual Preview Engine</div>
            </div>

            <div className="grid grid-cols-1 gap-4 w-64">
              {Object.values(THEMES).map((t, i) => (
                <button 
                  key={t.name} 
                  onClick={() => handleThemeChange(i)} 
                  className={`px-6 py-3 border-2 font-black uppercase tracking-widest transition-all duration-300 ${themeIdx === i ? 'bg-white text-black scale-105 pulse-glow' : 'text-gray-400 border-gray-400 hover:text-white hover:border-white bg-transparent'}`} 
                  style={{ 
                    '--glow-color': t.accent,
                    borderColor: themeIdx === i ? 'white' : t.accent,
                    color: themeIdx === i ? 'black' : t.accent,
                  } as any}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <button onClick={() => setGameState(GameState.START)} className="mt-8 text-white font-mono uppercase text-sm border-b border-white hover:text-cyan-400 hover:border-cyan-400 transition-colors">Back to Mission Control</button>
          </div>
        )}

        {gameState === GameState.COUNTDOWN && (
          <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <span className="text-[180px] font-black text-white italic animate-ping">{countdown}</span>
          </div>
        )}

        {gameState === GameState.PAUSED && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-40">
             <h2 className="text-7xl font-black text-cyan-400 italic uppercase animate-pulse tracking-tighter">AG~3 HALTED</h2>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center z-50 backdrop-blur-md px-10">
            <div className="w-full max-w-[600px] border-l-4 border-red-500 pl-8 mb-8">
                <h2 className="text-7xl font-black text-white italic tracking-tighter mb-2">FLATLINED</h2>
                <div className="flex items-center gap-4 text-red-500 font-mono text-xs tracking-widest uppercase mb-6">
                    <span className="animate-pulse">● CRITICAL FAILURE</span>
                    <span className="h-[1px] flex-grow bg-red-500/30"></span>
                    <span>ERROR_0x884</span>
                </div>

                <div className="grid grid-cols-3 gap-6 bg-black/40 p-6 border border-red-500/20 rounded-lg mb-8">
                    <div>
                        <div className="text-red-500/60 text-[10px] font-mono mb-1 uppercase tracking-tighter">Time</div>
                        <div className="text-2xl font-black text-white italic">{sessionStats.duration}s</div>
                    </div>
                    <div>
                        <div className="text-red-500/60 text-[10px] font-mono mb-1 uppercase tracking-tighter">Growth</div>
                        <div className="text-2xl font-black text-white italic">+{sessionStats.growth}</div>
                    </div>
                    <div>
                        <div className="text-red-500/60 text-[10px] font-mono mb-1 uppercase tracking-tighter">Efficiency</div>
                        <div className="text-2xl font-black text-white italic">{sessionStats.efficiency}%</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => { audioService.playMenuSelect(); resetGame(); }} className="px-6 py-4 bg-white text-black font-black uppercase tracking-widest hover:bg-cyan-400 transition-all duration-300">REBOOT</button>
                    <button onClick={() => { audioService.playMenuSelect(); setGameState(GameState.START); }} className="px-6 py-4 border-2 border-white/20 text-white font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all">LOGOFF</button>
                    <button onClick={() => { audioService.playMenuSelect(); setGameState(GameState.LEVEL_SELECT); }} className="px-6 py-4 border border-white/10 text-gray-400 font-bold uppercase tracking-widest hover:text-white transition-all text-xs">FREQUENCY</button>
                    <button onClick={() => { audioService.playMenuSelect(); setGameState(GameState.SETTINGS); }} className="px-6 py-4 border border-white/10 text-gray-400 font-bold uppercase tracking-widest hover:text-white transition-all text-xs">AESTHETIC</button>
                </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-[800px] mt-4 flex justify-between items-center opacity-50 font-mono text-[10px] tracking-widest text-gray-500 uppercase">
        <div>WASD/ARROWS=MOVE • SPACE=BOOST • P=PAUSE</div>
        <div>AG~3 OS v3.1.0-STABLE</div>
      </div>
    </div>
  );
};

export default App;
