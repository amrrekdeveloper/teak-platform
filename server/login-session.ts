export const REMEMBERED_LOGIN_MS = 30 * 24 * 60 * 60 * 1000;

/** The browser receives only the signed HttpOnly session cookie, not credentials. */
export function setLoginPersistence(session:{cookie:{maxAge?:number|null};rememberMe?:boolean},rememberMe:boolean) {
  session.rememberMe=rememberMe;
  session.cookie.maxAge=rememberMe?REMEMBERED_LOGIN_MS:null;
}
