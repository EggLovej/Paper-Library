export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
}

export function getRequestUserAgent(request: Request) {
  return request.headers.get("user-agent");
}

export function getRequestIdentifier(request: Request) {
  return getRequestIp(request) ?? "unknown";
}
