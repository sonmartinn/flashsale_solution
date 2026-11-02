async function request(path, options) {
  const res = await fetch(`/api${path}`, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Lỗi ${res.status}`);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
