import { Lean, makeTracker, paintPose } from "./pose.js";
import { mountMachine } from "./machine.js";
import { Controller } from "./controller.js";

const get=id=>document.getElementById(id);
const video=document.querySelector("video"), overlay=get("pose");
const start=get("start"), usb=get("usb"), notice=get("notice");
const board=new Controller(), lean=new Lean(), state={running:false,tilt:0};
const syncLap=mountMachine(get("drawing"),state);
const poseStatus=get("pose-status");
function showPoseStatus(text) {
  if (poseStatus.textContent !== text) poseStatus.textContent=text;
}
let tracker, stream, cameraOn=false, connecting=false, busyCamera=false;
let lastFrame=-1, lastDetect=0, frameId=0, generation=0;

function buttons(){
  start.textContent=cameraOn?"Stop camera":"Start camera";
  start.disabled=busyCamera || connecting;
  usb.textContent=connecting?"Connecting…":board.active?"Stop mechanism":"Connect Uno";
  usb.disabled=!cameraOn || connecting || board.closing;
  usb.setAttribute("aria-pressed",String(board.active));
}

async function stopBoard(){
  await board.close();
  buttons();
}

async function stopCamera(){
  ++generation;
  cancelAnimationFrame(frameId);
  cameraOn=false;
  showPoseStatus("Start the camera to begin");
  state.running=false;state.tilt=0;
  stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
  lean.reset();paintPose(overlay,video,lean,performance.now());
  await stopBoard();
  buttons();
}

function frame(now){
  if (!cameraOn) return;
  try {
    if(video.readyState>=2 && video.currentTime!==lastFrame && now-lastDetect>=68){
      lastFrame=video.currentTime;lastDetect=now;
      lean.update(tracker.detectForVideo(video,now).landmarks[0],video.videoWidth,video.videoHeight,now);
    }
    showPoseStatus(lean.status(now,poseStatus.textContent));
    state.tilt=board.active?board.feedback:lean.amount(now);
    state.running=board.active?!!board.running:true;
    paintPose(overlay,video,lean,now);
    frameId=requestAnimationFrame(frame);
  } catch {
    notice.textContent="Tracking interrupted. Start the camera again.";
    stopCamera();
  }
}

start.onclick=async()=>{
  notice.textContent="";
  if(cameraOn){await stopCamera();return;}
  if(busyCamera)return;
  busyCamera=true;buttons();start.textContent="Opening camera…";
  const token=++generation;
  try {
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:"user"}});
    if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=stream;await video.play();
    start.textContent="Loading pose…";
    if(!tracker) tracker=await makeTracker();
    if(token!==generation)return;
    stream.getVideoTracks()[0].onended=()=>{notice.textContent="Camera disconnected.";stopCamera();};
    lastFrame=-1;cameraOn=true;frameId=requestAnimationFrame(frame);
  } catch(error){
    notice.textContent=error.name==="NotAllowedError"?"Allow camera access, then try again.":"Camera or pose model unavailable. Check the webcam and retry.";
    await stopCamera();
  } finally {busyCamera=false;buttons();}
};

usb.onclick=async()=>{
  notice.textContent="";
  if(board.active){await stopBoard();return;}
  connecting=true;buttons();
  const token=generation;
  try {
    await board.connect();
    if(!cameraOn || token!==generation || document.hidden) await board.close();
  } catch(error){
    if(error.name!=="NotFoundError") notice.textContent=error.message || "Close Serial Monitor and reconnect.";
  } finally {connecting=false;buttons();}
};
setInterval(async()=>{
  if(!cameraOn || !board.active || document.hidden)return;
  try {await board.drive(lean.amount(performance.now()));}
  catch(error){notice.textContent=error.message;await stopBoard();}
},120);

document.addEventListener("visibilitychange",()=>{if(document.hidden && board.active) stopBoard();});
window.addEventListener("pagehide",()=>{if(board.active) stopBoard();});
window.addEventListener("keydown",event=>{
  if(event.repeat)return;
  if(event.key==="Escape"){stopBoard();return;}
  if(event.key.toLowerCase()==="b" && state.running) syncLap();
  if(event.key.toLowerCase()==="u") lean.reset();
});
buttons();
