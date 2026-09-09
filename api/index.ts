import type { ApiRequest, ApiResponse } from "../server/_lib/http.js";
import { ApiError, handleError } from "../server/_lib/http.js";

import accountEntitlements from "../server/routes/account/entitlements.js";
import adminAdsSave from "../server/routes/admin/ads/save.js";
import adminAnnouncementsSave from "../server/routes/admin/announcements/save.js";
import adminAuthBootstrap from "../server/routes/admin/auth/bootstrap.js";
import adminAuthLogin from "../server/routes/admin/auth/login.js";
import adminAuthLogout from "../server/routes/admin/auth/logout.js";
import adminAuthMe from "../server/routes/admin/auth/me.js";
import adminCatalog from "../server/routes/admin/catalog.js";
import adminDashboard from "../server/routes/admin/dashboard.js";
import adminFeaturesSave from "../server/routes/admin/features/save.js";
import adminFeaturesSetPlan from "../server/routes/admin/features/set-plan.js";
import adminPlansSave from "../server/routes/admin/plans/save.js";
import adminSettingsSave from "../server/routes/admin/settings/save.js";
import adminUsersAssignPlan from "../server/routes/admin/users/assign-plan.js";
import adminUsersList from "../server/routes/admin/users/list.js";
import adminUsersRevokeSessions from "../server/routes/admin/users/revoke-sessions.js";
import adminUsersStorageLimit from "../server/routes/admin/users/storage-limit.js";
import adminUsersStatus from "../server/routes/admin/users/status.js";
import authConfirmReset from "../server/routes/auth/confirm-reset.js";
import authChangePin from "../server/routes/auth/change-pin.js";
import authDeleteAccount from "../server/routes/auth/delete-account.js";
import authLogin from "../server/routes/auth/login.js";
import authRegister from "../server/routes/auth/register.js";
import authRequestReset from "../server/routes/auth/request-reset.js";
import authVerifyEmail from "../server/routes/auth/verify-email.js";
import configRuntime from "../server/routes/config/runtime.js";
import exportEmail from "../server/routes/export/email.js";
import friendsBlock from "../server/routes/friends/block.js";
import friendsConnect from "../server/routes/friends/connect.js";
import friendsList from "../server/routes/friends/list.js";
import friendsMirror from "../server/routes/friends/mirror.js";
import friendsRemove from "../server/routes/friends/remove.js";
import friendsRequest from "../server/routes/friends/request.js";
import friendsRespond from "../server/routes/friends/respond.js";
import friendsVerify from "../server/routes/friends/verify.js";
import notificationsSubscribe from "../server/routes/notifications/subscribe.js";
import notificationsUnsubscribe from "../server/routes/notifications/unsubscribe.js";
import settlementsList from "../server/routes/settlements/list.js";
import settlementsRequestRepayment from "../server/routes/settlements/request-repayment.js";
import settlementsRespondRepayment from "../server/routes/settlements/respond-repayment.js";
import storageClear from "../server/routes/storage/clear.js";
import storageSign from "../server/routes/storage/sign.js";
import storageUpload from "../server/routes/storage/upload.js";
import storageUsage from "../server/routes/storage/usage.js";
import syncPull from "../server/routes/sync/pull.js";
import syncPush from "../server/routes/sync/push.js";
import transactionsUpdate from "../server/routes/transactions/update.js";

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

const routes: Record<string, Handler> = {
  "account/entitlements": accountEntitlements,
  "admin/ads/save": adminAdsSave,
  "admin/announcements/save": adminAnnouncementsSave,
  "admin/auth/bootstrap": adminAuthBootstrap,
  "admin/auth/login": adminAuthLogin,
  "admin/auth/logout": adminAuthLogout,
  "admin/auth/me": adminAuthMe,
  "admin/catalog": adminCatalog,
  "admin/dashboard": adminDashboard,
  "admin/features/save": adminFeaturesSave,
  "admin/features/set-plan": adminFeaturesSetPlan,
  "admin/plans/save": adminPlansSave,
  "admin/settings/save": adminSettingsSave,
  "admin/users/assign-plan": adminUsersAssignPlan,
  "admin/users/list": adminUsersList,
  "admin/users/revoke-sessions": adminUsersRevokeSessions,
  "admin/users/storage-limit": adminUsersStorageLimit,
  "admin/users/status": adminUsersStatus,
  "auth/confirm-reset": authConfirmReset,
  "auth/change-pin": authChangePin,
  "auth/delete-account": authDeleteAccount,
  "auth/login": authLogin,
  "auth/register": authRegister,
  "auth/request-reset": authRequestReset,
  "auth/verify-email": authVerifyEmail,
  "config/runtime": configRuntime,
  "export/email": exportEmail,
  "friends/block": friendsBlock,
  "friends/connect": friendsConnect,
  "friends/list": friendsList,
  "friends/mirror": friendsMirror,
  "friends/remove": friendsRemove,
  "friends/request": friendsRequest,
  "friends/respond": friendsRespond,
  "friends/verify": friendsVerify,
  "notifications/subscribe": notificationsSubscribe,
  "notifications/unsubscribe": notificationsUnsubscribe,
  "settlements/list": settlementsList,
  "settlements/request-repayment": settlementsRequestRepayment,
  "settlements/respond-repayment": settlementsRespondRepayment,
  "storage/clear": storageClear,
  "storage/sign": storageSign,
  "storage/upload": storageUpload,
  "storage/usage": storageUsage,
  "sync/pull": syncPull,
  "sync/push": syncPush,
  "transactions/update": transactionsUpdate,
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function routePath(req: ApiRequest) {
  const rewrittenPath = firstQueryValue(req.query?.path);
  if (rewrittenPath) return rewrittenPath.replace(/^\/+|\/+$/g, "");

  const rawUrl = (req as ApiRequest & { url?: string }).url || "";
  const url = new URL(rawUrl, "http://localhost");
  return url.pathname.replace(/^\/api\/?/, "").replace(/^index\/?/, "").replace(/\/+$/g, "");
}

function setCorsHeaders(res: ApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const path = routePath(req);
    const route = routes[path];
    if (!route) throw new ApiError(404, "API route not found.");
    await route(req, res);
  } catch (error) {
    handleError(res, error);
  }
}
