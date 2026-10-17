// Browser sessions persist across reloads. Never render untrusted HTML in this application.
export const authStorage = {
  async getItem(key: string) {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};
