/**
 * Republic — HTML5 Game Generators
 * Each function returns a complete, self-contained HTML file (no external deps)
 * that can be played directly in any browser.
 * Written to republic-output/games/ by the autonomous production system.
 */

export interface GeneratedGame {
  filename: string;
  html: string;
  title: string;
  category: "puzzle" | "board" | "arcade" | "card" | "strategy" | "3d";
}

// ─── Shared helpers ──────────────────────────────────────────────

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#e0e0ff;font-family:'Segoe UI',sans-serif;
  display:flex;flex-direction:column;align-items:center;min-height:100vh;}
h1{margin:16px 0 8px;color:#7df;font-size:1.4em;letter-spacing:2px}
canvas{border:2px solid #334;border-radius:8px;cursor:pointer;
  box-shadow:0 0 32px #007aff44}
#info{margin:8px;color:#89a;font-size:.85em;text-align:center}
button{background:#1a2a4a;color:#7df;border:1px solid #7df4;
  padding:8px 18px;border-radius:6px;cursor:pointer;margin:4px;font-size:.9em}
button:hover{background:#2a3a6a}
`;

function html(title: string, body: string, script: string): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${BASE_CSS}</style></head>
<body><h1>${title}</h1>${body}
<script>
(function(){
${script}
})();
</script></body></html>`;
}

// ─── CHESS ───────────────────────────────────────────────────────

export function generateChess(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Chess`;
  const body = `<canvas id="c" width="480" height="480"></canvas>
<div id="info">Click piece then click destination · You play White</div>
<button onclick="restart()">New Game</button>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const SZ=60,FILES='abcdefgh';
let board,turn,sel,check;
const pieces={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
function init(){
  board=Array.from({length:8},()=>Array(8).fill(null));
  const back='RNBQKBNR';
  for(let i=0;i<8;i++){
    board[0][i]='b'+back[i].toLowerCase()+'_black';
    board[1][i]='p_black';
    board[6][i]='p_white';
    board[7][i]='b'+back[i].toLowerCase()+'_white';
  }
  board[0]=['r','n','b','q','k','b','n','r'].map(p=>({t:p,c:'b'}));
  board[1]=Array(8).fill(0).map(()=>({t:'p',c:'b'}));
  board[6]=Array(8).fill(0).map(()=>({t:'p',c:'w'}));
  board[7]=['r','n','b','q','k','b','n','r'].map(p=>({t:p,c:'w'}));
  turn='w';sel=null;
  draw();
}
function draw(){
  for(let r=0;r<8;r++)for(let f=0;f<8;f++){
    ctx.fillStyle=(r+f)%2===0?'#f0d9b5':'#b58863';
    if(sel&&sel[0]===r&&sel[1]===f)ctx.fillStyle='#7fc97f';
    ctx.fillRect(f*SZ,r*SZ,SZ,SZ);
    const p=board[r][f];
    if(p){
      ctx.font=(SZ-8)+'px serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle=p.c==='w'?'#fff':'#111';
      ctx.strokeStyle=p.c==='w'?'#333':'#eee';
      ctx.lineWidth=1;
      ctx.strokeText(pieces[p.c==='w'?p.t.toUpperCase():p.t],f*SZ+SZ/2,r*SZ+SZ/2);
      ctx.fillText(pieces[p.c==='w'?p.t.toUpperCase():p.t],f*SZ+SZ/2,r*SZ+SZ/2);
    }
  }
  document.getElementById('info').textContent=turn==='w'?'Your turn (White)':'AI thinking...';
}
cv.addEventListener('click',e=>{
  if(turn!=='w')return;
  const f=Math.floor(e.offsetX/SZ),r=Math.floor(e.offsetY/SZ);
  if(sel){
    const [sr,sf]=sel;
    if(isLegal(sr,sf,r,f)){move(sr,sf,r,f);sel=null;draw();turn='b';setTimeout(aiMove,400);}
    else{sel=(board[r][f]&&board[r][f].c==='w')?[r,f]:null;draw();}
  }else if(board[r][f]&&board[r][f].c==='w'){sel=[r,f];draw();}
});
function isLegal(r1,f1,r2,f2){
  if(r1===r2&&f1===f2)return false;
  const p=board[r1][f1];if(!p)return false;
  const t=board[r2][f2];if(t&&t.c===p.c)return false;
  return true; // simplified — accepts any move to empty/enemy square
}
function move(r1,f1,r2,f2){
  board[r2][f2]=board[r1][f1];board[r1][f1]=null;
  // pawn promotion
  if(board[r2][f2].t==='p'&&r2===0)board[r2][f2].t='q';
  if(board[r2][f2].t==='p'&&r2===7)board[r2][f2].t='q';
}
function aiMove(){
  // pick a random legal capture or move
  const moves=[];
  for(let r=0;r<8;r++)for(let f=0;f<8;f++){
    if(board[r][f]&&board[r][f].c==='b'){
      for(let r2=0;r2<8;r2++)for(let f2=0;f2<8;f2++){
        if(isLegal(r,f,r2,f2))moves.push([r,f,r2,f2]);
      }
    }
  }
  if(moves.length){
    // prefer captures
    const caps=moves.filter(m=>board[m[2]][m[3]]);
    const m=caps.length?caps[Math.floor(Math.random()*caps.length)]:moves[Math.floor(Math.random()*moves.length)];
    move(m[0],m[1],m[2],m[3]);
  }
  turn='w';draw();
}
function restart(){init();}
init();
`;
  return {
    filename: `chess_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "board",
  };
}

// ─── SUDOKU ──────────────────────────────────────────────────────

export function generateSudoku(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Sudoku`;
  const body = `<canvas id="c" width="450" height="450"></canvas>
<div id="info">Click a cell, then press 1-9 to fill</div>
<button onclick="newGame()">New Puzzle</button>
<button onclick="solve()">Solve</button>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const N=9,SZ=50;
let grid,given,sel;
function newGame(){
  given=Array.from({length:N},()=>Array(N).fill(0));
  // seed a valid partial board
  const base=[[5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],
    [8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],
    [0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]];
  given=base.map(r=>[...r]);
  grid=given.map(r=>[...r]);sel=null;draw();
}
function draw(){
  ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,450,450);
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    const x=c*SZ,y=r*SZ;
    ctx.fillStyle=sel&&sel[0]===r&&sel[1]===c?'#1a3a5a':'#0e1a2e';
    ctx.fillRect(x+1,y+1,SZ-2,SZ-2);
    if(grid[r][c]){
      ctx.font=given[r][c]?'bold 28px sans-serif':'28px sans-serif';
      ctx.fillStyle=given[r][c]?'#7df':'#fa8';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(grid[r][c],x+SZ/2,y+SZ/2);
    }
  }
  // grid lines
  ctx.strokeStyle='#334';ctx.lineWidth=1;
  for(let i=0;i<=N;i++){
    ctx.lineWidth=i%3===0?2.5:0.5;
    ctx.strokeStyle=i%3===0?'#7df4':'#334';
    ctx.beginPath();ctx.moveTo(i*SZ,0);ctx.lineTo(i*SZ,450);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*SZ);ctx.lineTo(450,i*SZ);ctx.stroke();
  }
}
cv.addEventListener('click',e=>{
  sel=[Math.floor(e.offsetY/SZ),Math.floor(e.offsetX/SZ)];draw();
});
document.addEventListener('keydown',e=>{
  if(!sel)return;
  const[r,c]=sel;
  if(given[r][c])return;
  const n=parseInt(e.key);
  if(n>=1&&n<=9){grid[r][c]=n;}
  else if(e.key==='Backspace'||e.key==='Delete'){grid[r][c]=0;}
  draw();
});
function solve(){
  // backtracking solver
  const g=grid.map(r=>[...r]);
  function ok(g,r,c,n){
    for(let i=0;i<9;i++){if(g[r][i]===n||g[i][c]===n)return false;}
    const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){if(g[br+i][bc+j]===n)return false;}
    return true;
  }
  function bt(g){
    for(let r=0;r<9;r++)for(let c=0;c<9;c++){
      if(!g[r][c]){
        for(let n=1;n<=9;n++){if(ok(g,r,c,n)){g[r][c]=n;if(bt(g))return true;g[r][c]=0;}}
        return false;
      }
    }return true;
  }
  bt(g);grid=g;draw();
}
newGame();
`;
  return {
    filename: `sudoku_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "puzzle",
  };
}

// ─── SNAKE ───────────────────────────────────────────────────────

export function generateSnake(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Snake`;
  const body = `<canvas id="c" width="400" height="400"></canvas>
<div id="info">Arrow keys to move · Eat 🍎 to grow</div>
<div id="score">Score: 0</div>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const G=20,SZ=400/G;
let snake,dir,food,score,alive,loop;
function start(){
  snake=[[10,10],[10,9],[10,8]];dir=[1,0];
  food=randomFood();score=0;alive=true;
  clearInterval(loop);loop=setInterval(tick,120);
}
function randomFood(){
  return[Math.floor(Math.random()*G),Math.floor(Math.random()*G)];
}
function tick(){
  if(!alive)return;
  const head=[snake[0][0]+dir[0],snake[0][1]+dir[1]];
  if(head[0]<0||head[0]>=G||head[1]<0||head[1]>=G||
     snake.some(s=>s[0]===head[0]&&s[1]===head[1])){
    alive=false;
    ctx.fillStyle='#f005';ctx.fillRect(0,0,400,400);
    ctx.fillStyle='#fff';ctx.font='bold 32px sans-serif';ctx.textAlign='center';
    ctx.fillText('Game Over! Score: '+score,200,200);
    ctx.fillText('Click to restart',200,240);return;
  }
  snake.unshift(head);
  if(head[0]===food[0]&&head[1]===food[1]){
    score++;document.getElementById('score').textContent='Score: '+score;
    food=randomFood();
  }else{snake.pop();}
  draw();
}
function draw(){
  ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,400,400);
  // grid
  ctx.strokeStyle='#111b';
  for(let i=0;i<G;i++){
    ctx.beginPath();ctx.moveTo(i*SZ,0);ctx.lineTo(i*SZ,400);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*SZ);ctx.lineTo(400,i*SZ);ctx.stroke();
  }
  // snake
  snake.forEach((s,i)=>{
    const t=1-i/snake.length;
    ctx.fillStyle=\`hsl(\${120+i*2},80%,\${40+t*20}%)\`;
    ctx.beginPath();
    ctx.roundRect(s[1]*SZ+1,s[0]*SZ+1,SZ-2,SZ-2,4);
    ctx.fill();
  });
  // food
  ctx.font=\`\${SZ}px serif\`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('🍎',food[1]*SZ+SZ/2,food[0]*SZ+SZ/2);
}
document.addEventListener('keydown',e=>{
  const m={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
  if(m[e.key]&&!(dir[0]===-m[e.key][0]&&dir[1]===-m[e.key][1])){
    dir=m[e.key];e.preventDefault();
  }
});
cv.addEventListener('click',()=>{if(!alive)start();});
start();
`;
  return {
    filename: `snake_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "arcade",
  };
}

// ─── 2048 ───────────────────────────────────────────────────────

export function generate2048(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s 2048`;
  const body = `<canvas id="c" width="400" height="400"></canvas>
<div id="info">Arrow keys / swipe to merge tiles</div>
<div id="score">Score: 0</div>
<button onclick="init()">New Game</button>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const COLS=['#cdc1b4','#eee4da','#ede0c8','#f2b179','#f59563','#f67c5f',
  '#f65e3b','#edcf72','#edcc61','#edc850','#edc53f','#edc22e','#3c3a32'];
let grid,score;
function init(){
  grid=Array.from({length:4},()=>Array(4).fill(0));score=0;
  addTile();addTile();draw();
}
function addTile(){
  const empty=[];
  grid.forEach((r,i)=>r.forEach((v,j)=>{if(!v)empty.push([i,j]);}));
  if(!empty.length)return;
  const[i,j]=empty[Math.floor(Math.random()*empty.length)];
  grid[i][j]=Math.random()<0.9?2:4;
}
function draw(){
  ctx.fillStyle='#bbada0';ctx.fillRect(0,0,400,400);
  const SZ=88,PAD=8,OFF=8;
  grid.forEach((row,r)=>row.forEach((v,c)=>{
    const x=OFF+c*(SZ+PAD),y=OFF+r*(SZ+PAD);
    const ci=v?Math.min(Math.log2(v),COLS.length-1):0;
    ctx.fillStyle=COLS[ci];
    ctx.beginPath();ctx.roundRect(x,y,SZ,SZ,6);ctx.fill();
    if(v){
      ctx.fillStyle=v<=4?'#776e65':'#f9f6f2';
      ctx.font=\`bold \${v<100?36:v<1000?28:22}px sans-serif\`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(v,x+SZ/2,y+SZ/2);
    }
  }));
  document.getElementById('score').textContent='Score: '+score;
}
function slide(row){
  let r=row.filter(v=>v);
  for(let i=0;i<r.length-1;i++){
    if(r[i]===r[i+1]){r[i]*=2;score+=r[i];r[i+1]=0;}
  }
  r=r.filter(v=>v);
  while(r.length<4)r.push(0);
  return r;
}
function move(dir){
  let changed=false;
  if(dir==='l'||dir==='r'){
    grid=grid.map(row=>{
      const s=dir==='r'?slide([...row].reverse()).reverse():slide(row);
      if(s.join()!==row.join())changed=true;return s;
    });
  }else{
    for(let c=0;c<4;c++){
      let col=grid.map(r=>r[c]);
      const s=dir==='d'?slide([...col].reverse()).reverse():slide(col);
      s.forEach((v,r)=>{if(grid[r][c]!==v)changed=true;grid[r][c]=v;});
    }
  }
  if(changed){addTile();draw();}
}
document.addEventListener('keydown',e=>{
  const m={ArrowLeft:'l',ArrowRight:'r',ArrowUp:'u',ArrowDown:'d'};
  if(m[e.key]){move(m[e.key]);e.preventDefault();}
});
let tx;
cv.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;},{ passive:true });
cv.addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-tx;
  move(Math.abs(dx)>30?(dx>0?'r':'l'):(e.changedTouches[0].clientY<tx?'u':'d'));
});
init();
`;
  return {
    filename: `t2048_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "puzzle",
  };
}

// ─── MINESWEEPER ────────────────────────────────────────────────

export function generateMinesweeper(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Minesweeper`;
  const body = `<canvas id="c" width="420" height="420"></canvas>
<div id="info">Left click: reveal · Right click: flag</div>
<div id="score">💣 Mines: 40</div>
<button onclick="init()">New Game</button>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const ROWS=14,COLS=14,MINES=30,SZ=30;
let grid,revealed,flagged,gameOver;
function init(){
  grid=Array.from({length:ROWS},()=>Array(COLS).fill(0));
  revealed=Array.from({length:ROWS},()=>Array(COLS).fill(false));
  flagged=Array.from({length:ROWS},()=>Array(COLS).fill(false));
  gameOver=false;
  // place mines
  let m=0;while(m<MINES){
    const r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);
    if(grid[r][c]!==-1){grid[r][c]=-1;m++;}
  }
  // count neighbors
  const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(grid[r][c]===-1)continue;
    grid[r][c]=dirs.reduce((n,[dr,dc])=>{
      const nr=r+dr,nc=c+dc;
      return n+(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&grid[nr][nc]===-1?1:0);
    },0);
  }
  draw();
}
const NUM_COLORS=['','#0000ff','#008000','#ff0000','#00008b','#8b0000','#008b8b','#000','#808080'];
function draw(){
  ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,COLS*SZ,ROWS*SZ);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const x=c*SZ,y=r*SZ;
    if(revealed[r][c]){
      ctx.fillStyle='#2a2a3e';ctx.fillRect(x+1,y+1,SZ-2,SZ-2);
      if(grid[r][c]===-1){
        ctx.font=\`\${SZ-6}px serif\`;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('💣',x+SZ/2,y+SZ/2);
      }else if(grid[r][c]>0){
        ctx.font=\`bold \${SZ-10}px sans-serif\`;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle=NUM_COLORS[grid[r][c]]||'#fff';
        ctx.fillText(grid[r][c],x+SZ/2,y+SZ/2);
      }
    }else{
      ctx.fillStyle=flagged[r][c]?'#3a1a1a':'#252540';
      ctx.beginPath();ctx.roundRect(x+1,y+1,SZ-2,SZ-2,3);ctx.fill();
      if(flagged[r][c]){
        ctx.font=\`\${SZ-8}px serif\`;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('🚩',x+SZ/2,y+SZ/2);
      }
    }
  }
  ctx.strokeStyle='#334';ctx.lineWidth=0.5;
  for(let i=0;i<=COLS;i++){ctx.beginPath();ctx.moveTo(i*SZ,0);ctx.lineTo(i*SZ,ROWS*SZ);ctx.stroke();}
  for(let i=0;i<=ROWS;i++){ctx.beginPath();ctx.moveTo(0,i*SZ);ctx.lineTo(COLS*SZ,i*SZ);ctx.stroke();}
}
function reveal(r,c){
  if(r<0||r>=ROWS||c<0||c>=COLS||revealed[r][c]||flagged[r][c])return;
  revealed[r][c]=true;
  if(grid[r][c]===0){
    [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc])=>reveal(r+dr,c+dc));
  }
}
cv.addEventListener('click',e=>{
  if(gameOver)return;
  const c=Math.floor(e.offsetX/SZ),r=Math.floor(e.offsetY/SZ);
  if(flagged[r][c])return;
  if(grid[r][c]===-1){
    for(let i=0;i<ROWS;i++)for(let j=0;j<COLS;j++){if(grid[i][j]===-1)revealed[i][j]=true;}
    gameOver=true;draw();
    document.getElementById('info').textContent='💥 BOOM! Click New Game';return;
  }
  reveal(r,c);
  draw();
});
cv.addEventListener('contextmenu',e=>{
  e.preventDefault();if(gameOver)return;
  const c=Math.floor(e.offsetX/SZ),r=Math.floor(e.offsetY/SZ);
  if(!revealed[r][c])flagged[r][c]=!flagged[r][c];
  draw();
});
init();
`;
  return {
    filename: `minesweeper_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "puzzle",
  };
}

// ─── BREAKOUT ───────────────────────────────────────────────────

export function generateBreakout(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Breakout`;
  const body = `<canvas id="c" width="480" height="480"></canvas>
<div id="info">Move mouse to control paddle · Click to start</div>
<div id="score">Score: 0 | Lives: 3</div>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const W=480,H=480;
let ball,paddle,bricks,score,lives,running,raf;
function init(){
  paddle={x:190,w:100,y:450,h:12};
  ball={x:240,y:420,vx:3,vy:-4,r:8};
  score=0;lives=3;
  bricks=[];
  const COLS=8,ROWS=5,BW=52,BH=18,PAD=4,OX=8,OY=50;
  const colors=['#ff4466','#ff8844','#ffcc22','#44ff88','#2288ff','#aa44ff'];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    bricks.push({x:OX+c*(BW+PAD),y:OY+r*(BH+PAD),w:BW,h:BH,alive:true,col:colors[r%colors.length]});
  }
  running=false;
  draw();
}
cv.addEventListener('mousemove',e=>{
  const rect=cv.getBoundingClientRect();
  paddle.x=Math.max(0,Math.min(W-paddle.w,(e.clientX-rect.left)-paddle.w/2));
  if(!running)ball.x=paddle.x+paddle.w/2;
});
cv.addEventListener('click',()=>{if(!running){running=true;loop();}});
function loop(){
  if(!running)return;
  raf=requestAnimationFrame(loop);update();draw();
}
function update(){
  ball.x+=ball.vx;ball.y+=ball.vy;
  if(ball.x-ball.r<0||ball.x+ball.r>W)ball.vx*=-1;
  if(ball.y-ball.r<0)ball.vy*=-1;
  if(ball.y+ball.r>H){lives--;document.getElementById('score').textContent=\`Score: \${score} | Lives: \${lives}\`;
    if(lives<=0){running=false;ctx.fillStyle='#f005';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#fff';ctx.font='bold 32px sans-serif';ctx.textAlign='center';
      ctx.fillText('Game Over',W/2,H/2);return;}
    ball.x=paddle.x+paddle.w/2;ball.y=paddle.y-ball.r-2;ball.vy=-Math.abs(ball.vy);
  }
  // paddle
  if(ball.y+ball.r>=paddle.y&&ball.x>=paddle.x&&ball.x<=paddle.x+paddle.w){
    ball.vy=-Math.abs(ball.vy);
    ball.vx=((ball.x-(paddle.x+paddle.w/2))/(paddle.w/2))*5;
  }
  // bricks
  bricks.forEach(b=>{
    if(!b.alive)return;
    if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){
      b.alive=false;score+=10;ball.vy*=-1;
      document.getElementById('score').textContent=\`Score: \${score} | Lives: \${lives}\`;
    }
  });
  if(bricks.every(b=>!b.alive)){running=false;
    ctx.fillStyle='#0f05';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff';ctx.font='bold 32px sans-serif';ctx.textAlign='center';
    ctx.fillText('You Win! Score: '+score,W/2,H/2);
  }
}
function draw(){
  ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,W,H);
  bricks.forEach(b=>{if(b.alive){
    ctx.fillStyle=b.col;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,3);ctx.fill();
    ctx.strokeStyle='#0006';ctx.lineWidth=1;ctx.stroke();
  }});
  // paddle
  const g=ctx.createLinearGradient(paddle.x,paddle.y,paddle.x,paddle.y+paddle.h);
  g.addColorStop(0,'#5af');g.addColorStop(1,'#158');
  ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(paddle.x,paddle.y,paddle.w,paddle.h,6);ctx.fill();
  // ball
  const bg=ctx.createRadialGradient(ball.x-2,ball.y-2,1,ball.x,ball.y,ball.r);
  bg.addColorStop(0,'#fff');bg.addColorStop(1,'#5af');
  ctx.fillStyle=bg;ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();
  // glow
  ctx.shadowColor='#5af';ctx.shadowBlur=16;ctx.fill();ctx.shadowBlur=0;
}
init();
`;
  return {
    filename: `breakout_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "arcade",
  };
}

// ─── SPACE SHOOTER ──────────────────────────────────────────────

export function generateSpaceShooter(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Space Shooter`;
  const body = `<canvas id="c" width="480" height="600"></canvas>
<div id="info">Arrow keys to move · Space to shoot</div>
<div id="score">Score: 0 | Lives: ❤️❤️❤️</div>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const W=480,H=600;
let ship,bullets,enemies,stars,score,lives,keys,gameOver,tick;
function init(){
  ship={x:220,y:520,w:36,h:40,invincible:0};
  bullets=[];enemies=[];score=0;lives=3;gameOver=false;tick=0;
  keys={};
  stars=Array.from({length:80},()=>({x:Math.random()*W,y:Math.random()*H,s:Math.random()*2+0.5,v:Math.random()*1.5+0.5}));
  requestAnimationFrame(loop);
}
document.addEventListener('keydown',e=>{keys[e.code]=true;e.preventDefault();});
document.addEventListener('keyup',e=>{keys[e.code]=false;});
let lastShot=0;
function loop(t){
  if(gameOver)return;
  requestAnimationFrame(loop);
  tick++;
  // move ship
  if(keys['ArrowLeft']&&ship.x>0)ship.x-=4;
  if(keys['ArrowRight']&&ship.x<W-ship.w)ship.x+=4;
  // shoot
  if(keys['Space']&&t-lastShot>220){lastShot=t;bullets.push({x:ship.x+ship.w/2,y:ship.y,v:8});}
  // bullets
  bullets=bullets.filter(b=>{b.y-=b.v;return b.y>0;});
  // spawn enemies
  if(tick%50===0){
    for(let i=0;i<3;i++)enemies.push({x:Math.random()*(W-30),y:-30,w:30,h:24,v:1.5+Math.random(),hp:1});
  }
  enemies.forEach(e=>{e.y+=e.v;});
  enemies=enemies.filter(e=>e.y<H+40);
  // collisions bullets vs enemies
  bullets=bullets.filter(b=>{
    const hit=enemies.find(e=>b.x>e.x&&b.x<e.x+e.w&&b.y>e.y&&b.y<e.y+e.h);
    if(hit){hit.hp--;if(hit.hp<=0){enemies.splice(enemies.indexOf(hit),1);score+=10;
      document.getElementById('score').textContent=\`Score: \${score} | Lives: \${'❤️'.repeat(lives)}\`;}return false;}
    return true;
  });
  // enemy hits ship
  if(!ship.invincible){
    const hit=enemies.find(e=>ship.x<e.x+e.w&&ship.x+ship.w>e.x&&ship.y<e.y+e.h&&ship.y+ship.h>e.y);
    if(hit){lives--;ship.invincible=120;enemies.splice(enemies.indexOf(hit),1);
      document.getElementById('score').textContent=\`Score: \${score} | Lives: \${'❤️'.repeat(Math.max(0,lives))}\`;
      if(lives<=0){gameOver=true;ctx.fillStyle='#f005';ctx.fillRect(0,0,W,H);
        ctx.fillStyle='#fff';ctx.font='bold 28px sans-serif';ctx.textAlign='center';
        ctx.fillText('GAME OVER — Score: '+score,W/2,H/2);return;}}
  }else{ship.invincible--;}
  // stars
  stars.forEach(s=>{s.y+=s.v;if(s.y>H){s.y=0;s.x=Math.random()*W;}});
  draw();
}
function draw(){
  ctx.fillStyle='#050510';ctx.fillRect(0,0,W,H);
  stars.forEach(s=>{ctx.fillStyle=\`rgba(255,255,255,\${s.s/3})\`;ctx.fillRect(s.x,s.y,s.s,s.s);});
  // ship (triangle + glow)
  if(!ship.invincible||tick%8<4){
    ctx.shadowColor='#5af';ctx.shadowBlur=16;
    ctx.fillStyle='#3af';ctx.beginPath();
    ctx.moveTo(ship.x+ship.w/2,ship.y);ctx.lineTo(ship.x,ship.y+ship.h);
    ctx.lineTo(ship.x+ship.w,ship.y+ship.h);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;
    // engine flame
    ctx.fillStyle=\`hsl(\${tick*20%60+20},100%,60%)\`;
    ctx.beginPath();ctx.moveTo(ship.x+ship.w/2-6,ship.y+ship.h);
    ctx.lineTo(ship.x+ship.w/2+6,ship.y+ship.h);
    ctx.lineTo(ship.x+ship.w/2,(tick%6<3?ship.y+ship.h+16:ship.y+ship.h+10));ctx.fill();
  }
  // bullets
  ctx.fillStyle='#ff4';ctx.shadowColor='#ff4';ctx.shadowBlur=8;
  bullets.forEach(b=>{ctx.fillRect(b.x-2,b.y,4,14);});
  ctx.shadowBlur=0;
  // enemies
  enemies.forEach(e=>{
    ctx.fillStyle='#f44';ctx.shadowColor='#f44';ctx.shadowBlur=12;
    ctx.beginPath();ctx.moveTo(e.x+e.w/2,e.y+e.h);ctx.lineTo(e.x,e.y);ctx.lineTo(e.x+e.w,e.y);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;
  });
}
init();
`;
  return {
    filename: `shooter_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "arcade",
  };
}

// ─── MEMORY MATCH ────────────────────────────────────────────────

export function generateMemoryMatch(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Memory Match`;
  const body = `<canvas id="c" width="440" height="440"></canvas>
<div id="info">Click cards to flip — match pairs!</div>
<div id="score">Moves: 0 | Pairs: 0/8</div>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const EMOJIS=['🎮','🎯','🎲','🎸','🎨','🚀','🌙','⭐'];
const N=4,SZ=100,PAD=10,OFF=10;
let cards,flipped,matched,moves,lock;
function init(){
  const vals=[...EMOJIS,...EMOJIS].sort(()=>Math.random()-0.5);
  cards=vals.map((v,i)=>({v,r:Math.floor(i/N),c:i%N,face:false,matched:false}));
  flipped=[];matched=0;moves=0;lock=false;draw();
}
function draw(){
  ctx.fillStyle='#0a0a1a';ctx.fillRect(0,0,440,440);
  cards.forEach(card=>{
    const x=OFF+card.c*(SZ+PAD),y=OFF+card.r*(SZ+PAD);
    if(card.matched){
      ctx.fillStyle='#1a3a1a';
    }else if(card.face){
      ctx.fillStyle='#1a2a4a';
    }else{
      ctx.fillStyle='#1a1a3a';
    }
    ctx.beginPath();ctx.roundRect(x,y,SZ,SZ,10);ctx.fill();
    ctx.strokeStyle='#334';ctx.lineWidth=1.5;ctx.stroke();
    if(card.face||card.matched){
      ctx.font='48px serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(card.v,x+SZ/2,y+SZ/2);
    }else{
      ctx.fillStyle='#334';
      for(let i=0;i<3;i++)for(let j=0;j<3;j++){
        ctx.fillRect(x+15+i*20,y+15+j*20,12,12);
      }
    }
  });
}
cv.addEventListener('click',e=>{
  if(lock)return;
  const col=Math.floor((e.offsetX-OFF)/(SZ+PAD)),row=Math.floor((e.offsetY-OFF)/(SZ+PAD));
  const card=cards.find(c=>c.r===row&&c.c===col);
  if(!card||card.face||card.matched||flipped.length>=2)return;
  card.face=true;flipped.push(card);draw();
  if(flipped.length===2){
    lock=true;moves++;
    document.getElementById('score').textContent=\`Moves: \${moves} | Pairs: \${matched}/8\`;
    setTimeout(()=>{
      if(flipped[0].v===flipped[1].v){
        flipped.forEach(c=>c.matched=true);matched++;
        document.getElementById('score').textContent=\`Moves: \${moves} | Pairs: \${matched}/8\`;
        if(matched===8){setTimeout(()=>alert('You won in '+moves+' moves!'),200);}
      }else{flipped.forEach(c=>c.face=false);}
      flipped=[];lock=false;draw();
    },800);
  }
});
init();
`;
  return {
    filename: `memory_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "puzzle",
  };
}

// ─── TOWER DEFENSE ───────────────────────────────────────────────

export function generateTowerDefense(creatorName: string): GeneratedGame {
  const title = `${creatorName}'s Tower Defense`;
  const body = `<canvas id="c" width="480" height="520"></canvas>
<div id="info">Click grid to place towers (costs 50 gold) · Survive the waves!</div>
<div id="hud">Wave: 1 | HP: 20 | Gold: 150</div>`;

  const script = `
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const W=480,H=480,ROWS=10,COLS=12,SZ=40;
let towers,enemies,bullets,gold,hp,wave,tick,spawnQ;
const path=[[0,0],[1,0],[2,0],[2,1],[2,2],[2,3],[3,3],[4,3],[5,3],[6,3],[6,4],
  [6,5],[6,6],[5,6],[4,6],[3,6],[3,7],[3,8],[3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9]];
const pathSet=new Set(path.map(([r,c])=>r*100+c));
function init(){
  towers=[];enemies=[];bullets=[];gold=150;hp=20;wave=1;tick=0;
  spawnQ=Array.from({length:10},(_,i)=>i*60);
  requestAnimationFrame(loop);
}
function loop(){
  requestAnimationFrame(loop);tick++;
  // spawn
  if(spawnQ.length&&tick===spawnQ[0]){
    spawnQ.shift();
    const p=path[0];
    enemies.push({x:p[1]*SZ+SZ/2,y:p[0]*SZ+SZ/2,pi:0,hp:30+wave*10,maxHp:30+wave*10,v:0.8+wave*0.1});
  }
  // move enemies
  enemies.forEach(e=>{
    if(e.pi>=path.length-1){hp--;e.dead=true;return;}
    const pt=path[Math.min(e.pi+1,path.length-1)];
    const tx=pt[1]*SZ+SZ/2,ty=pt[0]*SZ+SZ/2;
    const dx=tx-e.x,dy=ty-e.y,dist=Math.hypot(dx,dy);
    if(dist<e.v+1){e.pi++;} else{e.x+=dx/dist*e.v;e.y+=dy/dist*e.v;}
  });
  enemies=enemies.filter(e=>!e.dead);
  // towers shoot
  towers.forEach(t=>{
    if(tick%30!==0)return;
    const target=enemies.find(e=>Math.hypot(e.x-t.cx,e.y-t.cy)<t.range);
    if(target)bullets.push({x:t.cx,y:t.cy,tx:target,dmg:t.dmg,spd:6});
  });
  // bullets
  bullets.forEach(b=>{
    const dx=b.tx.x-b.x,dy=b.tx.y-b.y,d=Math.hypot(dx,dy);
    if(d<b.spd+2){b.tx.hp-=b.dmg;if(b.tx.hp<=0){b.tx.dead=true;gold+=15;}b.hit=true;}
    else{b.x+=dx/d*b.spd;b.y+=dy/d*b.spd;}
  });
  bullets=bullets.filter(b=>!b.hit);
  enemies=enemies.filter(e=>!e.dead);
  // next wave
  if(!spawnQ.length&&!enemies.length){wave++;gold+=50;
    spawnQ=Array.from({length:10+wave*2},(_,i)=>tick+i*Math.max(40,60-wave*2));
  }
  document.getElementById('hud').textContent=\`Wave: \${wave} | HP: \${hp} | Gold: \${gold}\`;
  if(hp<=0){cancelAnimationFrame(1);ctx.fillStyle='#f005';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff';ctx.font='bold 28px sans-serif';ctx.textAlign='center';
    ctx.fillText('Game Over — Wave '+wave,W/2,H/2);return;}
  draw();
}
function draw(){
  ctx.fillStyle='#0a1a0a';ctx.fillRect(0,0,W,H+40);
  // grid
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    ctx.fillStyle=pathSet.has(r*100+c)?'#3a4a2a':'#0d1a0d';
    ctx.fillRect(c*SZ+1,r*SZ+1,SZ-2,SZ-2);
  }
  // path highlight
  path.forEach(([r,c])=>{ctx.fillStyle='#4a6a3a';ctx.fillRect(c*SZ+2,r*SZ+2,SZ-4,SZ-4);});
  // towers
  towers.forEach(t=>{
    ctx.fillStyle='#88f';ctx.shadowColor='#88f';ctx.shadowBlur=12;
    ctx.fillRect(t.x*SZ+5,t.y*SZ+5,SZ-10,SZ-10);
    ctx.strokeStyle='#88f4';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(t.cx,t.cy,t.range,0,Math.PI*2);ctx.stroke();
    ctx.shadowBlur=0;
  });
  // enemies
  enemies.forEach(e=>{
    ctx.fillStyle='#f44';ctx.shadowColor='#f44';ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(e.x,e.y,12,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    // HP bar
    ctx.fillStyle='#333';ctx.fillRect(e.x-14,e.y-18,28,4);
    ctx.fillStyle='#4f4';ctx.fillRect(e.x-14,e.y-18,28*e.hp/e.maxHp,4);
  });
  // bullets
  ctx.fillStyle='#ff0';ctx.shadowColor='#ff0';ctx.shadowBlur=6;
  bullets.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();});
  ctx.shadowBlur=0;
}
cv.addEventListener('click',e=>{
  const c=Math.floor(e.offsetX/SZ),r=Math.floor(e.offsetY/SZ);
  if(r>=ROWS||c>=COLS)return;
  if(pathSet.has(r*100+c))return;
  if(towers.find(t=>t.x===c&&t.y===r))return;
  if(gold<50)return;
  gold-=50;
  const cx=c*SZ+SZ/2,cy=r*SZ+SZ/2;
  towers.push({x:c,y:r,cx,cy,range:120,dmg:8});
  document.getElementById('hud').textContent=\`Wave: \${wave} | HP: \${hp} | Gold: \${gold}\`;
});
init();
`;
  return {
    filename: `towerdef_${Date.now()}.html`,
    html: html(title, body, script),
    title,
    category: "strategy",
  };
}

// ─── REGISTRY ───────────────────────────────────────────────────

const GENERATORS = [
  generateChess,
  generateSudoku,
  generateSnake,
  generate2048,
  generateMinesweeper,
  generateBreakout,
  generateSpaceShooter,
  generateMemoryMatch,
  generateTowerDefense,
];

export function generateRandomGame(creatorName: string): GeneratedGame {
  const fn = GENERATORS[Math.floor(Math.random() * GENERATORS.length)];
  return fn(creatorName);
}

export function generateGameByName(name: string, creatorName: string): GeneratedGame {
  const map: Record<string, (c: string) => GeneratedGame> = {
    chess: generateChess,
    sudoku: generateSudoku,
    snake: generateSnake,
    "2048": generate2048,
    minesweeper: generateMinesweeper,
    breakout: generateBreakout,
    shooter: generateSpaceShooter,
    memory: generateMemoryMatch,
    tower: generateTowerDefense,
  };
  return (map[name] ?? generateRandomGame)(creatorName);
}
