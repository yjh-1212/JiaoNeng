let csrf = "";
import {present,businessText} from './presentation';
export const driverPortal = /^\/driver\/?$/.test(location.pathname);
export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export async function request(url, { method = "GET", body, key, signal, dataView='operational' } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        "X-Client-Portal": driverPortal ? "driver" : "pc",
        "X-Data-View":dataView,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" && csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError")
      throw new ApiError("已停止分析，输入已保留", 0, "CANCELLED");
    throw new ApiError(
      "网络连接中断，输入已保留；写入结果请先核查",
      0,
      "NETWORK",
    );
  }
  const result = await response
    .json()
    .catch(() => ({ message: "服务响应不可读取" }));
  if (!response.ok)
    throw new ApiError(
      businessText(result.message || "请求失败"),
      response.status,
      result.code,
      result.details,
    );
  if (result.csrf) csrf = result.csrf;
  return present(result);
}
export const command = (type, id, payload = {}, key = crypto.randomUUID()) =>
  request("/api/commands", {
    method: "POST",
    body: { type, id, payload },
    key,
  });
export const list = (resource, params = {}) =>
  request(
    "/api/resources/" +
      resource +
      "?" +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v != null && v !== ""),
        ),
      ),
  );
export const detail = (resource, id) =>
  request("/api/resources/" + resource + "/" + id);
