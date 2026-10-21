import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach,describe,expect,it,vi } from "vitest";
const html=readFileSync(new URL("../../public/employee-portal.html",import.meta.url),"utf8");
const source=html.match(/<script id="employee-location-helper">([\s\S]*?)<\/script>/)![1];
function setup(){
  vi.useFakeTimers();
  let success:(position:any)=>void=()=>{},failure:(error:any)=>void=()=>{};
  const geo={watchPosition:vi.fn((s:(position:any)=>void,f:(error:any)=>void,_options?:object)=>{success=s;failure=f;return 17}),clearWatch:vi.fn()};
  const window:any={};
  vm.runInNewContext(source,{window,navigator:{geolocation:geo},setTimeout,clearTimeout,Date});
  return {geo,get:window.TeakLocation.getAccuratePosition,
    emit:(accuracy:number,timestamp=Date.now())=>success({coords:{latitude:24.7136,longitude:46.6753,accuracy},timestamp}),
    fail:(code:number)=>failure({code})};
}
afterEach(()=>vi.useRealTimers());
describe("mobile attendance location acquisition",()=>{
  it("removes manual period selection and sends no user-selected period",()=>{
    expect(html).not.toContain('id="attendance-shift"');
    expect(html).not.toContain('getCurrentPosition(');
  });
  it("waits for accuracy to improve instead of submitting the first coarse reading",async()=>{
    const s=setup(),progress=vi.fn(),result=s.get({onProgress:progress});
    const settled=vi.fn();result.then(settled);
    s.emit(1200);s.emit(90);await Promise.resolve();expect(settled).not.toHaveBeenCalled();
    s.emit(12);expect((await result).coords.accuracy).toBe(12);
    expect(s.geo.clearWatch).toHaveBeenCalledWith(17);
    expect(s.geo.watchPosition.mock.calls[0][2]).toMatchObject({enableHighAccuracy:true,maximumAge:0});
    expect(progress.mock.calls.map(c=>c[0])).toEqual([1200,90,12]);
  });
  it("does not weaken the 50 meter limit, and reports actual best accuracy",async()=>{
    const s=setup(),p=s.get({timeoutMs:100});const check=expect(p).rejects.toThrow(/80.*50/);
    s.emit(1000);s.emit(80);s.emit(200);await vi.advanceTimersByTimeAsync(100);await check;
    expect(s.geo.clearWatch).toHaveBeenCalledWith(17);
  });
  it("distinguishes denied location permission and releases the watcher",async()=>{
    const s=setup(),p=s.get();const check=expect(p).rejects.toThrow(/لم يُسمح/);
    s.fail(1);await check;expect(s.geo.clearWatch).toHaveBeenCalledWith(17);
  });
  it("recovers from a temporarily unavailable reading",async()=>{
    const s=setup(),p=s.get();s.fail(2);s.emit(5);expect((await p).coords.accuracy).toBe(5);
  });
  it("never submits an expired reading, even if accurate",async()=>{
    const s=setup(),p=s.get({timeoutMs:100});const check=expect(p).rejects.toThrow(/وقت قراءة الموقع/);
    s.emit(5,Date.now()-120000);await vi.advanceTimersByTimeAsync(100);await check;
  });
  it("reports a timeout without claiming the employee disabled location",async()=>{
    const s=setup(),p=s.get({timeoutMs:100});const check=expect(p).rejects.toThrow(/خلال المهلة/);
    await vi.advanceTimersByTimeAsync(100);await check;expect(s.geo.clearWatch).toHaveBeenCalled();
  });
  it("cleans up even when the browser returns a cached fix synchronously",async()=>{
    const s=setup();s.geo.watchPosition.mockImplementationOnce((success:any)=>{success({coords:{latitude:24,longitude:46,accuracy:5},timestamp:Date.now()});return 18});
    await s.get();expect(s.geo.clearWatch).toHaveBeenCalledWith(18);
  });
});
