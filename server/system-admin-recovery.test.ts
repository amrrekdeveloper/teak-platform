import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),release:vi.fn()}));
vi.mock("./db",()=>({pool:{connect:mocks.connect}}));
import {recoverSystemAdminPassword} from "./system-admin-recovery";
import {tokenHash} from "./employee-portal/security";
const request="f8c6c82b-48f6-49ee-84ec-403972bdf4e2";
// Synthetic row only; never connects to the real account.
const owner={id:9001,username:"khalid90",role:"owner",active:true,archived:false};
const tools={hashPassword:vi.fn(async()=>"fixture-derived-hash.fixture-salt")};
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("REPLIT_DEPLOYMENT","1");
  vi.stubEnv("TEAK_SYSTEM_ADMIN_USERNAME",owner.username);
  vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_ID","");
  vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ID",request);
  vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ENABLED","production");
  vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ID","");
  vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ENABLED","");
  vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","Synthetic1!recovery");
  mocks.connect.mockResolvedValue({query:mocks.query,release:mocks.release});
  mocks.query.mockImplementation(async(sql:string)=>{
    if(sql.includes("FROM teak_system_admin a JOIN users"))return{rows:[owner],rowCount:1};
    if(sql.includes("to_regclass"))return{rows:[{sessions:"user_sessions",limits:"employee_portal_limits"}],rowCount:1};
    if(sql.startsWith("UPDATE users"))return{rows:[{id:owner.id}],rowCount:1};
    return{rows:[],rowCount:0};
  });
});
afterEach(()=>vi.unstubAllEnvs());
describe("explicit one-time environment-scoped owner recovery",()=>{
  it.each([["development","1"],["production","0"],["test","1"]])("does nothing in %s / deployment %s",async(mode,deployed)=>{
    vi.stubEnv("NODE_ENV",mode);vi.stubEnv("REPLIT_DEPLOYMENT",deployed);
    expect(await recoverSystemAdminPassword(tools)).toBe("disabled");
    expect(mocks.connect).not.toHaveBeenCalled();expect(tools.hashPassword).not.toHaveBeenCalled();
  });
  it("does not recover just because the pending shared password exists",async()=>{
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ID","");
    expect(await recoverSystemAdminPassword(tools)).toBe("disabled");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each([["TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ID","not-a-request-id"],
    ["TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","short"],
    ["TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD",""],
    ["TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","aa1!xx"],
    ["TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","AA1!XX"],
    ["TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","Aa!!xx"],
    ["TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","Aa12xx"]])("rejects invalid %s without touching the database",async(key,value)=>{
    vi.stubEnv(key,value);
    expect(await recoverSystemAdminPassword(tools)).toBe("invalid_configuration");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(["", "fixture_owner", "Khalid90", "khalid90 "])("rejects a different configured identity: %s",async value=>{
    vi.stubEnv("TEAK_SYSTEM_ADMIN_USERNAME",value);
    expect(await recoverSystemAdminPassword(tools)).toBe("account_mismatch");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("accepts a six-character password in explicitly authorized development",async()=>{
    vi.stubEnv("NODE_ENV","development");vi.stubEnv("REPLIT_DEPLOYMENT","0");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ENABLED","development");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ID",request);
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","Aa1!xx");
    expect(await recoverSystemAdminPassword(tools)).toBe("applied");
  });
  it.each(["", "true", "development"])("does not accept production consent %s",async value=>{
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ENABLED",value);
    expect(await recoverSystemAdminPassword(tools)).toBe("disabled");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("ignores the retired unscoped request even with the shared password",async()=>{
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ID","");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_ID",request);
    expect(await recoverSystemAdminPassword(tools)).toBe("disabled");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("does not transfer development consent to production",async()=>{
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PRODUCTION_ENABLED","");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ENABLED","development");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_DEVELOPMENT_ID",request);
    expect(await recoverSystemAdminPassword(tools)).toBe("disabled");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each([{...owner,username:"another_owner"},{...owner,role:"hr"},{...owner,active:false},{...owner,archived:true}])
    ("never rebinds, promotes or reactivates an ineligible account %#",async(account)=>{
      mocks.query.mockImplementation(async(sql:string)=>sql.includes("FROM teak_system_admin a JOIN users")
        ?{rows:[account],rowCount:1}:{rows:[],rowCount:0});
      expect(await recoverSystemAdminPassword(tools)).toBe("account_mismatch");
      expect(tools.hashPassword).not.toHaveBeenCalled();
      expect(mocks.query.mock.calls.some(([sql])=>sql==="ROLLBACK")).toBe(true);
    });
  it("requires an already designated owner",async()=>{
    mocks.query.mockResolvedValue({rows:[],rowCount:0});
    expect(await recoverSystemAdminPassword(tools)).toBe("account_mismatch");
    expect(tools.hashPassword).not.toHaveBeenCalled();
  });
  it("hashes the new password, revokes only that owner's sessions and counter, and audits atomically",async()=>{
    expect(await recoverSystemAdminPassword(tools)).toBe("applied");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE users SET password=$2"),
      [owner.id,"fixture-derived-hash.fixture-salt"]);
    expect(mocks.query).toHaveBeenCalledWith("DELETE FROM user_sessions WHERE sess->>'userId'=$1",[String(owner.id)]);
    expect(mocks.query).toHaveBeenCalledWith("DELETE FROM employee_portal_limits WHERE key=$1",
      [`hr-login-user:${tokenHash(owner.username)}`]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO teak_system_admin_audit"),
      [owner.id,`owner_password_recovery:${request}`]);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("Synthetic1!recovery");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("does not replay a consumed request after another password change or restart",async()=>{
    const original=mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async(sql:string,...params:unknown[])=>sql.startsWith("SELECT 1 FROM teak_system_admin_audit")
      ?{rows:[{exists:1}],rowCount:1}:original(sql,...params));
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD","Another1!synthetic");
    expect(await recoverSystemAdminPassword(tools)).toBe("already_applied");
    expect(tools.hashPassword).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql])=>/^(UPDATE|DELETE|INSERT)/.test(sql))).toBe(false);
  });
  it("rolls back when the audit write fails instead of leaving an unaudited reset",async()=>{
    const original=mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async(sql:string,...params:unknown[])=>{
      if(sql.startsWith("INSERT INTO teak_system_admin_audit"))throw new Error("synthetic-sensitive-db-error");
      return original(sql,...params);
    });
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      expect(await recoverSystemAdminPassword(tools)).toBe("failed");
      expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
      expect(mocks.query.mock.calls.some(([sql])=>sql==="COMMIT")).toBe(false);
      expect(log).not.toHaveBeenCalled();expect(mocks.release).toHaveBeenCalledOnce();
    }finally{log.mockRestore();}
  });
  it("contains connection failures without logging credential-bearing errors",async()=>{
    mocks.connect.mockRejectedValue(new Error("synthetic-sensitive-connection-error"));
    expect(await recoverSystemAdminPassword(tools)).toBe("failed");
  });
});
