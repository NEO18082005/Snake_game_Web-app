
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Direction, Point, Particle, SessionStats } from './types';
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
  const [scale, setScale] = useState(1);
  
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

  // --- Layout Scaling ---
  const updateScale = useCallback(() => {
    const padding = 20;
    const availableWidth = window.innerWidth - padding;
    const availableHeight = window.innerHeight - padding;
    const scaleX = availableWidth / WINDOW_WIDTH;
    const scaleY = availableHeight / WINDOW_HEIGHT;
    setScale(Math.min(scaleX, scaleY, 1));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

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
    const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌ네노ハヒフヘホ마미ムメモヤユヨ라リルレロワヲン";
    
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

  // Input Handling
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

  // AI Advice
  useEffect(() => {
    if (gameState === GameState.PLAYING && score > 0 && score % 50 === 0) {
      getTacticalAdvice(score, currentDifficulty.name).then(setAiAdvice);
    }
  }, [score, gameState, currentDifficulty.name]);

  const spawnFood = useCallback((currentSnake: Point[], currentObstacles: Point[]) => {
    let attempts = 0;
    while (attempts < 200) {
      const potential = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT)
      };
      if (!currentSnake.some(s => s.x === potential.x && s.y === potential.y) &&
          !currentObstacles.some(o => o.x === potential.x && o.y === potential.y)) {
        setFood(potential);
        setIsGoldFood(Math.random() < 0.15);
        return;
      }
      attempts++;
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
      setSessionStats({ duration, growth: snake.length - 3, efficiency: Math.floor((score / (duration || 1)) * 10) });
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
      const updatedScore = score + (isGoldFood ? 50 : 10);
      setScore(updatedScore);
      audioService.playEat();
      setShake(8);
      createExplosion(food.x, food.y, isGoldFood ? COLORS.GOLD : currentTheme.food);
      spawnFood(newSnake, obstacles);
    } else {
      newSnake.pop();
    }
    setSnake(newSnake);
  }, [gameState, snake, nextDirection, food, isGoldFood, obstacles, score, highScore, spawnFood, currentTheme, playStartTime]);

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
            ctx.fillStyle = idx === col.chars.length - 1 ? '#e0fff0' : `rgba(0, 255, 65, ${alpha})`;
            ctx.fillText(char, col.x, charY);
          }
        });
        col.y += col.speed;
        if (col.y > GAME_HEIGHT) {
          col.y = Math.random() * -GAME_HEIGHT;
          col.speed = Math.random() * 4 + 2;
        }
      });
    } else {
      const speed = isBoosted ? currentDifficulty.speed / 2.5 : currentDifficulty.speed;
      setFoodPulse(Math.sin(time / 150) * 4);
      if (time - lastTickRef.current > speed) {
        tick();
        lastTickRef.current = time;
      }

      particlesRef.current = particlesRef.current.map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.2, life: p.life - 0.02 })).filter(p => p.life > 0);
      ctx.clearRect(0, 0, WINDOW_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = currentTheme.bg; ctx.fillRect(0, 0, WINDOW_WIDTH, GAME_HEIGHT);
      ctx.strokeStyle = currentTheme.grid; ctx.lineWidth = 0.5;
      for (let x = 0; x <= WINDOW_WIDTH; x += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_HEIGHT); ctx.stroke(); }
      for (let y = 0; y <= GAME_HEIGHT; y += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WINDOW_WIDTH, y); ctx.stroke(); }

      snakeHistoryRef.current.forEach((oldBody, hIdx) => {
        ctx.globalAlpha = 0.5 * (1 - hIdx / 6);
        ctx.fillStyle = currentTheme.body;
        oldBody.forEach(s => { ctx.beginPath(); ctx.roundRect(s.x * GRID_SIZE + 1, s.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2, 4); ctx.fill(); });
      });
      ctx.globalAlpha = 1.0;

      const foodColor = isGoldFood ? COLORS.GOLD : currentTheme.food;
      ctx.fillStyle = foodColor; ctx.beginPath(); ctx.arc(food.x * GRID_SIZE + GRID_SIZE / 2, food.y * GRID_SIZE + GRID_SIZE / 2, 8 + Math.abs(foodPulse), 0, Math.PI * 2); ctx.fill();

      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? currentTheme.head : currentTheme.body;
        ctx.beginPath(); ctx.roundRect(s.x * GRID_SIZE + 1, s.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2, 4); ctx.fill();
      });

      particlesRef.current.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }); ctx.globalAlpha = 1.0;
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
          if (c <= 1) { setGameState(GameState.PLAYING); setPlayStartTime(Date.now()); audioService.playGo(); clearInterval(timer); return 3; }
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
    <div className="relative w-full h-screen bg-[#05050f] overflow-hidden flex items-center justify-center">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }} className="relative flex flex-col items-center">
        {/* Header UI */}
        <div className="w-[800px] h-[80px] flex-shrink-0 bg-[#05050f] border-b-2 border-[#1a1a3a] flex items-center justify-between px-8 z-20">
          <div className="flex flex-col">
            <span className="text-gray-400 text-[10px] font-mono uppercase">AG~3_SCORE</span>
            <span className="text-2xl font-black text-white">{score.toString().padStart(6, '0')}</span>
          </div>
          <div className="flex flex-col items-center max-w-[400px]">
            <span className="text-[#00ffff] text-[8px] font-mono tracking-widest mb-1 uppercase">SYSTEM STATUS</span>
            <div className="px-3 py-1 bg-[#1a1a3a] border border-[#00ffff]/30 rounded text-cyan-400 font-mono text-[10px] animate-pulse italic text-center truncate">{aiAdvice}</div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-400 text-[10px] font-mono uppercase">AG~3_BEST</span>
            <span className="text-xl font-black text-yellow-500">{highScore.toString().padStart(6, '0')}</span>
          </div>
        </div>

        {/* Game Area */}
        <div className="relative overflow-hidden border-2 border-[#1a1a3a]" style={{ width: WINDOW_WIDTH, height: GAME_HEIGHT, transform: shake > 0 ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)` : 'none' }}>
          <canvas ref={canvasRef} width={WINDOW_WIDTH} height={GAME_HEIGHT} />

          {gameState === GameState.SPLASH && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-50 pointer-events-none">
              <h1 className="text-8xl font-black italic tracking-tighter drop-shadow-[0_0_20px_rgba(0,191,255,0.4)] glitch-text">AG~3</h1>
              <p className="mt-8 text-[#00ff41] font-mono animate-pulse tracking-[0.3em] uppercase">BOOTING NEURAL SYSTEM...</p>
              <p className="mt-20 text-gray-400 text-sm font-mono tracking-widest uppercase">PRESS ANY KEY TO LOGIN</p>
            </div>
          )}

          {gameState === GameState.START && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-40 backdrop-blur-sm">
              <h2 className="text-6xl font-black text-white italic mb-12 tracking-tighter">AG~3 // <span className="text-cyan-400">OS</span></h2>
              <div className="flex flex-col gap-4 w-64">
                <button onClick={() => { audioService.playMenuSelect(); resetGame(); }} className="px-6 py-3 bg-white text-black font-black uppercase tracking-widest hover:bg-cyan-400 transition-all">Launch Mission</button>
                <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="px-6 py-3 border border-white text-white font-bold uppercase tracking-widest">Difficulty</button>
                <button onClick={() => setGameState(GameState.SETTINGS)} className="px-6 py-3 border border-white text-white font-bold uppercase tracking-widest">Themes</button>
              </div>
            </div>
          )}

          {gameState === GameState.LEVEL_SELECT && (
            <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-40">
              <h3 className="text-4xl font-black text-white mb-8 italic uppercase">Neural Frequency</h3>
              <div className="flex flex-col gap-4 w-64">
                {DIFFICULTIES.map((d, i) => (
                  <button key={d.name} onClick={() => { setDifficultyIdx(i); setGameState(GameState.START); }} className={`px-6 py-3 border font-black uppercase ${difficultyIdx === i ? 'bg-white text-black' : 'text-gray-400 border-gray-400'}`} style={{ color: difficultyIdx === i ? '#000' : d.color }}>{d.name}</button>
                ))}
              </div>
              <button onClick={() => setGameState(GameState.START)} className="mt-8 text-white font-mono uppercase text-sm border-b border-white">Back</button>
            </div>
          )}

          {gameState === GameState.SETTINGS && (
            <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-40 p-10">
              <h3 className="text-4xl font-black text-white mb-6 italic uppercase">Aesthetic Override</h3>
              <div className={`mb-10 p-6 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-1 w-72 h-32 relative overflow-hidden ${previewSurge ? 'theme-surge' : ''}`}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-5 h-5 rounded-sm" style={{ backgroundColor: i === 0 ? currentTheme.head : currentTheme.body, transform: `translateY(${Math.sin((uiTime / 200) - (i * 0.6)) * 12}px)`, opacity: 1 - (i * 0.15) }} />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 w-64">
                {Object.values(THEMES).map((t, i) => (
                  <button key={t.name} onClick={() => handleThemeChange(i)} className={`px-6 py-3 border-2 font-black uppercase transition-all duration-300 ${themeIdx === i ? 'bg-white text-black pulse-glow' : 'text-gray-400 border-gray-400'}`} style={{ '--glow-color': t.accent } as any}>{t.name}</button>
                ))}
              </div>
              <button onClick={() => setGameState(GameState.START)} className="mt-8 text-white font-mono uppercase text-sm border-b border-white">Back</button>
            </div>
          )}

          {gameState === GameState.COUNTDOWN && (
            <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
              <span className="text-[180px] font-black text-white italic animate-ping">{countdown}</span>
            </div>
          )}

          {gameState === GameState.GAME_OVER && (
            <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-50 backdrop-blur-md px-10">
                <h2 className="text-7xl font-black text-white italic tracking-tighter mb-8">FLATLINED</h2>
                <div className="grid grid-cols-3 gap-6 bg-black/40 p-6 border border-red-500/20 rounded-lg mb-8 w-full max-w-[400px]">
                    <div className="text-center"><div className="text-red-500/60 text-[10px] uppercase">Time</div><div className="text-xl font-black text-white">{sessionStats.duration}s</div></div>
                    <div className="text-center"><div className="text-red-500/60 text-[10px] uppercase">Size</div><div className="text-xl font-black text-white">+{sessionStats.growth}</div></div>
                    <div className="text-center"><div className="text-red-500/60 text-[10px] uppercase">Eff</div><div className="text-xl font-black text-white">{sessionStats.efficiency}%</div></div>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full max-w-[400px]">
                    <button onClick={() => { audioService.playMenuSelect(); resetGame(); }} className="px-6 py-4 bg-white text-black font-black uppercase tracking-widest">REBOOT</button>
                    <button onClick={() => setGameState(GameState.START)} className="px-6 py-4 border-2 border-white/20 text-white font-black uppercase tracking-widest">LOGOFF</button>
                </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="w-[800px] mt-4 flex justify-between items-center opacity-50 font-mono text-[10px] tracking-widest text-gray-500 uppercase">
          <div>WASD/ARROWS=MOVE • SPACE=BOOST • P=PAUSE</div>
          <div>AG~3 OS v3.1.0-STABLE</div>
        </div>
      </div>
    </div>
  );
};

export default App;
