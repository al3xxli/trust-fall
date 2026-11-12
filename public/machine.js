// Side elevation. Coordinates are attached to the low axle so the belt pivots as one piece.
export function mountMachine(host, state) {
  let phase=0, lap=5.8, lastTap=0, tilt=0, glow=0;
  const tau=Math.PI*2, len=244, axle=[144,228];
  const clamps=(n,a,b)=>Math.max(a,Math.min(b,n));
  function gear(g,x,y,r,teeth,angle,inside) {
    g.save();g.translate(x,y);g.rotate(angle);g.beginPath();
    for(let i=0;i<teeth*4;i++){
      const a=i*tau/(teeth*4),tip=i%4===1 || i%4===2;
      const radius=r+(tip?(inside?-4:4):0);
      const px=Math.cos(a)*radius,py=Math.sin(a)*radius;
      if(i===0)g.moveTo(px,py);else g.lineTo(px,py);
    }
    g.closePath();
    if(inside){g.moveTo(r+6,0);g.arc(0,0,r+6,0,tau);}
    g.fillStyle=inside?"#617970":"#48635a";g.fill("evenodd");g.strokeStyle="#385147";g.lineWidth=1;g.stroke();
    if(!inside){
      for(let i=0;i<5;i++){const a=tau*i/5;g.beginPath();g.arc(r*.57*Math.cos(a),r*.57*Math.sin(a),r*.18,0,tau);g.fillStyle="#e4e4d9";g.fill();}
    }
    g.restore();
  }
  function dot(g,x,y,r,fill){g.beginPath();g.arc(x,y,r,0,tau);g.fillStyle=fill;g.fill();}
  function capsule(g,x,y,w,h,r,fill){g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();}
  function segment(g,x,y,X,Y,color,width){g.beginPath();g.moveTo(x,y);g.lineTo(X,Y);g.lineWidth=width;g.strokeStyle=color;g.stroke();}
  function cubic(a,b,c,d,t){const s=1-t;return [0,1].map(i=>s*s*s*a[i]+3*s*s*t*b[i]+3*s*t*t*c[i]+t*t*t*d[i]);}
  function ball(g,xy){
    const [x,y]=xy,r=9.3;
    const grad=g.createRadialGradient(x-r*.4,y-r*.55,.4,x,y,r);
    grad.addColorStop(0,"#fffff5");grad.addColorStop(.19,"#e4eee2");grad.addColorStop(.55,"#849890");grad.addColorStop(.88,"#354b42");grad.addColorStop(1,"#5a7367");
    dot(g,x,y,r,grad);g.strokeStyle="#30473d";g.lineWidth=.9;g.stroke();
  }
  new p5(p=>{
    p.setup=()=>{p.createCanvas(host.clientWidth,host.clientHeight).parent(host);p.pixelDensity(Math.min(devicePixelRatio,2));};
    p.draw=()=>{
      const dt=Math.min(.12,p.deltaTime/1000);
      const lastTilt=tilt;
      tilt+=(state.tilt-tilt)*(1-Math.exp(-dt*12));
      const speed=Math.abs(tilt-lastTilt)/Math.max(dt,.001);
      const intensity=clamps((speed-.045)/.55,0,1);
      glow=Math.max(intensity,glow*Math.exp(-dt*5));
      if(state.running) phase=(phase+dt/lap)%1;
      const g=p.drawingContext, w=p.width,h=p.height;
      p.background("#e9e8df");
      const z=Math.min(w/440,h/365);
      g.save();g.translate((w-440*z)/2,(h-365*z)/2);g.scale(z,z);
      const a=-(18+16*tilt)*Math.PI/180, co=Math.cos(a),si=Math.sin(a);
      const at=(x,y)=>[axle[0]+x*co-y*si,axle[1]+x*si+y*co];
      segment(g,28,324,412,324,"#b2bbb0",1);
      capsule(g,64,312,230,11,4,"#a8b2a7");
      const ring=[201,196],rot=-phase*tau;
      g.save();g.translate(...ring);g.rotate(rot);
      for(let i=0;i<3;i++){g.rotate(tau/3);segment(g,0,0,0,-110,"#aebcb0",6);}
      g.restore();
      dot(g,...ring,8,"#748b7d");
      g.beginPath();g.arc(...ring,120,0,tau);g.strokeStyle="#abb8ab";g.lineWidth=9;g.stroke();
      gear(g,...ring,112,64,rot,true);
      gear(g,...axle,44,25,rot*64/25,false);
      // Solid stand and its broad, upward-curving catch.
      g.beginPath();g.moveTo(62,315);g.lineTo(79,179);g.quadraticCurveTo(81,162,91,158);
      g.bezierCurveTo(83,226,79,291,116,299);g.bezierCurveTo(151,309,178,287,196,268);
      g.quadraticCurveTo(201,262,202,270);g.lineTo(204,315);g.closePath();
      g.fillStyle="#b7c4b7";g.fill();g.strokeStyle="#566d60";g.lineWidth=1.5;g.stroke();
      g.save();g.translate(...axle);g.rotate(a);
      capsule(g,-15,-14,len+30,29,14,"#4e6559");
      capsule(g,-14,-13,len+28,23,12,"#c5d1c4");
      segment(g,0,-12,len,-12,"#fbfbef",2.1);
      if (glow>.02) {
        g.save();
        g.globalAlpha=glow;
        g.shadowColor="#75d733";
        g.shadowBlur=14*z;
        g.strokeStyle="#ceff86";
        g.lineWidth=3.5;
        g.beginPath();
        g.roundRect(-15,-14,len+30,29,14);
        g.stroke();
        g.restore();
      }
      for(let i=0;i<14;i++){const x=((i/14+phase)%1)*len;segment(g,x,11,x+3,11,"#c4d99b",2.8);}
      for(const x of [0,len]){dot(g,x,0,9.5,"#708679");dot(g,x,0,5.4,"#e5e9d9");
        const spin=-phase*tau*5;segment(g,x,0,x+5*Math.cos(spin),5*Math.sin(spin),"#647b6c",1.8);}
      g.restore();
      const drop=at(-13,-22), pickup=at(60,22), basin=[120,290];
      for(let i=0;i<3;i++){
        const t=(phase+i/3)%1;let xy;
        if(t<.31){const f=t/.31;xy=at(len-(len+13)*(.25*f+.75*f*f),-22);}
        else if(t<.42){const f=(t-.31)/.11;xy=cubic(drop,[drop[0]-8,drop[1]+3],[88,248],[91,263],f);}
        else if(t<.51){xy=cubic([91,263],[92,281],[102,290],basin,(t-.42)/.09);}
        else if(t<.63){xy=cubic(basin,[151,296],[177,268],pickup,(t-.51)/.12);}
        else if(t<.93){xy=at(60+(len-60)*(t-.63)/.30,22);}
        else{const th=Math.PI/2-Math.PI*(t-.93)/.07;xy=at(len+22*Math.cos(th),22*Math.sin(th));}
        ball(g,xy);
      }
      g.restore();
    };
    p.windowResized=()=>p.resizeCanvas(host.clientWidth,host.clientHeight);
  },host);
  return ()=>{
    const now=performance.now(), elapsed=(now-lastTap)/1000;
    if(lastTap && elapsed>1 && elapsed<45) lap=clamps(elapsed,1,45);
    lastTap=now;phase=.31; // Tap when the same physical ball leaves the low end.
  };
}

