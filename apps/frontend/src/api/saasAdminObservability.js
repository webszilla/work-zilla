export async function fetchObservabilitySummary({ days = 7, org_id = null, product = null } = {}) {
  const params = new URLSearchParams();
  if (days) {
    params.set("days", String(days));
  }
  if (org_id) {
    params.set("org_id", String(org_id));
  }
  if (product) {
    params.set("product", product);
  }

  const response = await fetch(`/api/saas-admin/observability/summary?${params.toString()}`, {
    credentials: "include"
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.assign("/auth/login/");
    }
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  if (response.status === 403) {
    const err = new Error("Not authorized");
    err.status = 403;
    throw err;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}
