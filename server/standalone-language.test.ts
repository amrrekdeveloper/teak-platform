import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync("client/public/teak-language.js", "utf8");

function mount({ saved = "ar", blocked = false, search = "" } = {}) {
  const listeners: Record<string, Function> = {};
  let onMutation: Function = () => {};
  const root = { lang: "ar", dir: "rtl" };
  const makeElement = (source: string, protectedData = false) => {
    const attributes: Record<string, string> = {};
    const element: any = {
      childNodes: [],
      closest: () => protectedData ? element : null,
      querySelectorAll: () => [],
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
    };
    const node = { nodeType: 3, nodeValue: source, parentElement: element };
    element.childNodes = [node];
    return { element, node, attributes };
  };
  const username = makeElement("اسم المستخدم");
  const live = makeElement("تسجيل الدخول");
  const personal = makeElement("اسم المستخدم", true);
  const padded = makeElement("  كلمة المرور  ");
  const elements = [username, live, personal, padded].map(item => item.element);
  const body = { childNodes: [] };
  const document = {
    documentElement: root,
    body,
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector === "body *" ? elements : [],
  };
  let persisted = saved;
  const storage = {
    getItem() { if (blocked) throw new Error("disabled"); return persisted; },
    setItem(_key: string, value: string) { if (blocked) throw new Error("disabled"); persisted = value; },
  };
  const window: any = {
    location: { search },
    addEventListener(name: string, callback: Function) { listeners[name] = callback; },
    dispatchEvent() {},
    prompt() {},
    confirm() {},
  };
  runInNewContext(runtime, {
    document, window, localStorage: storage, URLSearchParams,
    CustomEvent: class { constructor(public type: string, public options: unknown) {} },
    MutationObserver: class {
      constructor(callback: Function) { onMutation = callback; }
      observe() {}
    },
  });
  return {
    root, api: window.TeakLanguage, username, live, personal, padded, listeners,
    persisted: () => persisted,
    mutate: (node: unknown) => onMutation([{ type: "characterData", target: node }]),
  };
}

describe("standalone Arabic / English language runtime", () => {
  it("switches both directions, preserves whitespace, personal data and the selected language", () => {
    const page = mount();
    page.api.set("en");
    expect(page.root).toEqual({ lang: "en", dir: "ltr" });
    expect(page.username.node.nodeValue).toBe("Username");
    expect(page.padded.node.nodeValue).toBe("  Password  ");
    expect(page.personal.node.nodeValue).toBe("اسم المستخدم");
    expect(page.persisted()).toBe("en");
    page.api.set("ar");
    expect(page.root.dir).toBe("rtl");
    expect(page.username.node.nodeValue).toBe("اسم المستخدم");
  });
  it("translates fresh live text without restoring a stale original status", () => {
    const page = mount({ saved: "en" });
    expect(page.live.node.nodeValue).toBe("Sign in");
    page.live.node.nodeValue = "كلمة المرور";
    page.mutate(page.live.node);
    expect(page.live.node.nodeValue).toBe("Password");
    page.api.set("ar");
    expect(page.live.node.nodeValue).toBe("كلمة المرور");
  });
  it("remains usable when browser storage is disabled", () => {
    const page = mount({ blocked: true });
    page.api.set("en");
    expect(page.root.dir).toBe("ltr");
  });
  it("validates saved language and handles cross-tab updates", () => {
    const page = mount({ saved: "invalid" });
    expect(page.root.lang).toBe("ar");
    page.listeners.storage({ key: "teak-lang", newValue: "en" });
    expect(page.username.node.nodeValue).toBe("Username");
    page.listeners.storage({ key: "teak-lang", newValue: null });
    expect(page.root.dir).toBe("rtl");
  });
  it("allows explicit bilingual links and never translates unknown user content", () => {
    const page = mount({ search: "?lang=en" });
    expect(page.root.lang).toBe("en");
    expect(page.api.translate("Unrecognized employee note")).toBeUndefined();
  });
});
