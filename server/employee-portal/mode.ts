// Explicit opt-in, never enabled by an absent/unknown NODE_ENV or a deployment.
export function developmentOtpEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" &&
    env.EMPLOYEE_PORTAL_DEV_OTP === "true" &&
    env.REPLIT_DEPLOYMENT !== "1";
}
