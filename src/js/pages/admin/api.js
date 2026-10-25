import { app } from "/src/config/config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const functions = getFunctions(app, "us-central1");

function callable(name) {
  const fn = httpsCallable(functions, name);

  return async (data = {}) => {
    try {
      const result = await fn(data);
      return result.data;
    } catch (error) {
      throw new Error(error?.message || "Falha na operação.");
    }
  };
}

export const api = {
  whoAmI: callable("adminWhoAmI"),
  overview: callable("adminOverview"),
  functionMetrics: callable("adminFunctionMetrics"),
  userDetail: callable("adminUserDetail"),
  banUser: callable("adminBanUser"),
  revokeSessions: callable("adminRevokeSessions"),
  setVerified: callable("adminSetVerified"),
  moderateContent: callable("adminModerateContent"),
  resolveReport: callable("adminResolveReport"),
  listAdmins: callable("adminListAdmins"),
  setRole: callable("adminSetRole"),
  setConfig: callable("adminSetConfig"),
  clearErrors: callable("adminClearErrors")
};

export const ROLE_LEVEL = { moderator: 1, admin: 2, owner: 3 };
export const ROLE_LABEL = { moderator: "Moderador", admin: "Admin", owner: "Dono" };

export const session = { uid: null, role: null };

export function can(minRole) {
  return (ROLE_LEVEL[session.role] || 0) >= ROLE_LEVEL[minRole];
}
