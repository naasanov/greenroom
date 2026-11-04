/** Paths whose first load kicks off the session requests before React boots. */
const APP_PATHS = "events|library|files|roster|settings|gigs|practices|songs";
const EARLY_PATHS = ["/auth/me", "/bands"];
const MAX_AGE_MS = 10_000;

type EarlyStore = Record<string, { at: number; res: Promise<Response> }>;
type EarlyWindow = Window & { __grEarly?: EarlyStore };

/**
 * Inline head script: preconnects to the API origin and starts /auth/me and
 * /bands in parallel while the JS bundles download. Mirrors `getApiUrl`.
 */
export function earlyFetchScript(configuredApiUrl: string | undefined): string {
  const configured = JSON.stringify(configuredApiUrl?.replace(/\/$/, "") ?? "");
  return `(function(){try{var l=location;if(!/^\\/(${APP_PATHS})(\\/|$)/.test(l.pathname))return;var c=${configured};var o=c;if(!o){var h=l.hostname;o=h==="localhost"||h==="127.0.0.1"?l.protocol+"//"+h+":"+(Number(l.port||(l.protocol==="https:"?443:80))+1000):"https://api."+h}var k=document.createElement("link");k.rel="preconnect";k.href=o;k.crossOrigin="use-credentials";document.head.appendChild(k);var s={};${JSON.stringify(EARLY_PATHS)}.forEach(function(p){var r=fetch(o+p,{credentials:"include"});r.catch(function(){});s[p]={at:Date.now(),res:r}});window.__grEarly=s}catch(e){}})()`;
}

/** Hands over (once) a response the head script started for `path`, if still fresh. */
export function takeEarlyResponse(path: string): Promise<Response> | undefined {
  if (typeof window === "undefined") return undefined;
  const store = (window as EarlyWindow).__grEarly;
  const hit = store?.[path];
  if (!store || !hit) return undefined;
  delete store[path];
  return Date.now() - hit.at < MAX_AGE_MS ? hit.res : undefined;
}
