import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css=readFileSync(new URL("./hr-theme.css",import.meta.url),"utf8");
function luminance(h:number,s:number,l:number){
  s/=100;l/=100;
  const a=s*Math.min(l,1-l);
  const channel=(n:number)=>{
    const k=(n+h/30)%12;
    const value=l-a*Math.max(-1,Math.min(k-3,9-k,1));
    return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  };
  return .2126*channel(0)+.7152*channel(8)+.0722*channel(4);
}
for(const mode of ["light","dark"]){
  describe(`HR ${mode} core palette — WCAG AA`,()=>{
    const block=css.match(new RegExp(`html\\.teak-hr-surface\\.${mode}\\s*\\{([^}]+)\\}`))?.[1]||"";
    const tokens=new Map([...block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)]
      .map(match=>[match[1],luminance(Number(match[2]),Number(match[3]),Number(match[4]))]));
    const pairs=[
      ["foreground","background",4.5],["card-foreground","card",4.5],
      ["popover-foreground","popover",4.5],["muted-foreground","background",4.5],
      ["muted-foreground","card",4.5],["muted-foreground","muted",4.5],
      ["primary-foreground","primary",4.5],["destructive-foreground","destructive",4.5],
      ["input","background",3],["border","card",3],
    ] as const;
    for(const [fg,bg,minimum] of pairs)it(`${fg} / ${bg} ≥ ${minimum}:1`,()=>{
      expect(tokens.has(fg)&&tokens.has(bg)).toBe(true);
      const a=tokens.get(fg)!,b=tokens.get(bg)!;
      expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(minimum);
    });
  });
}
