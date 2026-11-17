// Own the serial stream and its heartbeat separately from camera inference.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const encoder = new TextEncoder();
const low = 1300, high = 1450, beltSpeed = 0;
const status = /^(STOPPED|CALIBRATING|ARMED) pulse_us=(\d+) low=(\d+) high=(\d+) speed=(\d+) input=(live|idle)$/;
let port, reader, writer, readTask, pending, heartbeat, identified = false, closing = false;
let amount = 0, poseTime = -Infinity, lastStatus = 0, writing = false, decide;
const send = line => writer.write(encoder.encode(line + "\n"));

function accept(line) {
  if (pending && (pending.pattern.test(line) || line.startsWith("ERR"))) {
    pending.receive(line);
    return;
  }
  if (!heartbeat) return;
  if (line.startsWith("ERR")) { closeSession(line); return; }
  const m = status.exec(line);
  if (!m) return;
  if (m[1] !== "ARMED" || +m[3] !== low || +m[4] !== high) {
    closeSession("Uno calibration or arm state changed. Reconnect."); return;
  }
  lastStatus = performance.now();
  postMessage({type:"status", feedback:Math.max(0, Math.min(1,(+m[2]-low)/(high-low))),
    running:m[6] === "live" && +m[5] === beltSpeed});
}

async function readLines() {
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!closing) {
      const {value,done} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value,{stream:true});
      let end;
      while ((end=buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0,end).trim()); buffer=buffer.slice(end+1);
      }
      if (buffer.length>1024) buffer="";
    }
  } finally {
    if (!closing) void closeSession("USB disconnected. Reconnect the Uno.");
  }
}

function command(line, pattern, timeout=1500) {
  if (closing) throw Error("Connection closed.");
  return new Promise((resolve,reject)=>{
    const finish = (fn, value) => {
      clearTimeout(timer); pending=null; fn(value);
    };
    const timer=setTimeout(()=>finish(reject, Error("No reply to "+line)),timeout);
    pending={pattern, receive:value=>finish(resolve,value), cancel:()=>finish(reject,Error("Connection closed."))};
    send(line).catch(error=>{if (pending?.pattern===pattern) finish(reject,error);});
  }).then(reply=>{
    if(reply.startsWith("ERR") && reply!=="ERR send STOP before CHECK") throw Error(reply);
    return reply;
  });
}

async function tick() {
  if (closing || writing) return;
  writing = true;
  try {
    if (performance.now()-lastStatus>3000) throw Error("Uno stopped reporting status. Reconnect USB.");
    const value=performance.now()-poseTime<650 ? amount : 0;
    await send("LEAN "+value+"\nSTATUS");
  } catch(error){void closeSession(error.message);}
  finally {writing=false;}
}

async function openSession(info) {
  const ports=await navigator.serial.getPorts();
  const matches=ports.filter(p=>{
    const id=p.getInfo();return id.usbVendorId===info.usbVendorId && id.usbProductId===info.usbProductId;
  });
  if(matches.length!==1) throw Error("Choose the Uno with only one matching USB board connected.");
  port=matches[0];
  await port.open({baudRate:115200});
  reader=port.readable.getReader();writer=port.writable.getWriter();
  readTask=readLines().catch(()=>{});
  for(let i=0;i<8 && !identified;i++){
    try {
      const reply=await command("CHECK 37",/^CHECK 37$/,450);
      identified=reply==="CHECK 37" || reply==="ERR send STOP before CHECK";
    } catch(error){if(closing || !error.message.startsWith("No reply"))throw error;}
  }
  if(!identified) throw Error("Upload the camera sketch, close Serial Monitor, then reconnect.");
  await command("STOP",/^STOPPED$/);
  const m=status.exec(await command("STATUS",status));
  if(+m[3]!==low || +m[4]!==high) {
    throw Error("Upload the updated camera sketch (" + low + " to " + high + " microseconds), then reconnect.");
  }
  if(+m[5]!==beltSpeed) await command("SPEED "+beltSpeed,status);
  await command("ARM",/^ARMED$/);
  await send("LEAN 0");
  const first=status.exec(await command("STATUS",status));
  if(first[1]!=="ARMED" || first[6]!=="live" || +first[5]!==beltSpeed) throw Error("Uno did not confirm live motor control.");
  lastStatus=performance.now();
  heartbeat=setInterval(tick,120);
  postMessage({type:"ready"});
  accept(first[0]);
}

async function closeSession(error) {
  if(closing)return;
  closing=true;clearInterval(heartbeat);heartbeat=null;
  if(decide)decide(false);
  if(pending)pending.cancel();
  try {
    if (identified && writer) await send("STOP");
  } catch {}
  try {await reader?.cancel();await readTask;} catch {}
  reader?.releaseLock();writer?.releaseLock();
  try {await port?.close();} catch {}
  postMessage({type:"closed",error});
}

self.onmessage=({data})=>{
  if(data.type==="open")openSession(data.info).catch(e=>closeSession(e.message));
  if(data.type==="setup")decide?.(data.approved);
  if(data.type==="lean"){amount=Math.max(0,Math.min(100,Math.round(data.value*100)));poseTime=performance.now();}
  if(data.type==="close")void closeSession();
};
