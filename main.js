// v7.6 — Defender spawn & 10s freeze time
(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');

  function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; } addEventListener('resize', resize); resize();

  // ---- Constants
  const TILE = 12;                      // px per tile
  const GRID_W = 240, GRID_H = 168;    // big handcrafted grid
  const WORLD_W = GRID_W * TILE, WORLD_H = GRID_H * TILE;

  const AGENT_RADIUS = 10;
  const AI_SPEED = 170;
  const BULLET_SPEED = 700, BULLET_RADIUS=3, BULLET_LIFETIME=2.0, BULLET_DAMAGE=28;
  const SHOOT_COOLDOWN=0.55, DETECTION_RANGE=540;
  const ROUND_TIME=90, PLANT_TIME=3, DEFUSE_TIME=4, TIME_TO_EXPLODE=30;
  const TEAM_ATTACKER='ATT', TEAM_DEFENDER='DEF';
  const DOOR_T = 8; // tiles; >= 96px openings

  // ---- Map data
  let walkable = Array.from({length:GRID_H}, ()=>Array(GRID_W).fill(false));
  let doors = []; // {x0,y0,x1,y1} in tiles for draw/debug
  let showDoors=false;

  let sites = [{name:'A',x:0,y:0,r:84},{name:'B',x:0,y:0,r:84}];
  let attackerSpawnRect = {x0:0,y0:0,x1:0,y1:0}; // tiles
  let defenderSpawnRect = {x0:0,y0:0,x1:0,y1:0}; // tiles
  let attackerDoor = null;
  let preRoundTime = 0;
  let attackerDoorOpen = false;

  // Helpers
  function i(v){ return Math.max(0, Math.min(v|0, 9999)); }
  function carveRect(x0,y0,x1,y1){
    x0=i(Math.floor(x0)); y0=i(Math.floor(y0));
    x1=i(Math.ceil(x1));  y1=i(Math.ceil(y1));
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
      if(x>=0&&y>=0&&x<GRID_W&&y<GRID_H) walkable[y][x]=true;
    }
  }
  function carveDoor(x0,y0,x1,y1){
    x0=Math.floor(x0); y0=Math.floor(y0); x1=Math.ceil(x1); y1=Math.ceil(y1);
    const w = Math.max(1, x1-x0), h = Math.max(1, y1-y0);
    if(w >= h && w < DOOR_T){ const add = Math.ceil((DOOR_T - w)/2); x0 -= add; x1 += add; }
    else if(h > w && h < DOOR_T){ const add = Math.ceil((DOOR_T - h)/2); y0 -= add; y1 += add; }
    carveRect(x0,y0,x1,y1);
    doors.push({x0,y0,x1,y1});
  }

  function buildMap(){
    walkable = Array.from({length:GRID_H}, ()=>Array(GRID_W).fill(false));
    doors = [];
    const W=GRID_W, H=GRID_H;
    // Attacker spawn (bottom plaza)
    const spawnWidth = Math.floor(W*0.66);
    const sx0 = (W - spawnWidth)/2, sx1 = (W + spawnWidth)/2;
    carveRect(sx0, H-18, sx1, H-6);
    attackerSpawnRect = {x0:sx0, y0:H-18, x1:sx1, y1:H-6};

    // South connector to mid
    carveRect(W*0.44, H-48, W*0.56, H-18);
    attackerDoor = {x0:W*0.44, y0:H-50, x1:W*0.56, y1:H-48}; // closed initially

    // Mid hub
    carveRect(W*0.36, H*0.55, W*0.64, H*0.70);
    carveDoor(W*0.47, H*0.70, W*0.53, H*0.70+2);

    // Left/right junctions
    carveRect(W*0.22, H*0.55, W*0.36, H*0.62);
    carveRect(W*0.64, H*0.55, W*0.78, H*0.62);
    carveDoor(W*0.34, H*0.60, W*0.36, H*0.63);
    carveDoor(W*0.64, H*0.60, W*0.66, H*0.63);

    // A/B mains
    carveRect(W*0.12, H*0.45, W*0.36, H*0.60); // A main
    carveRect(W*0.64, H*0.45, W*0.88, H*0.60); // B main

    // Upper connector
    carveRect(W*0.44, H*0.40, W*0.56, H*0.55);
    carveDoor(W*0.47, H*0.39, W*0.53, H*0.41);

    // Sites rooms
    carveRect(W*0.06, H*0.24, W*0.30, H*0.44); // A room
    carveRect(W*0.70, H*0.24, W*0.94, H*0.44); // B room

    // Multiple doors into sites
    carveDoor(W*0.28, H*0.33, W*0.31, H*0.37); // A main → A site
    carveDoor(W*0.18, H*0.24, W*0.22, H*0.27); // A heaven
    carveDoor(W*0.70, H*0.33, W*0.73, H*0.37); // B main → B site
    carveDoor(W*0.82, H*0.24, W*0.86, H*0.27); // B heaven

    // Catwalks
    carveRect(W*0.30, H*0.18, W*0.42, H*0.24);
    carveRect(W*0.58, H*0.18, W*0.70, H*0.24);
    carveDoor(W*0.40, H*0.24, W*0.42, H*0.27);
    carveDoor(W*0.58, H*0.24, W*0.60, H*0.27);

    // Defender spawn room (north) and connectors
    carveRect(W*0.42, H*0.04, W*0.58, H*0.18);
    carveRect(W*0.30, H*0.12, W*0.70, H*0.18); // corridor linking to catwalks
    defenderSpawnRect = {x0:W*0.42, y0:H*0.04, x1:W*0.58, y1:H*0.18};

    // Defender push pads
    carveRect(W*0.30, H*0.52, W*0.36, H*0.55);
    carveRect(W*0.64, H*0.52, W*0.70, H*0.55);
    carveDoor(W*0.33, H*0.55, W*0.36, H*0.57);
    carveDoor(W*0.64, H*0.55, W*0.67, H*0.57);

    // Centers
    function centerRect(x0,y0,x1,y1){ return {x: ((x0+x1)/2|0)*TILE, y: ((y0+y1)/2|0)*TILE}; }
    const aC = centerRect(W*0.06, H*0.24, W*0.30, H*0.44);
    const bC = centerRect(W*0.70, H*0.24, W*0.94, H*0.44);
    sites[0].x=aC.x; sites[0].y=aC.y;
    sites[1].x=bC.x; sites[1].y=bC.y;

  }

  // ---- Grid helpers
  function inBounds(x,y){ return x>=0 && y>=0 && x<GRID_W && y<GRID_H; }
  function worldToCell(x,y){ return {cx: Math.floor(x/TILE), cy: Math.floor(y/TILE)}; }
  function cellToWorld(cx,cy){ return {x: cx*TILE + TILE/2, y: cy*TILE + TILE/2}; }
  function isWalkCell(cx,cy){ return inBounds(cx,cy) && walkable[cy][cx]; }

  // Collision for circle vs blocked tiles
  function circleCollides(x,y,r){
    const {cx,cy}=worldToCell(x,y);
    const rad = Math.ceil((r + TILE*0.5)/TILE);
    for(let dy=-rad; dy<=rad; dy++){
      for(let dx=-rad; dx<=rad; dx++){
        const nx=cx+dx, ny=cy+dy;
        if(!inBounds(nx,ny) || !walkable[ny][nx]){
          const wc = cellToWorld(nx,ny);
          const d = Math.hypot(wc.x-x, wc.y-y);
          if(d <= r + TILE*0.6) return true;
        }
      }
    }
    return false;
  }

  // Line of sight
  function losFree(x1,y1,x2,y2){
    const dx=x2-x1, dy=y2-y1, dist=Math.hypot(dx,dy);
    const steps = Math.max(1, Math.floor(dist/(TILE*0.6)));
    for(let i=1;i<=steps;i++){
      const t=i/steps, px=x1+dx*t, py=y1+dy*t;
      const {cx,cy}=worldToCell(px,py);
      if(!isWalkCell(cx,cy)) return false;
    }
    return true;
  }

  // Wall repulsion: a small field pushing away from blocked tiles
  function wallRepulse(x,y){
    const {cx,cy}=worldToCell(x,y);
    let vx=0, vy=0;
    const R=3;
    for(let dy=-R; dy<=R; dy++){
      for(let dx=-R; dx<=R; dx++){
        const nx=cx+dx, ny=cy+dy;
        if(!inBounds(nx,ny)) continue;
        if(!isWalkCell(nx,ny)){
          const wc = cellToWorld(nx,ny);
          const ddx=x-wc.x, ddy=y-wc.y;
          const d2=ddx*ddx+ddy*ddy;
          if(d2>1){
            const inv = 1/Math.pow(d2,0.7);
            vx += ddx*inv; vy += ddy*inv;
          }
        }
      }
    }
    return {x:vx,y:vy};
  }

  // Pathfinder (A*)
  class Pathfinder{
    neighbors(cx,cy){
      const res=[];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nx=cx+dx, ny=cy+dy;
        if(!isWalkCell(nx,ny)) continue;
        if(Math.abs(dx)+Math.abs(dy)===2){
          if(!isWalkCell(cx,ny) || !isWalkCell(nx,cy)) continue;
        }
        res.push({cx:nx, cy:ny, cost:(Math.abs(dx)+Math.abs(dy)===2)?1.414:1});
      }
      return res;
    }
    heuristic(a,b){ return Math.hypot(a.cx-b.cx, a.cy-b.cy); }
    astar(start,goal){
      let s=worldToCell(start.x,start.y);
      let g=worldToCell(goal.x,goal.y);
      if(!isWalkCell(g.cx,g.cy)){
        const q=[[g.cx,g.cy]]; const seen=new Set([g.cx+','+g.cy]);
        while(q.length){
          const [x,y]=q.shift();
          if(isWalkCell(x,y)){ g={cx:x,cy:y}; break; }
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nx=x+dx, ny=y+dy, k=nx+','+ny;
            if(!inBounds(nx,ny) || seen.has(k)) continue;
            seen.add(k); q.push([nx,ny]);
          }
        }
      }
      const key=(x,y)=>x+','+y;
      const open=new Map(), gScore=new Map(), fScore=new Map(), came=new Map();
      const sk=key(s.cx,s.cy), gk=key(g.cx,g.cy);
      gScore.set(sk,0); fScore.set(sk,this.heuristic(s,g)); open.set(sk,{cx:s.cx,cy:s.cy});
      while(open.size){
        let curK=null, cur=null, best=Infinity;
        for(const [k,n] of open){ const f=fScore.get(k) ?? Infinity; if(f<best){ best=f; curK=k; cur=n; } }
        if(curK===gk){
          const path=[]; let k=curK;
          while(k){
            const [x,y]=k.split(',').map(Number);
            path.push(cellToWorld(x,y)); k=came.get(k);
          }
          return path.reverse();
        }
        open.delete(curK);
        const base=gScore.get(curK) ?? Infinity;
        for(const nb of this.neighbors(cur.cx,cur.cy)){
          const nk=key(nb.cx,nb.cy);
          const sc=base + nb.cost;
          if(sc < (gScore.get(nk) ?? Infinity)){
            gScore.set(nk,sc);
            fScore.set(nk, sc + this.heuristic(nb,g));
            came.set(nk,curK);
            if(!open.has(nk)) open.set(nk,{cx:nb.cx,cy:nb.cy});
          }
        }
      }
      return null;
    }
  }
  const nav = new Pathfinder();

  // ---- Game State
  let attackers=[], defenders=[], agents=[], bullets=[];
  const bomb={ state:'idle', carrier:null, siteIndex:null, plantProgress:0, defuseProgress:0, timer:0 };
  let attackerSiteIndex=0, lastFightTime=-999, lastFightPos={x:0,y:0}, roundTime=ROUND_TIME;
  let gameRunning=false, lastTime=0, roundOver=false, resultMessage='';

  // spectator camera state
  const camera={
    x:0,
    y:0,
    zoom:1,
    w:()=>canvas.width/camera.zoom,
    h:()=>canvas.height/camera.zoom
  };
  function clampCamera(){
    camera.x=Math.max(0, Math.min(WORLD_W - camera.w(), camera.x));
    camera.y=Math.max(0, Math.min(WORLD_H - camera.h(), camera.y));
  }
  function centerCameraOn(x,y){
    camera.x = x - camera.w()/2;
    camera.y = y - camera.h()/2;
    clampCamera();
  }

  // camera input
  const camKeys={};
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    camKeys[k]=true;
    if(k==='='||k==='+') camera.zoom*=1.1;
    if(k==='-'||k==='_') camera.zoom/=1.1;
    if(k==='='||k==='+'||k==='-'||k==='_'){
      camera.zoom=Math.max(0.5, Math.min(3, camera.zoom));
      const cx=camera.x+camera.w()/2, cy=camera.y+camera.h()/2;
      camera.x=cx-camera.w()/2; camera.y=cy-camera.h()/2;
      clampCamera();
    }
  });
  addEventListener('keyup',e=>{ camKeys[e.key.toLowerCase()]=false; });
  addEventListener('wheel',e=>{
    if(e.deltaY<0) camera.zoom*=1.1; else camera.zoom/=1.1;
    camera.zoom=Math.max(0.5, Math.min(3, camera.zoom));
    // keep center
    const cx=camera.x+camera.w()/2, cy=camera.y+camera.h()/2;
    camera.x=cx-camera.w()/2; camera.y=cy-camera.h()/2;
    clampCamera();
    e.preventDefault();
  },{passive:false});

  function separation(){
    for(let i=0;i<agents.length;i++){
      for(let j=i+1;j<agents.length;j++){
        const a=agents[i], b=agents[j];
        if(!a.alive || !b.alive) continue;
        const dx=b.x-a.x, dy=b.y-a.y, d2=dx*dx+dy*dy, min=(AGENT_RADIUS*2.4)**2;
        if(d2>0 && d2<min){
          const d=Math.sqrt(d2), px=dx*((AGENT_RADIUS*2.4 - d)/d * 0.5), py=dy*((AGENT_RADIUS*2.4 - d)/d * 0.5);
          if(!circleCollides(a.x-px, a.y-py, AGENT_RADIUS)){ a.x-=px; a.y-=py; }
          if(!circleCollides(b.x+px, b.y+py, AGENT_RADIUS)){ b.x+=px; b.y+=py; }
        }
      }
    }
  }

  function findNearestEnemy(a){
    const arr=a.team===TEAM_ATTACKER?defenders:attackers; let best=null,bestD=Infinity;
    for(const o of arr){ if(!o.alive) continue; const d=(o.x-a.x)**2+(o.y-a.y)**2; if(d<bestD){bestD=d; best=o;} }
    return best;
  }
  function nearestSite(p){
    const dA=(p.x-sites[0].x)**2+(p.y-sites[0].y)**2, dB=(p.x-sites[1].x)**2+(p.y-sites[1].y)**2;
    return dA<dB?0:1;
  }

  class Agent{
    constructor(x,y,team,color,idx,size){
      this.x=x; this.y=y; this.team=team; this.color=color;
      this.hp=100; this.dead=false; this.hasBomb=false; this.shootCooldown=0;
      this.path=[]; this.pathIdx=0; this.goal={x,y}; this.repathTimer=0;
      this.strafeT=0; this.strafePhase=Math.random()*Math.PI*2; this.wasEngaged=false;
      const angle = (idx/size) * Math.PI*2;
      this.form = {ox:Math.cos(angle)*140, oy:Math.sin(angle)*140};
      this.lastProgress=1e9; this.progressTimer=0;
      this.id=idx + Math.random(); // for micro jitter
    }
    get alive(){ return !this.dead; }
    shoot(){
      if(this.dead||this.shootCooldown>0) return;
      const t=findNearestEnemy(this); if(!t) return;
      const ang=Math.atan2(t.y-this.y,t.x-this.x);
      bullets.push({x:this.x,y:this.y,dx:Math.cos(ang),dy:Math.sin(ang),life:BULLET_LIFETIME,owner:this});
      this.shootCooldown=SHOOT_COOLDOWN;
      lastFightTime=performance.now()/1000; lastFightPos={x:(this.x+t.x)/2, y:(this.y+t.y)/2};
    }
    tryStep(dx,dy){
      // predictive sliding: forward; if blocked, axis-only; then lateral sidestep
      const nx=this.x+dx, ny=this.y+dy;
      if(!circleCollides(nx,ny,AGENT_RADIUS)){ this.x=nx; this.y=ny; return true; }
      if(!circleCollides(this.x+dx, this.y, AGENT_RADIUS)){ this.x+=dx; return true; }
      if(!circleCollides(this.x, this.y+dy, AGENT_RADIUS)){ this.y+=dy; return true; }
      // tangent sidestep
      const mag=Math.hypot(dx,dy)||1, tx=-dy/mag, ty=dx/mag;
      const side = (Math.sin(this.id*12.9898 + performance.now()/180) > 0)? 1 : -1;
      const sx = tx*side*Math.hypot(dx,dy)*0.75, sy = ty*side*Math.hypot(dx,dy)*0.75;
      if(!circleCollides(this.x+sx, this.y+sy, AGENT_RADIUS)){ this.x+=sx; this.y+=sy; return true; }
      return false;
    }
    update(dt){
      if(this.dead) return;
      const t=findNearestEnemy(this);
      const engaged = !!(t && ((this.x-t.x)**2+(this.y-t.y)**2) < DETECTION_RANGE*DETECTION_RANGE && losFree(this.x,this.y,t.x,t.y));

      // Objective
      let target={x:this.x,y:this.y};
      if(this.team===TEAM_ATTACKER){
        if(bomb.state==='planted'){ const s=sites[bomb.siteIndex]; target={x:s.x + this.form.ox*0.35, y:s.y + this.form.oy*0.35}; }
        else if(this.hasBomb){ const s=sites[attackerSiteIndex]; target={x:s.x, y:s.y}; }
        else if(bomb.carrier && bomb.carrier.alive){ target={x:bomb.carrier.x + this.form.ox*0.3, y:bomb.carrier.y + this.form.oy*0.3}; }
        else { const s=sites[attackerSiteIndex]; target={x:s.x + this.form.ox*0.6, y:s.y + this.form.oy*0.6}; }
      } else {
        if(bomb.state==='planted'){ const s=sites[bomb.siteIndex]; target={x:s.x + this.form.ox*0.4, y:s.y + this.form.oy*0.4}; }
        else { const idx = (this.siteIndex!=null)?this.siteIndex:nearestSite(this); const s=sites[idx]; target={x:s.x + this.form.ox*0.6, y:s.y + this.form.oy*0.6}; }
      }

      // Repathing + micro jitter
      this.repathTimer-=dt;
      const needRepath = (!this.path.length || this.repathTimer<=0 || (!engaged && this.wasEngaged));
      if(needRepath){
        // micro jitter to distribute goals
        const jitter=8; const jx=(Math.sin(this.id*3.7)+Math.random()-0.5)*jitter, jy=(Math.cos(this.id*2.9)+Math.random()-0.5)*jitter;
        this.goal={x:target.x + jx, y:target.y + jy};
        const p = nav.astar({x:this.x,y:this.y}, this.goal);
        this.path = (p && p.length)?p:[this.goal];
        this.pathIdx=0;
        this.repathTimer = this.hasBomb?0.35:0.9;
        this.lastProgress = 1e9; this.progressTimer=0;
      }

      // String-pull smoothing: jump to furthest visible waypoint
      if(this.path.length>0){
        let fur=this.pathIdx;
        for(let k=this.path.length-1;k>this.pathIdx;k--){
          const node=this.path[k];
          if(losFree(this.x,this.y,node.x,node.y)){ fur=k; break; }
        }
        this.pathIdx = fur;
      }

      // Skip ahead if stuck toward current node
      if(this.pathIdx<this.path.length){
        const node=this.path[this.pathIdx];
        const d=Math.hypot(node.x-this.x,node.y-this.y);
        const ACCEPT = 16;
        if(d<ACCEPT){ this.pathIdx++; }
        else {
          if(d >= this.lastProgress-0.5) this.progressTimer += dt; else this.progressTimer=0;
          this.lastProgress=d;
          if(this.progressTimer>0.45){ this.pathIdx=Math.min(this.pathIdx+1, this.path.length-1); this.repathTimer=0; this.progressTimer=0; }
        }
      }

      // Movement toward node
      let mvx=0,mvy=0;
      if(this.pathIdx<this.path.length){
        const node=this.path[this.pathIdx], dx=node.x-this.x, dy=node.y-this.y, d=Math.hypot(dx,dy);
        if(d>0){ mvx=dx/d; mvy=dy/d; }
      }
      // Apply wall repulsion
      const rep = wallRepulse(this.x,this.y);
      mvx += rep.x*0.18; mvy += rep.y*0.18;

      // Combat strafing only when engaged
      if(engaged){
        this.strafeT+=dt; const s=Math.sin(this.strafeT*10+this.strafePhase)*0.45;
        const px=-mvy, py=mvx; mvx=mvx*0.9 + px*s; mvy=mvy*0.9 + py*s;
      }

      // Normalize & step with predictive sliding
      const ml=Math.hypot(mvx,mvy); if(ml>0){
        mvx/=ml; mvy/=ml;
        const step = AI_SPEED*dt;
        this.tryStep(mvx*step, mvy*step);
        // Keep inside world
        this.x=Math.max(AGENT_RADIUS, Math.min(WORLD_W-AGENT_RADIUS, this.x));
        this.y=Math.max(AGENT_RADIUS, Math.min(WORLD_H-AGENT_RADIUS, this.y));
      }

      // Combat
      this.shootCooldown-=dt; if(this.shootCooldown<0) this.shootCooldown=0;
      if(engaged && this.shootCooldown<=0) this.shoot();

      // Plant / Defuse
      if(this.team===TEAM_ATTACKER && this.hasBomb){
        const s=sites[attackerSiteIndex];
        const inside = ((this.x-s.x)**2+(this.y-s.y)**2) < (s.r*s.r);
        if(inside){
          if(bomb.state==='idle'){ bomb.state='planting'; bomb.carrier=this; bomb.siteIndex=attackerSiteIndex; }
          if(bomb.state==='planting' && bomb.carrier===this){
            bomb.plantProgress += dt/PLANT_TIME;
            if(bomb.plantProgress>=1){ bomb.state='planted'; bomb.plantProgress=0; bomb.timer=0; this.hasBomb=false; bomb.carrier=null; }
            return;
          }
        }
      } else if (this.team===TEAM_DEFENDER && bomb.state==='planted'){
        const s=sites[bomb.siteIndex];
        const inside = ((this.x-s.x)**2+(this.y-s.y)**2) < (s.r*s.r);
        if(inside){
          bomb.defuseProgress += dt/DEFUSE_TIME;
          if(bomb.defuseProgress>=1){ bomb.state='defused'; bomb.defuseProgress=0; }
        }
      }

      this.wasEngaged=engaged;
    }
    draw(){
      ctx.fillStyle=this.dead?'#45464d':this.color;
      ctx.beginPath(); ctx.arc(this.x,this.y,AGENT_RADIUS,0,Math.PI*2); ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle=this.team===TEAM_ATTACKER?'#4EE1C1':'#3EA0FF'; ctx.stroke();
      if(this.hasBomb){ ctx.fillStyle='#FFD23F'; ctx.beginPath(); ctx.arc(this.x,this.y-AGENT_RADIUS-6,5,0,Math.PI*2); ctx.fill(); }
    }
  }

  // ---- Bullets
  function updateBullets(dt){
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];
      b.x += b.dx*BULLET_SPEED*dt; b.y += b.dy*BULLET_SPEED*dt; b.life -= dt;
      if(b.life<=0 || b.x<0||b.y<0||b.x>WORLD_W||b.y>WORLD_H){ bullets.splice(i,1); continue; }
      const {cx,cy}=worldToCell(b.x,b.y); if(!isWalkCell(cx,cy)){ bullets.splice(i,1); continue; }
      const targets=b.owner.team===TEAM_ATTACKER?defenders:attackers;
      for(const t of targets){
        if(!t.alive) continue;
        const d=(t.x-b.x)**2+(t.y-b.y)**2;
        if(d < (AGENT_RADIUS+BULLET_RADIUS)**2){
          t.hp -= BULLET_DAMAGE;
          if(t.hp<=0){
            t.dead=true;
            if(t.hasBomb){ t.hasBomb=false; const aliveA=attackers.filter(a=>a.alive); if(aliveA.length){ aliveA[0].hasBomb=true; bomb.carrier=aliveA[0]; } }
          }
          bullets.splice(i,1); break;
        }
      }
    }
  }

  // ---- Drawing
  function drawMap(){
    ctx.fillStyle='#101218'; ctx.fillRect(0,0,WORLD_W,WORLD_H);
    ctx.fillStyle='#d8d9df';
    for(let y=0;y<GRID_H;y++){ for(let x=0;x<GRID_W;x++){ if(walkable[y][x]) ctx.fillRect(x*TILE, y*TILE, TILE, TILE); } }
    if(showDoors){
      ctx.strokeStyle='#ff66aa'; ctx.lineWidth=3;
      for(const d of doors){ ctx.strokeRect(d.x0*TILE, d.y0*TILE, (d.x1-d.x0)*TILE, (d.y1-d.y0)*TILE); }
    }
    for(const s of sites){
      ctx.globalAlpha=0.35; ctx.fillStyle='#ffd76a'; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1; ctx.strokeStyle='#ff9e3d'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#ffd76a'; ctx.font='16px sans-serif'; ctx.textAlign='center'; ctx.fillText(s.name, s.x, s.y+5);
    }
  }

  function checkRoundEnd(){
    const attAlive=attackers.some(a=>a.alive), defAlive=defenders.some(d=>d.alive);
    if(bomb.state==='planted'){ if(!defAlive){ resultMessage='Attackers win: all defenders eliminated!'; return true; } return false; }
    if(bomb.state==='defused'){ resultMessage='Defenders win: bomb defused!'; return true; }
    if(bomb.state==='exploded'){ resultMessage='Attackers win: bomb exploded!'; return true; }
    if(!attAlive){ resultMessage='Defenders win: all attackers eliminated!'; return true; }
    if(!defAlive && bomb.state==='idle'){ resultMessage='Attackers win: all defenders eliminated!'; return true; }
    if(roundTime<=0 && bomb.state!=='planted'){ resultMessage='Defenders win: time ran out!'; return true; }
    return false;
  }

  // ---- Spawning
  function sampleInRect(rx){
    const x0=Math.max(0,Math.floor(rx.x0)), y0=Math.max(0,Math.floor(rx.y0));
    const x1=Math.min(GRID_W-1,Math.ceil(rx.x1)), y1=Math.min(GRID_H-1,Math.ceil(rx.y1));
    for(let tries=0; tries=400; tries++){}
    return {x:WORLD_W/2,y:WORLD_H-40};
  }
  // (Fix loop — correct logic)
  function sampleInRect(rx2){
    const x0=Math.max(0,Math.floor(rx2.x0)), y0=Math.max(0,Math.floor(rx2.y0));
    const x1=Math.min(GRID_W-1,Math.ceil(rx2.x1)), y1=Math.min(GRID_H-1,Math.ceil(rx2.y1));
    for(let tries=0; tries<500; tries++){
      const cx = Math.floor(x0 + Math.random()*(x1-x0-1));
      const cy = Math.floor(y0 + Math.random()*(y1-y0-1));
      if(isWalkCell(cx,cy)){
        const p = cellToWorld(cx,cy);
        if(!circleCollides(p.x,p.y,AGENT_RADIUS+2)) return p;
      }
    }
    return {x:WORLD_W/2,y:WORLD_H/2};
  }

  function startGame(){
    attackers=[]; defenders=[]; agents=[]; bullets=[];
    bomb.state='idle'; bomb.carrier=null; bomb.siteIndex=null; bomb.plantProgress=0; bomb.defuseProgress=0; bomb.timer=0;
    lastFightTime=-999; lastFightPos={x:0,y:0}; roundTime=ROUND_TIME; roundOver=false; resultMessage='';
    attackerSiteIndex = Math.random()<0.5?0:1;
    preRoundTime = 10;
    attackerDoorOpen = false;

    buildMap();

    // Attackers
    for(let i=0;i<10;i++){
      const p = sampleInRect(attackerSpawnRect);
      const a = new Agent(p.x,p.y,TEAM_ATTACKER,'#4EE1C1',i,10); attackers.push(a); agents.push(a);
    }
    // Defenders
    for(let i=0;i<10;i++){
      const p = sampleInRect(defenderSpawnRect);
      const d = new Agent(p.x,p.y,TEAM_DEFENDER,'#3EA0FF',i,10);
      d.siteIndex = Math.random()<0.5?0:1;
      defenders.push(d); agents.push(d);
    }

    // Bomb
    const carrier=attackers[Math.floor(Math.random()*attackers.length)]; carrier.hasBomb=true; bomb.carrier=carrier;

    centerCameraOn(WORLD_W/2, WORLD_H/2);
    gameRunning=true; lastTime=performance.now(); requestAnimationFrame(loop);
  }

  function showEndOverlay(msg){
    overlay.style.display='flex';
    overlay.innerHTML = `<div id="panel" style="text-align:center"><h2>${msg}</h2><button id="rst">Restart</button></div>`;
    document.getElementById('rst').onclick=()=>{ overlay.style.display='none'; startGame(); };
  }

  function update(dt){
    const camSpeed = 400 / camera.zoom;
    if(camKeys['arrowleft'] || camKeys['a']) camera.x -= camSpeed*dt;
    if(camKeys['arrowright'] || camKeys['d']) camera.x += camSpeed*dt;
    if(camKeys['arrowup'] || camKeys['w']) camera.y -= camSpeed*dt;
    if(camKeys['arrowdown'] || camKeys['s']) camera.y += camSpeed*dt;
    clampCamera();

    if(preRoundTime>0){
      preRoundTime-=dt;
      if(preRoundTime<=0 && !attackerDoorOpen){
        carveDoor(attackerDoor.x0, attackerDoor.y0, attackerDoor.x1, attackerDoor.y1);
        attackerDoorOpen = true;
        for(const a of attackers) a.repathTimer=0;
      }
    } else if(bomb.state!=='planted'){ roundTime-=dt; }

    for(const a of agents) a.update(dt);
    separation();
    updateBullets(dt);

    // Plant/defuse edge checks
    if(bomb.state==='planting'){
      const c=bomb.carrier, s=sites[bomb.siteIndex];
      const ok = c && c.alive && ((c.x-s.x)**2+(c.y-s.y)**2) < s.r*s.r;
      if(!ok){ bomb.state='idle'; bomb.carrier=null; bomb.siteIndex=null; bomb.plantProgress=0; }
    }
    if(bomb.state==='planted' && bomb.defuseProgress>0){
      const s=sites[bomb.siteIndex];
      const someone = defenders.some(d=> d.alive && ((d.x-s.x)**2+(d.y-s.y)**2) < s.r*s.r );
      if(!someone) bomb.defuseProgress=0;
    }
    if(bomb.state==='planted'){ bomb.timer += dt; if(bomb.timer>=TIME_TO_EXPLODE) bomb.state='exploded'; }

    if(!roundOver && checkRoundEnd()){ roundOver=true; gameRunning=false; setTimeout(()=>showEndOverlay(resultMessage), 300); }
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    drawMap();
    // bullets
    ctx.fillStyle='#fff5a0'; for(const b of bullets){ ctx.beginPath(); ctx.arc(b.x,b.y,BULLET_RADIUS,0,Math.PI*2); ctx.fill(); }
    // agents
    for(const a of agents) a.draw();
    // sites labels drawn in drawMap
    ctx.restore();

    // HUD
    function fmt(t){ t=Math.max(0,Math.ceil(t)); const m=(t/60)|0, s=t%60|0; return m+':' + (s<10?'0':'')+s; }
    const att=attackers.filter(a=>a.alive).length, def=defenders.filter(a=>a.alive).length;
    hud.textContent = `ATT: ${att}/10  |  DEF: ${def}/10  |  Timer: ${fmt(roundTime)}`;
    if(preRoundTime>0) statusEl.textContent=`Prep: ${preRoundTime.toFixed(1)}s`;
    else if(bomb.state==='planted') statusEl.textContent=`Bomb: ${(TIME_TO_EXPLODE-bomb.timer).toFixed(1)}s`;
    else if(bomb.state==='defused') statusEl.textContent='Bomb defused!';
    else if(bomb.state==='exploded') statusEl.textContent='Bomb exploded!';
    else if(bomb.state==='planting') statusEl.textContent='Planting...';
    else statusEl.textContent='';
  }

  function loop(now){
    if(!gameRunning) return;
    const dt=(now-(loop._last||now))/1000; loop._last=now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Doorway overlay toggle
  addEventListener('keydown', (e)=>{ if(e.key==='d'||e.key==='D'){ showDoors=!showDoors; }});

  startBtn.addEventListener('click', ()=>{ overlay.style.display='none'; startGame(); });

})();