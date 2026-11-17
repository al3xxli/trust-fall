export class Controller {
  constructor(onError) {
    this.onError=onError;
    this.active=false;
    this.running=null;
    this.feedback=0;
    this.closing=false;
  }

  async connect() {
    if(!navigator.serial) throw Error("Open the demo in desktop Chrome or Edge.");
    const selected=await navigator.serial.requestPort();
    const worker=new Worker(new URL("./serial-worker.js",import.meta.url),{type:"module"});
    this.worker=worker;
    this.closed=new Promise(resolve=>{this.finishClose=resolve;});
    await new Promise((resolve,reject)=>{
      const finish=message=>{
        const wasActive=this.active;
        worker.terminate();this.worker=null;this.active=false;this.running=false;
        this.closing=false;this.finishClose();
        if(wasActive){if(message)this.onError(message);}
        else reject(Error(message || "Connection canceled."));
      };
      worker.onerror=()=>finish("USB worker stopped. Reconnect the Uno.");
      worker.onmessage=({data})=>{
        switch(data.type){
          case "ready": this.active=true;this.running=true;resolve();break;
          case "status": this.feedback=data.feedback;this.running=data.running;break;
          case "closed": finish(data.error);break;
        }
      };
      worker.postMessage({type:"open",info:selected.getInfo()});
    });
  }

  drive(value){if(this.active)this.worker.postMessage({type:"lean",value});}

  async close(){
    if(!this.worker)return;
    if(!this.closing){
      this.closing=true;
      this.worker.postMessage({type:"close"});
    }
    await this.closed;
  }
}
