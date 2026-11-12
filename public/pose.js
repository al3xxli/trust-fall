import { FilesetResolver, PoseLandmarker } from "./vendor/vision_bundle.mjs";

export async function makeTracker() {
  const files = await FilesetResolver.forVisionTasks("./vendor/wasm");
  const options = {runningMode:"VIDEO", numPoses:1,
    baseOptions:{modelAssetPath:"./vendor/pose_landmarker_full.task", delegate:"GPU"}};
  try { return await PoseLandmarker.createFromOptions(files, options); }
  catch {
    options.baseOptions.delegate = "CPU";
    return PoseLandmarker.createFromOptions(files, options);
  }
}

// Major body joints, plus nose, eye and ear on each side of the head.
const chains = [
  [8,5,0,2,7], [12,11,13,15], [12,14,16],
  [11,23,24,12], [23,25,27,29,31,27], [24,26,28,30,32,28]
];
const joints = [...new Set(chains.flat())];
const visible = p => p && (p.visibility ?? 1) >= .55 &&
  p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

function drawSkeleton(g, points, xy) {
  const jointsOnScreen = points.map(p => visible(p) ? xy(p) : null);
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  for (const chain of chains) {
    let connected = false;
    for (const index of chain) {
      const joint = jointsOnScreen[index];
      if (joint) {
        if (connected) g.lineTo(...joint);
        else g.moveTo(...joint);
      }
      connected = Boolean(joint);
    }
  }
  g.strokeStyle = "rgba(14,41,37,.8)";
  g.lineWidth = 5;
  g.stroke();
  g.strokeStyle = "#8ce9dc";
  g.lineWidth = 2.5;
  g.stroke();
  for (const index of joints) {
    const joint = jointsOnScreen[index];
    if (!joint) continue;
    g.beginPath();
    g.arc(...joint, index < 11 ? 3 : 4, 0, 2*Math.PI);
    g.fillStyle = "#d2fff6";
    g.fill();
    g.strokeStyle = "#20534d";
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.restore();
}

export class Lean {
  constructor() { this.reset(); }
  reset() {
    this.zero = null;
    this.samples = [];
    this.direction = 0;
    this.angle = 0;
    this.seen = -Infinity;
    this.landmarks = null;
    this.frameTime = -Infinity;
    this.pose = null;
  }
  update(points, w, h, now) {
    if (now - this.seen > 1200 && this.pose) this.reset();
    this.landmarks = points?.length ? points : null;
    this.frameTime = now;
    if (!this.landmarks) return;
    const sideScore = i => Math.min(points[11+i].visibility, points[23+i].visibility);
    const side = sideScore(1) > sideScore(0) ? 1 : 0;
    const s = points[11+side], hip = points[23+side];
    if (!visible(s) || !visible(hip) || hip.y-s.y < .08) return;
    const nose = points[0], ear = points[7+side];
    if (visible(nose) && visible(ear) && Math.abs(nose.x-ear.x) * w > (hip.y-s.y) * h * .065) {
      const facing = Math.sign(nose.x-ear.x);
      if (this.direction && this.direction !== facing) {
        this.zero = null;
        this.samples = [];
      }
      this.direction = facing;
    }
    this.seen = now;
    this.pose = {s, hip};
    const raw = Math.atan2((s.x-hip.x)*w,(hip.y-s.y)*h) * 180/Math.PI;
    if (!this.direction) return;
    if (this.zero === null) {
      if (Math.abs(raw) > 14) { this.samples = []; return; }
      this.samples.push(raw);
      if (this.samples.length < 6) return;
      this.zero = [...this.samples].sort((a,b)=>a-b)[3];
    }
    const backward = Math.max(0, -this.direction*(raw-this.zero));
    this.angle += .38 * (Math.min(50, backward)-this.angle);
  }
  status(now, previous) {
    if (!this.landmarks || now - this.frameTime > 500) return "Step into view";
    if (!this.pose || this.seen !== this.frameTime || this.zero === null)
      return "Stand upright, side-on";
    if (Math.round(this.amount(now)*100) === 100 ||
        (previous === "maximum lean reached" && this.angle >= 28))
      return "maximum lean reached";
    if (this.angle >= 4 || (previous === "leaning back" && this.angle > 2))
      return "leaning back";
    return "upright";
  }
  amount(now) { return now-this.seen < 500 ? Math.min(1,this.angle/30) : 0; }
}

export function paintPose(canvas, video, lean, now) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio,2);
  if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) {
    canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
  }
  const g=canvas.getContext("2d");
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,w,h);
  if (!lean.landmarks || now - lean.frameTime > 500 || !video.videoWidth) return;
  const scale=Math.min(w/video.videoWidth,h/video.videoHeight);
  const vw=scale*video.videoWidth, vh=scale*video.videoHeight;
  const xy=p=>[(w-vw)/2+(1-p.x)*vw,(h-vh)/2+p.y*vh];
  drawSkeleton(g, lean.landmarks, xy);
  if (!lean.pose || lean.seen !== lean.frameTime) return;
  const [hx,hy]=xy(lean.pose.hip), [sx,sy]=xy(lean.pose.s);
  const length=Math.hypot(sx-hx,sy-hy), radius=Math.min(68,length*.48);
  g.lineCap="round";
  g.strokeStyle="#ffffffbb"; g.lineWidth=1.5; g.setLineDash([4,6]);
  g.beginPath();g.moveTo(hx,hy);g.lineTo(hx,hy-length);g.stroke();g.setLineDash([]);
  const end=Math.atan2(sy-hy,sx-hx);
  g.beginPath();g.moveTo(hx,hy);g.arc(hx,hy,radius,-Math.PI/2,end,end < -Math.PI/2);g.closePath();
  g.fillStyle="rgba(202,255,127,.25)";g.fill();
  g.strokeStyle="#cdff84";g.lineWidth=3;g.beginPath();g.moveTo(hx,hy);g.lineTo(sx,sy);g.stroke();
  for (const [x,y] of [[hx,hy],[sx,sy]]) {
    g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fillStyle="#cdff84";g.fill();
  }
  if (lean.zero !== null) {
    g.font="600 19px 'Segoe UI', sans-serif";g.fillStyle="#cdff84";g.shadowBlur=4;g.shadowColor="#243028";
    g.fillText(Math.round(lean.angle)+"°",Math.min(w-50,hx+12),hy+6);g.shadowBlur=0;
  }
}
