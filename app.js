var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/gotrue-js/lib/index.js
function ensureStorageListener() {
  if (!storageListenerActive && isBrowser()) {
    storageListenerActive = true;
    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) {
        currentUser = null;
      }
    });
  }
}
function base64Decode(base64) {
  if (typeof atob === "function") {
    return atob(base64);
  }
  return Buffer.from(base64, "base64").toString("binary");
}
function urlBase64Decode(str) {
  let output = str.replace(/-/g, "+").replace(/_/g, "/");
  switch (output.length % 4) {
    case 0:
      break;
    case 2:
      output += "==";
      break;
    case 3:
      output += "=";
      break;
    default:
      throw new Error("Illegal base64url string!");
  }
  const binaryString = base64Decode(output);
  try {
    const bytes = Uint8Array.from(binaryString, (char) => char.codePointAt(0) ?? 0);
    return new TextDecoder().decode(bytes);
  } catch {
    return binaryString;
  }
}
var HTTPError, TextHTTPError, JSONHTTPError, API, Admin, ExpiryMargin, storageKey, refreshPromises, currentUser, forbiddenUpdateAttributes, forbiddenSaveAttributes, isBrowser, storageListenerActive, User, HTTPRegexp, defaultApiURL, GoTrue;
var init_lib = __esm({
  "node_modules/gotrue-js/lib/index.js"() {
    HTTPError = class extends Error {
      constructor(response) {
        super(response.statusText);
        this.name = "HTTPError";
        this.status = response.status;
      }
    };
    TextHTTPError = class extends HTTPError {
      constructor(response, data) {
        super(response);
        this.name = "TextHTTPError";
        this.data = data;
      }
    };
    JSONHTTPError = class extends HTTPError {
      constructor(response, json) {
        super(response);
        this.name = "JSONHTTPError";
        this.json = json;
      }
    };
    API = class _API {
      constructor(apiURL, options) {
        this.apiURL = apiURL || "";
        this._sameOrigin = /^\/(?!\/)/.test(this.apiURL);
        this.defaultHeaders = options?.defaultHeaders || {};
      }
      headers(headers = {}) {
        return {
          ...this.defaultHeaders,
          "Content-Type": "application/json",
          ...headers
        };
      }
      static async parseJsonResponse(response) {
        const json = await response.json();
        if (!response.ok) {
          throw new JSONHTTPError(response, json);
        }
        return json;
      }
      async request(path, options = {}) {
        const headers = this.headers(options.headers || {});
        if (!options.body) {
          delete headers["Content-Type"];
        }
        const fetchOptions = {
          ...options,
          headers
        };
        if (this._sameOrigin) {
          fetchOptions.credentials = options.credentials || "same-origin";
        }
        const response = await fetch(this.apiURL + path, fetchOptions);
        const contentType = response.headers.get("Content-Type");
        if (contentType?.includes("json")) {
          return _API.parseJsonResponse(response);
        }
        const data = await response.text();
        if (!response.ok) {
          throw new TextHTTPError(response, data);
        }
        return data;
      }
    };
    Admin = class {
      constructor(user) {
        this.user = user;
      }
      listUsers(aud) {
        return this.user._request("/admin/users", {
          method: "GET",
          audience: aud
        });
      }
      getUser(user) {
        return this.user._request(`/admin/users/${user.id}`);
      }
      updateUser(user, attributes = {}) {
        return this.user._request(`/admin/users/${user.id}`, {
          method: "PUT",
          body: JSON.stringify(attributes)
        });
      }
      createUser(email, password, attributes = {}) {
        attributes.email = email;
        attributes.password = password;
        return this.user._request("/admin/users", {
          method: "POST",
          body: JSON.stringify(attributes)
        });
      }
      deleteUser(user) {
        return this.user._request(`/admin/users/${user.id}`, {
          method: "DELETE"
        });
      }
    };
    ExpiryMargin = 60 * 1e3;
    storageKey = "gotrue.user";
    refreshPromises = {};
    currentUser = null;
    forbiddenUpdateAttributes = { api: 1, token: 1, audience: 1, url: 1 };
    forbiddenSaveAttributes = { api: 1 };
    isBrowser = () => typeof window !== "undefined";
    storageListenerActive = false;
    User = class _User {
      constructor(api2, tokenResponse, audience) {
        this.token = null;
        this.api = api2;
        this.url = api2.apiURL;
        this.audience = audience;
        this._processTokenResponse(tokenResponse);
        currentUser = this;
        ensureStorageListener();
      }
      static removeSavedSession() {
        isBrowser() && localStorage.removeItem(storageKey);
      }
      static recoverSession(apiInstance) {
        ensureStorageListener();
        if (currentUser) {
          return currentUser;
        }
        const json = isBrowser() && localStorage.getItem(storageKey);
        if (json) {
          try {
            const data = JSON.parse(json);
            const { url, token, audience } = data;
            if (!url || !token) {
              return null;
            }
            const api2 = apiInstance || new API(url, {});
            return new _User(api2, token, audience)._saveUserData(data, true);
          } catch (error) {
            console.error(new Error(`Gotrue-js: Error recovering session: ${error}`));
            return null;
          }
        }
        return null;
      }
      get admin() {
        return new Admin(this);
      }
      async update(attributes) {
        const response = await this._request("/user", {
          method: "PUT",
          body: JSON.stringify(attributes)
        });
        return this._saveUserData(response)._refreshSavedSession();
      }
      jwt(forceRefresh) {
        const token = this.tokenDetails();
        if (token === null || token === void 0) {
          return Promise.reject(new Error(`Gotrue-js: failed getting jwt access token`));
        }
        const { expires_at, refresh_token, access_token } = token;
        if (forceRefresh || expires_at - ExpiryMargin < Date.now()) {
          return this._refreshToken(refresh_token);
        }
        return Promise.resolve(access_token);
      }
      logout() {
        return this._request("/logout", { method: "POST" }).then(this.clearSession.bind(this)).catch(this.clearSession.bind(this));
      }
      _refreshToken(refresh_token) {
        const existingPromise = refreshPromises[refresh_token];
        if (existingPromise) {
          return existingPromise;
        }
        const refreshRequest = this.api.request("/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=refresh_token&refresh_token=${refresh_token}`
        });
        const timeoutPromise = new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Token refresh timeout")), 3e4);
        });
        const promise = Promise.race([refreshRequest, timeoutPromise]).then((response) => {
          delete refreshPromises[refresh_token];
          this._processTokenResponse(response);
          this._refreshSavedSession();
          if (!this.token) {
            throw new Error("Gotrue-js: Token not set after refresh");
          }
          return this.token.access_token;
        }).catch((error) => {
          delete refreshPromises[refresh_token];
          this.clearSession();
          throw error;
        });
        refreshPromises[refresh_token] = promise;
        return promise;
      }
      async _request(path, options = {}) {
        options.headers = options.headers || {};
        const aud = options.audience || this.audience;
        if (aud) {
          options.headers["X-JWT-AUD"] = aud;
        }
        try {
          const token = await this.jwt();
          return await this.api.request(path, {
            headers: Object.assign(options.headers, {
              Authorization: `Bearer ${token}`
            }),
            ...options
          });
        } catch (error) {
          if (error instanceof JSONHTTPError && error.json) {
            if (error.json.msg) {
              error.message = error.json.msg;
            } else if (error.json.error) {
              error.message = `${error.json.error}: ${error.json.error_description}`;
            }
          }
          throw error;
        }
      }
      async getUserData() {
        const response = await this._request("/user");
        return this._saveUserData(response)._refreshSavedSession();
      }
      _saveUserData(attributes, fromStorage) {
        for (const key in attributes) {
          if (key in _User.prototype || key in forbiddenUpdateAttributes) {
            continue;
          }
          this[key] = attributes[key];
        }
        if (fromStorage) {
          this._fromStorage = true;
        }
        return this;
      }
      _processTokenResponse(tokenResponse) {
        this.token = tokenResponse;
        try {
          const claims = JSON.parse(urlBase64Decode(tokenResponse.access_token.split(".")[1]));
          this.token.expires_at = claims.exp * 1e3;
        } catch (error) {
          console.error(new Error(`Gotrue-js: Failed to parse tokenResponse claims: ${error}`));
        }
      }
      _refreshSavedSession() {
        if (isBrowser() && localStorage.getItem(storageKey)) {
          this._saveSession();
        }
        return this;
      }
      get _details() {
        const userCopy = {};
        for (const key in this) {
          if (key in _User.prototype || key in forbiddenSaveAttributes) {
            continue;
          }
          userCopy[key] = this[key];
        }
        return userCopy;
      }
      _saveSession() {
        isBrowser() && localStorage.setItem(storageKey, JSON.stringify(this._details));
        return this;
      }
      tokenDetails() {
        return this.token;
      }
      clearSession() {
        _User.removeSavedSession();
        this.token = null;
        currentUser = null;
      }
    };
    HTTPRegexp = /^http:\/\//;
    defaultApiURL = `/.netlify/identity`;
    GoTrue = class {
      constructor({
        APIUrl = defaultApiURL,
        audience = "",
        setCookie = false,
        clientName = "gotrue-js"
      } = {}) {
        if (HTTPRegexp.test(APIUrl)) {
          console.warn(
            "Warning:\n\nDO NOT USE HTTP IN PRODUCTION FOR GOTRUE EVER!\nGoTrue REQUIRES HTTPS to work securely."
          );
        }
        if (audience) {
          this.audience = audience;
        }
        this.setCookie = setCookie;
        this.api = new API(APIUrl, { defaultHeaders: { "X-Nf-Client": clientName } });
      }
      async _request(path, options = {}) {
        options.headers = options.headers || {};
        const aud = options.audience || this.audience;
        if (aud) {
          options.headers["X-JWT-AUD"] = aud;
        }
        try {
          return await this.api.request(path, options);
        } catch (error) {
          if (error instanceof JSONHTTPError && error.json) {
            if (error.json.msg) {
              error.message = error.json.msg;
            } else if (error.json.error) {
              error.message = `${error.json.error}: ${error.json.error_description}`;
            }
          }
          throw error;
        }
      }
      settings() {
        return this._request("/settings");
      }
      signup(email, password, data) {
        return this._request("/signup", {
          method: "POST",
          body: JSON.stringify({ email, password, data })
        });
      }
      login(email, password, remember) {
        this._setRememberHeaders(remember);
        return this._request("/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=password&username=${encodeURIComponent(
            email
          )}&password=${encodeURIComponent(password)}`
        }).then((response) => {
          User.removeSavedSession();
          return this.createUser(response, remember);
        });
      }
      loginExternalUrl(provider) {
        return `${this.api.apiURL}/authorize?provider=${provider}`;
      }
      confirm(token, remember) {
        this._setRememberHeaders(remember);
        return this.verify("signup", token, remember);
      }
      requestPasswordRecovery(email) {
        return this._request("/recover", {
          method: "POST",
          body: JSON.stringify({ email })
        });
      }
      recover(token, remember) {
        this._setRememberHeaders(remember);
        return this.verify("recovery", token, remember);
      }
      acceptInvite(token, password, remember) {
        this._setRememberHeaders(remember);
        return this._request("/verify", {
          method: "POST",
          body: JSON.stringify({ token, password, type: "signup" })
        }).then((response) => this.createUser(response, remember));
      }
      acceptInviteExternalUrl(provider, token) {
        return `${this.api.apiURL}/authorize?provider=${provider}&invite_token=${token}`;
      }
      createUser(tokenResponse, remember = false) {
        this._setRememberHeaders(remember);
        const user = new User(this.api, tokenResponse, this.audience || "");
        return user.getUserData().then((userData) => {
          if (remember) {
            userData._saveSession();
          }
          return userData;
        });
      }
      currentUser() {
        const user = User.recoverSession(this.api);
        user && this._setRememberHeaders(user._fromStorage);
        return user;
      }
      async validateCurrentSession() {
        const user = this.currentUser();
        if (!user) {
          return null;
        }
        try {
          return await user.getUserData();
        } catch {
          user.clearSession();
          return null;
        }
      }
      verify(type, token, remember) {
        this._setRememberHeaders(remember);
        return this._request("/verify", {
          method: "POST",
          body: JSON.stringify({ token, type })
        }).then((response) => this.createUser(response, remember));
      }
      _setRememberHeaders(remember) {
        if (this.setCookie) {
          this.api.defaultHeaders = this.api.defaultHeaders || {};
          this.api.defaultHeaders["X-Use-Cookie"] = remember ? "1" : "session";
        }
      }
    };
    if (typeof window !== "undefined") {
      window.GoTrue = GoTrue;
    }
  }
});

// node_modules/@netlify/identity/dist/main.js
var main_exports = {};
__export(main_exports, {
  AUTH_EVENTS: () => AUTH_EVENTS,
  AuthError: () => AuthError,
  MissingIdentityError: () => MissingIdentityError,
  acceptInvite: () => acceptInvite,
  admin: () => admin,
  confirmEmail: () => confirmEmail,
  getIdentityConfig: () => getIdentityConfig,
  getSettings: () => getSettings,
  getUser: () => getUser,
  handleAuthCallback: () => handleAuthCallback,
  hydrateSession: () => hydrateSession,
  isAuthenticated: () => isAuthenticated,
  login: () => login,
  logout: () => logout,
  oauthLogin: () => oauthLogin,
  onAuthChange: () => onAuthChange,
  recoverPassword: () => recoverPassword,
  refreshSession: () => refreshSession,
  requestPasswordRecovery: () => requestPasswordRecovery,
  signup: () => signup,
  updateUser: () => updateUser,
  verifyEmailChange: () => verifyEmailChange,
  verifyRequestOrigin: () => verifyRequestOrigin
});
var __require2, AUTH_PROVIDERS, AuthError, MissingIdentityError, IDENTITY_PATH, goTrueClient, cachedApiUrl, warnedMissingUrl, isBrowser2, discoverApiUrl, getGoTrueClient, getClient, getIdentityContext, NF_JWT_COOKIE, NF_REFRESH_COOKIE, getCookie, setAuthCookies, deleteAuthCookies, setBrowserAuthCookies, deleteBrowserAuthCookies, getServerCookie, nextHeadersFn, triggerNextjsDynamic, DEFAULT_TIMEOUT_MS, fetchWithTimeout, AUTH_EVENTS, GOTRUE_STORAGE_KEY, listeners, emitAuthEvent, storageListenerAttached, attachStorageListener, onAuthChange, REFRESH_MARGIN_S, refreshTimer, startTokenRefresh, stopTokenRefresh, refreshSession, getCookies, getServerIdentityUrl, persistSession, login, signup, logout, oauthLogin, handleAuthCallback, handleOAuthCallback, handleConfirmationCallback, handleRecoveryCallback, handleInviteCallback, handleEmailChangeCallback, clearHash, hydrateSession, toAuthProvider, toOptionalString, toRoles, toUser, claimsToUser, decodeJwtPayload, fetchFullUser, resolveIdentityUrl, getUser, isAuthenticated, getIdentityConfig, getSettings, verifyRequestOrigin, resolveCurrentUser, requestPasswordRecovery, recoverPassword, confirmEmail, acceptInvite, verifyEmailChange, updateUser, SERVER_ONLY_MESSAGE, sanitizeUserId, assertServer, getAdminAuth, adminFetch, listUsers, getUser2, createUser, updateUser2, deleteUser, admin;
var init_main = __esm({
  "node_modules/@netlify/identity/dist/main.js"() {
    init_lib();
    __require2 = /* @__PURE__ */ ((x) => typeof __require !== "undefined" ? __require : typeof Proxy !== "undefined" ? new Proxy(x, {
      get: (a, b) => (typeof __require !== "undefined" ? __require : a)[b]
    }) : x)(function(x) {
      if (typeof __require !== "undefined") return __require.apply(this, arguments);
      throw Error('Dynamic require of "' + x + '" is not supported');
    });
    AUTH_PROVIDERS = ["google", "github", "gitlab", "bitbucket", "facebook", "email"];
    AuthError = class _AuthError extends Error {
      constructor(message, status, options) {
        super(message);
        this.name = "AuthError";
        this.status = status;
        if (options && "cause" in options) {
          this.cause = options.cause;
        }
      }
      static from(error) {
        if (error instanceof _AuthError) return error;
        const message = error instanceof Error ? error.message : String(error);
        return new _AuthError(message, void 0, { cause: error });
      }
    };
    MissingIdentityError = class extends Error {
      constructor(message = "Netlify Identity is not available.") {
        super(message);
        this.name = "MissingIdentityError";
      }
    };
    IDENTITY_PATH = "/.netlify/identity";
    goTrueClient = null;
    warnedMissingUrl = false;
    isBrowser2 = () => typeof window !== "undefined" && typeof window.location !== "undefined";
    discoverApiUrl = () => {
      if (cachedApiUrl !== void 0) return cachedApiUrl;
      if (isBrowser2()) {
        cachedApiUrl = `${window.location.origin}${IDENTITY_PATH}`;
      } else {
        const identityContext = getIdentityContext();
        if (identityContext?.url) {
          cachedApiUrl = identityContext.url;
        } else if (globalThis.Netlify?.context?.url) {
          cachedApiUrl = new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href;
        } else if (typeof process !== "undefined" && process.env?.URL) {
          cachedApiUrl = new URL(IDENTITY_PATH, process.env.URL).href;
        }
      }
      return cachedApiUrl ?? null;
    };
    getGoTrueClient = () => {
      if (goTrueClient) return goTrueClient;
      const apiUrl = discoverApiUrl();
      if (!apiUrl) {
        if (!warnedMissingUrl) {
          console.warn(
            "@netlify/identity: Could not determine the Identity endpoint URL. Make sure your site has Netlify Identity enabled, or run your app with `netlify dev`."
          );
          warnedMissingUrl = true;
        }
        return null;
      }
      goTrueClient = new GoTrue({ APIUrl: apiUrl, setCookie: false });
      return goTrueClient;
    };
    getClient = () => {
      const client = getGoTrueClient();
      if (!client) throw new MissingIdentityError();
      return client;
    };
    getIdentityContext = () => {
      const identityContext = globalThis.netlifyIdentityContext;
      if (identityContext?.url) {
        return {
          url: identityContext.url,
          token: identityContext.token
        };
      }
      if (globalThis.Netlify?.context?.url) {
        return { url: new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href };
      }
      const siteUrl = typeof process !== "undefined" ? process.env?.URL : void 0;
      if (siteUrl) {
        return { url: new URL(IDENTITY_PATH, siteUrl).href };
      }
      return null;
    };
    NF_JWT_COOKIE = "nf_jwt";
    NF_REFRESH_COOKIE = "nf_refresh";
    getCookie = (name) => {
      if (typeof document === "undefined") return null;
      const match = new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`).exec(document.cookie);
      if (!match) return null;
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    };
    setAuthCookies = (cookies, accessToken, refreshToken) => {
      cookies.set({
        name: NF_JWT_COOKIE,
        value: accessToken,
        httpOnly: false,
        secure: true,
        path: "/",
        sameSite: "Lax"
      });
      if (refreshToken) {
        cookies.set({
          name: NF_REFRESH_COOKIE,
          value: refreshToken,
          httpOnly: false,
          secure: true,
          path: "/",
          sameSite: "Lax"
        });
      }
    };
    deleteAuthCookies = (cookies) => {
      cookies.delete(NF_JWT_COOKIE);
      cookies.delete(NF_REFRESH_COOKIE);
    };
    setBrowserAuthCookies = (accessToken, refreshToken) => {
      if (typeof document === "undefined") return;
      document.cookie = `${NF_JWT_COOKIE}=${encodeURIComponent(accessToken)}; path=/; secure; samesite=lax`;
      if (refreshToken) {
        document.cookie = `${NF_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; path=/; secure; samesite=lax`;
      }
    };
    deleteBrowserAuthCookies = () => {
      if (typeof document === "undefined") return;
      document.cookie = `${NF_JWT_COOKIE}=; path=/; secure; samesite=lax; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      document.cookie = `${NF_REFRESH_COOKIE}=; path=/; secure; samesite=lax; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    };
    getServerCookie = (name) => {
      const cookies = globalThis.Netlify?.context?.cookies;
      if (!cookies || typeof cookies.get !== "function") return null;
      return cookies.get(name) ?? null;
    };
    triggerNextjsDynamic = () => {
      if (nextHeadersFn === null) return;
      if (nextHeadersFn === void 0) {
        try {
          if (typeof __require2 === "undefined") {
            nextHeadersFn = null;
            return;
          }
          const mod = __require2("next/headers");
          nextHeadersFn = mod.headers;
        } catch {
          nextHeadersFn = null;
          return;
        }
      }
      const fn = nextHeadersFn;
      if (!fn) return;
      try {
        fn();
      } catch (e) {
        if (e instanceof Error && ("digest" in e || /bail\s*out.*prerende/i.test(e.message))) {
          throw e;
        }
      }
    };
    DEFAULT_TIMEOUT_MS = 5e3;
    fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
      const controller = new AbortController();
      const timer2 = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          const pathname = new URL(url).pathname;
          throw new AuthError(`Identity request to ${pathname} timed out after ${String(timeoutMs)}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timer2);
      }
    };
    AUTH_EVENTS = {
      LOGIN: "login",
      LOGOUT: "logout",
      TOKEN_REFRESH: "token_refresh",
      USER_UPDATED: "user_updated",
      RECOVERY: "recovery"
    };
    GOTRUE_STORAGE_KEY = "gotrue.user";
    listeners = /* @__PURE__ */ new Set();
    emitAuthEvent = (event, user) => {
      for (const listener of listeners) {
        try {
          listener(event, user);
        } catch {
        }
      }
    };
    storageListenerAttached = false;
    attachStorageListener = () => {
      if (storageListenerAttached || !isBrowser2()) return;
      storageListenerAttached = true;
      window.addEventListener("storage", (event) => {
        if (event.key !== GOTRUE_STORAGE_KEY) return;
        if (event.newValue) {
          const client = getGoTrueClient();
          const currentUser2 = client?.currentUser();
          emitAuthEvent(AUTH_EVENTS.LOGIN, currentUser2 ? toUser(currentUser2) : null);
        } else {
          emitAuthEvent(AUTH_EVENTS.LOGOUT, null);
        }
      });
    };
    onAuthChange = (callback) => {
      if (!isBrowser2()) {
        return () => {
        };
      }
      listeners.add(callback);
      attachStorageListener();
      return () => {
        listeners.delete(callback);
      };
    };
    REFRESH_MARGIN_S = 60;
    refreshTimer = null;
    startTokenRefresh = () => {
      if (!isBrowser2()) return;
      stopTokenRefresh();
      const client = getGoTrueClient();
      const user = client?.currentUser();
      if (!user) return;
      const token = user.tokenDetails();
      if (!token?.expires_at) return;
      const nowS = Math.floor(Date.now() / 1e3);
      const expiresAtS = typeof token.expires_at === "number" && token.expires_at > 1e12 ? Math.floor(token.expires_at / 1e3) : token.expires_at;
      const delayMs = Math.max(0, expiresAtS - nowS - REFRESH_MARGIN_S) * 1e3;
      refreshTimer = setTimeout(() => {
        void (async () => {
          try {
            const freshJwt = await user.jwt(true);
            const freshDetails = user.tokenDetails();
            setBrowserAuthCookies(freshJwt, freshDetails?.refresh_token);
            emitAuthEvent(AUTH_EVENTS.TOKEN_REFRESH, toUser(user));
            startTokenRefresh();
          } catch {
            stopTokenRefresh();
          }
        })();
      }, delayMs);
    };
    stopTokenRefresh = () => {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };
    refreshSession = async () => {
      if (isBrowser2()) {
        const client = getGoTrueClient();
        const user = client?.currentUser();
        if (!user) return null;
        const details = user.tokenDetails();
        if (details?.expires_at) {
          const nowS2 = Math.floor(Date.now() / 1e3);
          const expiresAtS = typeof details.expires_at === "number" && details.expires_at > 1e12 ? Math.floor(details.expires_at / 1e3) : details.expires_at;
          if (expiresAtS - nowS2 > REFRESH_MARGIN_S) {
            return null;
          }
        }
        try {
          const jwt = await user.jwt(true);
          setBrowserAuthCookies(jwt, user.tokenDetails()?.refresh_token);
          emitAuthEvent(AUTH_EVENTS.TOKEN_REFRESH, toUser(user));
          startTokenRefresh();
          return jwt;
        } catch {
          stopTokenRefresh();
          return null;
        }
      }
      const accessToken = getServerCookie(NF_JWT_COOKIE);
      const refreshToken = getServerCookie(NF_REFRESH_COOKIE);
      if (!accessToken || !refreshToken) return null;
      const decoded = decodeJwtPayload(accessToken);
      if (!decoded?.exp) return null;
      const nowS = Math.floor(Date.now() / 1e3);
      if (decoded.exp - nowS > REFRESH_MARGIN_S) {
        return null;
      }
      const ctx = getIdentityContext();
      const identityUrl = ctx?.url ?? (globalThis.Netlify?.context?.url ? new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href : null);
      if (!identityUrl) {
        throw new AuthError("Could not determine the Identity endpoint URL for token refresh");
      }
      let res;
      try {
        res = await fetchWithTimeout(`${identityUrl}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString()
        });
      } catch (error) {
        throw AuthError.from(error);
      }
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 400) {
          const cookies2 = globalThis.Netlify?.context?.cookies;
          if (cookies2) {
            deleteAuthCookies(cookies2);
          }
          return null;
        }
        throw new AuthError(errorBody.msg ?? `Token refresh failed (${String(res.status)})`, res.status);
      }
      const data = await res.json();
      const cookies = globalThis.Netlify?.context?.cookies;
      if (cookies) {
        setAuthCookies(cookies, data.access_token, data.refresh_token);
      }
      return data.access_token;
    };
    getCookies = () => {
      const cookies = globalThis.Netlify?.context?.cookies;
      if (!cookies) {
        throw new AuthError("Server-side auth requires Netlify Functions runtime");
      }
      return cookies;
    };
    getServerIdentityUrl = () => {
      const ctx = getIdentityContext();
      if (!ctx?.url) {
        throw new AuthError("Could not determine the Identity endpoint URL on the server");
      }
      return ctx.url;
    };
    persistSession = true;
    login = async (email, password) => {
      if (!isBrowser2()) {
        const identityUrl = getServerIdentityUrl();
        const cookies = getCookies();
        const body = new URLSearchParams({
          grant_type: "password",
          username: email,
          password
        });
        let res;
        try {
          res = await fetchWithTimeout(`${identityUrl}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString()
          });
        } catch (error) {
          throw AuthError.from(error);
        }
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new AuthError(
            errorBody.msg ?? errorBody.error_description ?? `Login failed (${String(res.status)})`,
            res.status
          );
        }
        const data = await res.json();
        const accessToken = data.access_token;
        let userRes;
        try {
          userRes = await fetchWithTimeout(`${identityUrl}/user`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
        } catch (error) {
          throw AuthError.from(error);
        }
        if (!userRes.ok) {
          const errorBody = await userRes.json().catch(() => ({}));
          throw new AuthError(errorBody.msg ?? `Failed to fetch user data (${String(userRes.status)})`, userRes.status);
        }
        const userData = await userRes.json();
        const user = toUser(userData);
        setAuthCookies(cookies, accessToken, data.refresh_token);
        return user;
      }
      const client = getClient();
      try {
        const gotrueUser = await client.login(email, password, persistSession);
        const jwt = await gotrueUser.jwt();
        setBrowserAuthCookies(jwt, gotrueUser.tokenDetails()?.refresh_token);
        const user = toUser(gotrueUser);
        startTokenRefresh();
        emitAuthEvent(AUTH_EVENTS.LOGIN, user);
        return user;
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    signup = async (email, password, data) => {
      if (!isBrowser2()) {
        const identityUrl = getServerIdentityUrl();
        const cookies = getCookies();
        let res;
        try {
          res = await fetchWithTimeout(`${identityUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, data })
          });
        } catch (error) {
          throw AuthError.from(error);
        }
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new AuthError(errorBody.msg ?? `Signup failed (${String(res.status)})`, res.status);
        }
        const responseData = await res.json();
        const user = toUser(responseData);
        if (responseData.confirmed_at) {
          const accessToken = responseData.access_token;
          if (accessToken) {
            setAuthCookies(cookies, accessToken, responseData.refresh_token);
          }
        }
        return user;
      }
      const client = getClient();
      try {
        const response = await client.signup(email, password, data);
        const user = toUser(response);
        if (response.confirmed_at) {
          const jwt = await response.jwt?.();
          if (jwt) {
            const refreshToken = response.tokenDetails?.()?.refresh_token;
            setBrowserAuthCookies(jwt, refreshToken);
          }
          startTokenRefresh();
          emitAuthEvent(AUTH_EVENTS.LOGIN, user);
        }
        return user;
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    logout = async () => {
      if (!isBrowser2()) {
        const identityUrl = getServerIdentityUrl();
        const cookies = getCookies();
        const jwt = cookies.get(NF_JWT_COOKIE);
        if (jwt) {
          try {
            await fetchWithTimeout(`${identityUrl}/logout`, {
              method: "POST",
              headers: { Authorization: `Bearer ${jwt}` }
            });
          } catch {
          }
        }
        deleteAuthCookies(cookies);
        return;
      }
      const client = getClient();
      try {
        const currentUser2 = client.currentUser();
        if (currentUser2) {
          await currentUser2.logout();
        }
        deleteBrowserAuthCookies();
        stopTokenRefresh();
        emitAuthEvent(AUTH_EVENTS.LOGOUT, null);
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    oauthLogin = (provider) => {
      if (!isBrowser2()) {
        throw new AuthError("oauthLogin() is only available in the browser");
      }
      const client = getClient();
      window.location.href = client.loginExternalUrl(provider);
      throw new AuthError("Redirecting to OAuth provider");
    };
    handleAuthCallback = async () => {
      if (!isBrowser2()) return null;
      const hash = window.location.hash.substring(1);
      if (!hash) return null;
      const client = getClient();
      const params = new URLSearchParams(hash);
      try {
        const accessToken = params.get("access_token");
        if (accessToken) return await handleOAuthCallback(client, params, accessToken);
        const confirmationToken = params.get("confirmation_token");
        if (confirmationToken) return await handleConfirmationCallback(client, confirmationToken);
        const recoveryToken = params.get("recovery_token");
        if (recoveryToken) return await handleRecoveryCallback(client, recoveryToken);
        const inviteToken2 = params.get("invite_token");
        if (inviteToken2) return handleInviteCallback(inviteToken2);
        const emailChangeToken = params.get("email_change_token");
        if (emailChangeToken) return await handleEmailChangeCallback(client, emailChangeToken);
        return null;
      } catch (error) {
        if (error instanceof AuthError) throw error;
        throw AuthError.from(error);
      }
    };
    handleOAuthCallback = async (client, params, accessToken) => {
      const refreshToken = params.get("refresh_token") ?? "";
      const expiresIn = parseInt(params.get("expires_in") ?? "", 10);
      const expiresAt = parseInt(params.get("expires_at") ?? "", 10);
      const gotrueUser = await client.createUser(
        {
          access_token: accessToken,
          token_type: params.get("token_type") ?? "bearer",
          expires_in: isFinite(expiresIn) ? expiresIn : 3600,
          expires_at: isFinite(expiresAt) ? expiresAt : Math.floor(Date.now() / 1e3) + 3600,
          refresh_token: refreshToken
        },
        persistSession
      );
      setBrowserAuthCookies(accessToken, refreshToken || void 0);
      const user = toUser(gotrueUser);
      startTokenRefresh();
      clearHash();
      emitAuthEvent(AUTH_EVENTS.LOGIN, user);
      return { type: "oauth", user };
    };
    handleConfirmationCallback = async (client, token) => {
      const gotrueUser = await client.confirm(token, persistSession);
      const jwt = await gotrueUser.jwt();
      setBrowserAuthCookies(jwt, gotrueUser.tokenDetails()?.refresh_token);
      const user = toUser(gotrueUser);
      startTokenRefresh();
      clearHash();
      emitAuthEvent(AUTH_EVENTS.LOGIN, user);
      return { type: "confirmation", user };
    };
    handleRecoveryCallback = async (client, token) => {
      const gotrueUser = await client.recover(token, persistSession);
      const jwt = await gotrueUser.jwt();
      setBrowserAuthCookies(jwt, gotrueUser.tokenDetails()?.refresh_token);
      const user = toUser(gotrueUser);
      startTokenRefresh();
      clearHash();
      emitAuthEvent(AUTH_EVENTS.RECOVERY, user);
      return { type: "recovery", user };
    };
    handleInviteCallback = (token) => {
      clearHash();
      return { type: "invite", user: null, token };
    };
    handleEmailChangeCallback = async (client, emailChangeToken) => {
      const currentUser2 = client.currentUser();
      if (!currentUser2) {
        throw new AuthError("Email change verification requires an active browser session");
      }
      const jwt = await currentUser2.jwt();
      const identityUrl = `${window.location.origin}${IDENTITY_PATH}`;
      const emailChangeRes = await fetch(`${identityUrl}/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`
        },
        body: JSON.stringify({ email_change_token: emailChangeToken })
      });
      if (!emailChangeRes.ok) {
        const errorBody = await emailChangeRes.json().catch(() => ({}));
        throw new AuthError(
          errorBody.msg ?? `Email change verification failed (${String(emailChangeRes.status)})`,
          emailChangeRes.status
        );
      }
      const emailChangeData = await emailChangeRes.json();
      const user = toUser(emailChangeData);
      clearHash();
      emitAuthEvent(AUTH_EVENTS.USER_UPDATED, user);
      return { type: "email_change", user };
    };
    clearHash = () => {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    hydrateSession = async () => {
      if (!isBrowser2()) return null;
      const client = getClient();
      const currentUser2 = client.currentUser();
      if (currentUser2) {
        startTokenRefresh();
        return toUser(currentUser2);
      }
      const accessToken = getCookie(NF_JWT_COOKIE);
      if (!accessToken) return null;
      const refreshToken = getCookie(NF_REFRESH_COOKIE) ?? "";
      const decoded = decodeJwtPayload(accessToken);
      const expiresAt = decoded?.exp ?? Math.floor(Date.now() / 1e3) + 3600;
      const expiresIn = Math.max(0, expiresAt - Math.floor(Date.now() / 1e3));
      let gotrueUser;
      try {
        gotrueUser = await client.createUser(
          {
            access_token: accessToken,
            token_type: "bearer",
            expires_in: expiresIn,
            expires_at: expiresAt,
            refresh_token: refreshToken
          },
          persistSession
        );
      } catch {
        deleteBrowserAuthCookies();
        return null;
      }
      const user = toUser(gotrueUser);
      startTokenRefresh();
      emitAuthEvent(AUTH_EVENTS.LOGIN, user);
      return user;
    };
    toAuthProvider = (value) => typeof value === "string" && AUTH_PROVIDERS.includes(value) ? value : void 0;
    toOptionalString = (value) => typeof value === "string" && value !== "" ? value : void 0;
    toRoles = (appMeta) => {
      const roles = appMeta.roles;
      if (Array.isArray(roles) && roles.every((r) => typeof r === "string")) {
        return roles;
      }
      return void 0;
    };
    toUser = (userData) => {
      const userMeta = userData.user_metadata ?? {};
      const appMeta = userData.app_metadata ?? {};
      const name = userMeta.full_name ?? userMeta.name;
      const pictureUrl = userMeta.avatar_url;
      return {
        id: userData.id,
        email: userData.email,
        confirmedAt: toOptionalString(userData.confirmed_at),
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
        role: toOptionalString(userData.role),
        provider: toAuthProvider(appMeta.provider),
        name: typeof name === "string" ? name : void 0,
        pictureUrl: typeof pictureUrl === "string" ? pictureUrl : void 0,
        roles: toRoles(appMeta),
        invitedAt: toOptionalString(userData.invited_at),
        confirmationSentAt: toOptionalString(userData.confirmation_sent_at),
        recoverySentAt: toOptionalString(userData.recovery_sent_at),
        pendingEmail: toOptionalString(userData.new_email),
        emailChangeSentAt: toOptionalString(userData.email_change_sent_at),
        lastSignInAt: toOptionalString(userData.last_sign_in_at),
        userMetadata: userMeta,
        appMetadata: appMeta
      };
    };
    claimsToUser = (claims) => {
      const appMeta = claims.app_metadata ?? {};
      const userMeta = claims.user_metadata ?? {};
      const name = userMeta.full_name ?? userMeta.name;
      const pictureUrl = userMeta.avatar_url;
      return {
        id: claims.sub ?? "",
        email: claims.email,
        provider: toAuthProvider(appMeta.provider),
        name: typeof name === "string" ? name : void 0,
        pictureUrl: typeof pictureUrl === "string" ? pictureUrl : void 0,
        roles: toRoles(appMeta),
        userMetadata: userMeta,
        appMetadata: appMeta
      };
    };
    decodeJwtPayload = (token) => {
      try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(payload);
      } catch {
        return null;
      }
    };
    fetchFullUser = async (identityUrl, jwt) => {
      try {
        const res = await fetchWithTimeout(`${identityUrl}/user`, {
          headers: { Authorization: `Bearer ${jwt}` }
        });
        if (!res.ok) return null;
        const userData = await res.json();
        return toUser(userData);
      } catch {
        return null;
      }
    };
    resolveIdentityUrl = () => {
      const identityContext = getIdentityContext();
      if (identityContext?.url) return identityContext.url;
      if (globalThis.Netlify?.context?.url) {
        return new URL(IDENTITY_PATH, globalThis.Netlify.context.url).href;
      }
      const siteUrl = typeof process !== "undefined" ? process.env?.URL : void 0;
      if (siteUrl) {
        return new URL(IDENTITY_PATH, siteUrl).href;
      }
      return null;
    };
    getUser = async () => {
      if (isBrowser2()) {
        const client = getGoTrueClient();
        const currentUser2 = client?.currentUser() ?? null;
        if (currentUser2) {
          const jwt2 = getCookie(NF_JWT_COOKIE);
          if (!jwt2) {
            try {
              currentUser2.clearSession();
            } catch {
            }
            return null;
          }
          startTokenRefresh();
          return toUser(currentUser2);
        }
        const jwt = getCookie(NF_JWT_COOKIE);
        if (!jwt) return null;
        const claims2 = decodeJwtPayload(jwt);
        if (!claims2) return null;
        const hydrated = await hydrateSession();
        return hydrated ?? null;
      }
      triggerNextjsDynamic();
      const identityContext = globalThis.netlifyIdentityContext;
      const serverJwt = identityContext?.token ?? getServerCookie(NF_JWT_COOKIE);
      if (serverJwt) {
        const identityUrl = resolveIdentityUrl();
        if (identityUrl) {
          const fullUser = await fetchFullUser(identityUrl, serverJwt);
          if (fullUser) return fullUser;
        }
      }
      const claims = identityContext?.user ?? null;
      return claims ? claimsToUser(claims) : null;
    };
    isAuthenticated = async () => await getUser() !== null;
    getIdentityConfig = () => {
      if (isBrowser2()) {
        return { url: `${window.location.origin}${IDENTITY_PATH}` };
      }
      return getIdentityContext();
    };
    getSettings = async () => {
      const client = getClient();
      try {
        const raw = await client.settings();
        const external = raw.external ?? {};
        return {
          autoconfirm: raw.autoconfirm,
          disableSignup: raw.disable_signup,
          providers: {
            google: external.google ?? false,
            github: external.github ?? false,
            gitlab: external.gitlab ?? false,
            bitbucket: external.bitbucket ?? false,
            facebook: external.facebook ?? false,
            email: external.email ?? false
          }
        };
      } catch (err) {
        throw new AuthError(err instanceof Error ? err.message : "Failed to fetch identity settings", 502, { cause: err });
      }
    };
    verifyRequestOrigin = (request, options) => {
      const origin = request.headers.get("origin");
      if (!origin) {
        throw new AuthError("Cross-origin request refused: missing Origin header.", 403);
      }
      const allowed = options?.allowedOrigins ?? [new URL(request.url).origin];
      if (!allowed.includes(origin)) {
        throw new AuthError(`Cross-origin request refused: Origin ${origin} did not match an allowed origin.`, 403);
      }
    };
    resolveCurrentUser = async () => {
      const client = getClient();
      let currentUser2 = client.currentUser();
      if (!currentUser2 && isBrowser2()) {
        try {
          await hydrateSession();
        } catch {
        }
        currentUser2 = client.currentUser();
      }
      if (!currentUser2) throw new AuthError("No user is currently logged in");
      return currentUser2;
    };
    requestPasswordRecovery = async (email) => {
      const client = getClient();
      try {
        await client.requestPasswordRecovery(email);
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    recoverPassword = async (token, newPassword) => {
      const client = getClient();
      try {
        const gotrueUser = await client.recover(token, persistSession);
        const updatedUser = await gotrueUser.update({ password: newPassword });
        const user = toUser(updatedUser);
        startTokenRefresh();
        emitAuthEvent(AUTH_EVENTS.LOGIN, user);
        return user;
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    confirmEmail = async (token) => {
      const client = getClient();
      try {
        const gotrueUser = await client.confirm(token, persistSession);
        const user = toUser(gotrueUser);
        startTokenRefresh();
        emitAuthEvent(AUTH_EVENTS.LOGIN, user);
        return user;
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    acceptInvite = async (token, password) => {
      const client = getClient();
      try {
        const gotrueUser = await client.acceptInvite(token, password, persistSession);
        const user = toUser(gotrueUser);
        startTokenRefresh();
        emitAuthEvent(AUTH_EVENTS.LOGIN, user);
        return user;
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    verifyEmailChange = async (token) => {
      if (!isBrowser2()) throw new AuthError("verifyEmailChange() is only available in the browser");
      const currentUser2 = await resolveCurrentUser();
      try {
        const jwt = await currentUser2.jwt();
        const identityUrl = `${window.location.origin}${IDENTITY_PATH}`;
        const res = await fetch(`${identityUrl}/user`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`
          },
          body: JSON.stringify({ email_change_token: token })
        });
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new AuthError(errorBody.msg ?? `Email change verification failed (${String(res.status)})`, res.status);
        }
        const userData = await res.json();
        const user = toUser(userData);
        emitAuthEvent(AUTH_EVENTS.USER_UPDATED, user);
        return user;
      } catch (error) {
        if (error instanceof AuthError) throw error;
        throw AuthError.from(error);
      }
    };
    updateUser = async (updates) => {
      const currentUser2 = await resolveCurrentUser();
      try {
        const updatedUser = await currentUser2.update(updates);
        const user = toUser(updatedUser);
        emitAuthEvent(AUTH_EVENTS.USER_UPDATED, user);
        return user;
      } catch (error) {
        throw AuthError.from(error);
      }
    };
    SERVER_ONLY_MESSAGE = "Admin operations are server-only. Call admin methods from a Netlify Function or Edge Function, not from browser code.";
    sanitizeUserId = (userId) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        throw new AuthError("User ID is not a valid UUID");
      }
      return encodeURIComponent(userId);
    };
    assertServer = () => {
      if (isBrowser2()) {
        throw new AuthError(SERVER_ONLY_MESSAGE);
      }
    };
    getAdminAuth = () => {
      const ctx = getIdentityContext();
      if (!ctx?.url) {
        throw new AuthError("Could not determine the Identity endpoint URL on the server");
      }
      if (!ctx.token) {
        throw new AuthError("Admin operations require an operator token (only available in Netlify Functions)");
      }
      return { url: ctx.url, token: ctx.token };
    };
    adminFetch = async (path, options = {}) => {
      const { url, token } = getAdminAuth();
      let res;
      try {
        res = await fetchWithTimeout(`${url}${path}`, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        throw new AuthError(error.message, void 0, { cause: error });
      }
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new AuthError(
          errorBody.msg ?? `Admin request failed (${String(res.status)})`,
          res.status
        );
      }
      return res;
    };
    listUsers = async (options) => {
      assertServer();
      const params = new URLSearchParams();
      if (options?.page != null) params.set("page", String(options.page));
      if (options?.perPage != null) params.set("per_page", String(options.perPage));
      const query = params.toString();
      const path = `/admin/users${query ? `?${query}` : ""}`;
      const res = await adminFetch(path);
      const body = await res.json();
      return body.users.map(toUser);
    };
    getUser2 = async (userId) => {
      assertServer();
      const sanitizedUserId = sanitizeUserId(userId);
      const res = await adminFetch(`/admin/users/${sanitizedUserId}`);
      const userData = await res.json();
      return toUser(userData);
    };
    createUser = async (params) => {
      assertServer();
      const body = {
        email: params.email,
        password: params.password,
        confirm: true
      };
      if (params.data) {
        const allowedKeys = ["role", "app_metadata", "user_metadata"];
        for (const key of allowedKeys) {
          if (key in params.data) {
            body[key] = params.data[key];
          }
        }
      }
      const res = await adminFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify(body)
      });
      const userData = await res.json();
      return toUser(userData);
    };
    updateUser2 = async (userId, attributes) => {
      assertServer();
      const sanitizedUserId = sanitizeUserId(userId);
      const body = {};
      const allowedKeys = ["email", "password", "role", "confirm", "app_metadata", "user_metadata"];
      for (const key of allowedKeys) {
        if (key in attributes) {
          body[key] = attributes[key];
        }
      }
      const res = await adminFetch(`/admin/users/${sanitizedUserId}`, {
        method: "PUT",
        body: JSON.stringify(body)
      });
      const userData = await res.json();
      return toUser(userData);
    };
    deleteUser = async (userId) => {
      assertServer();
      const sanitizedUserId = sanitizeUserId(userId);
      await adminFetch(`/admin/users/${sanitizedUserId}`, { method: "DELETE" });
    };
    admin = { listUsers, getUser: getUser2, createUser, updateUser: updateUser2, deleteUser };
  }
});

// src/app.js
init_main();
var $ = (id) => document.getElementById(id);
var esc = (x) => String(x ?? "").replace(
  /[&<>"']/g,
  (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]
);
var levels = ["", "\u0410\u043D\u0445\u0430\u043D", "\u0414\u0443\u043D\u0434", "\u0410\u0445\u0438\u0441\u0430\u043D"];
var skills = [
  "\u0428\u0443\u0443\u0434 \u043E\u0439\u043B\u0433\u043E\u043B\u0442",
  "\u0414\u0430\u043B\u0434 \u0443\u0442\u0433\u0430, \u0441\u0430\u043D\u0430\u0430 \u043E\u0439\u043B\u0433\u043E\u0445",
  "\u0414\u04AF\u0433\u043D\u044D\u043B\u0442 \u0445\u0438\u0439\u0445",
  "\u0428\u0430\u043B\u0442\u0433\u0430\u0430\u043D, \u04AF\u0440 \u0434\u0430\u0433\u0430\u0432\u0430\u0440 \u0442\u043E\u0433\u0442\u043E\u043E\u0445",
  "\u0417\u0430\u0434\u043B\u0430\u043D \u0448\u0438\u043D\u0436\u043B\u044D\u0445",
  "\u042D\u0440\u0433\u044D\u0446\u04AF\u04AF\u043B\u044D\u043D \u04AF\u043D\u044D\u043B\u044D\u0445",
  "\u0411\u0430\u0440\u0438\u043C\u0442, \u04AF\u0437\u044D\u043B \u0431\u043E\u0434\u043B\u044B\u0433 \u044F\u043B\u0433\u0430\u0445",
  "\u0417\u043E\u0445\u0438\u043E\u0433\u0447\u0438\u0439\u043D \u0437\u043E\u0440\u0438\u043B\u0433\u043E, \u0431\u0430\u0439\u0440 \u0441\u0443\u0443\u0440\u0438\u0439\u0433 \u0442\u043E\u0434\u043E\u0440\u0445\u043E\u0439\u043B\u043E\u0445"
];
var teacher = null;
var T = null;
var S = null;
var draft = [];
var active = null;
var timer = null;
var reportData = null;
var inviteToken = null;
function notice(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
  $("status").hidden = false;
}
function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
function date(x) {
  return new Date(x).toLocaleString("mn-MN");
}
function pct(a, b) {
  return b ? Math.round(a / b * 100) : 0;
}
async function api(path, body, method) {
  if (path.startsWith("/teacher")) await getUser();
  const r = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body instanceof FormData ? {} : body ? { "Content-Type": "application/json" } : {},
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : void 0
  });
  if (!r.ok) {
    let data;
    try {
      data = await r.json();
    } catch {
    }
    throw new Error(
      data?.error || "\u0421\u0435\u0440\u0432\u0435\u0440\u0442\u044D\u0439 \u0445\u043E\u043B\u0431\u043E\u0433\u0434\u0441\u043E\u043D\u0433\u04AF\u0439. \u0414\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443."
    );
  }
  return r.json();
}
function show(id) {
  document.querySelectorAll(".view").forEach((x) => x.classList.toggle("active", x.id === id));
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x.dataset.view === id));
  if (id === "report") safe(loadReport);
}
window.show = show;
async function safe(fn, button) {
  if (button) button.disabled = true;
  try {
    await fn();
  } catch (e) {
    notice(
      /[А-Яа-яӨөҮү]/.test(e.message || "") ? e.message : "\u04AE\u0439\u043B\u0434\u044D\u043B \u0430\u043C\u0436\u0438\u043B\u0442\u0433\u04AF\u0439. \u0418-\u043C\u044D\u0439\u043B, \u043D\u0443\u0443\u0446 \u04AF\u0433 \u0431\u043E\u043B\u043E\u043D \u0445\u043E\u043B\u0431\u043E\u043B\u0442\u043E\u043E \u0448\u0430\u043B\u0433\u0430\u0430\u0434 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443.",
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
}
function bindForm(id, fn) {
  $(id).addEventListener("submit", (e) => {
    e.preventDefault();
    safe(() => fn(e), e.submitter);
  });
}
var option = (id, name) => `<option value="${esc(id)}">${esc(name)}</option>`;
async function loadTeacher() {
  T = await api("/teacher/data");
  $("teacherAuth").hidden = true;
  $("teacherWorkspace").hidden = false;
  $("teacherWelcome").textContent = teacher?.name || teacher?.email || "\u0422\u0430\u0432\u0442\u0430\u0439 \u043C\u043E\u0440\u0438\u043B\u043D\u043E \u0443\u0443";
  $("teacherStats").innerHTML = [
    ["\u0410\u043D\u0433\u0438", T.classes.length],
    ["\u0421\u0443\u0440\u0430\u0433\u0447", T.students.length],
    ["\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440", T.tasks.length]
  ].map(([name, n]) => `<div class="stat">${name}<strong>${n}</strong></div>`).join("");
  for (const key of ["studentClassSelect", "assignClass"])
    $(key).innerHTML = option("", "\u0410\u043D\u0433\u0438 \u0441\u043E\u043D\u0433\u043E\u0445") + T.classes.map((c) => option(c.id, c.name)).join("");
  $("assignTask").innerHTML = option("", "\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u0441\u043E\u043D\u0433\u043E\u0445") + T.tasks.map((t) => option(t.id, t.title)).join("");
  $("classList").innerHTML = T.classes.map(
    (c) => `<div class="row"><h3>${esc(c.name)} <small>\u0410\u043D\u0433\u0438\u0439\u043D \u043A\u043E\u0434: <span class="code">${esc(c.code)}</span></small></h3>${T.students.filter((x) => x.classId === c.id).map(
      (st) => `<div class="heading"><span>${esc(st.name)}</span><button class="link" data-action="resetCode" data-id="${st.id}">\u0425\u0443\u0432\u0438\u0439\u043D \u043A\u043E\u0434 \u0448\u0438\u043D\u044D\u0447\u043B\u044D\u0445</button></div>`
    ).join("") || '<p class="muted">\u0421\u0443\u0440\u0430\u0433\u0447 \u0431\u04AF\u0440\u0442\u0433\u044D\u044D\u0433\u04AF\u0439 \u0431\u0430\u0439\u043D\u0430.</p>'}</div>`
  ).join("") || empty("\u042D\u0445\u043D\u0438\u0439 \u0430\u043D\u0433\u0438\u0430 \u04AF\u04AF\u0441\u0433\u044D\u044D\u0434 \u0441\u0443\u0440\u0430\u0433\u0447\u0434\u0430\u0430 \u0431\u04AF\u0440\u0442\u0433\u044D\u044D\u0440\u044D\u0439.");
  $("taskList").innerHTML = T.tasks.map(
    (t) => `<div class="row heading"><div><b>${esc(t.title)}</b><p class="muted">${levels[t.level]} \xB7 ${t.questions.length} \u0430\u0441\u0443\u0443\u043B\u0442 \xB7 ${t.questions.reduce((a, q) => a + q.points, 0)} \u043E\u043D\u043E\u043E</p></div><div><button class="link" data-action="editTask" data-id="${t.id}">\u041D\u044D\u044D\u0445 / \u0445\u0443\u0432\u0438\u043B\u0431\u0430\u0440 \u04AF\u04AF\u0441\u0433\u044D\u0445</button><button class="link" data-action="deleteTask" data-id="${t.id}">\u0423\u0441\u0442\u0433\u0430\u0445</button></div></div>`
  ).join("") || empty("\u0423\u043D\u0448\u0438\u0445 \u044D\u0445, \u0430\u0441\u0443\u0443\u043B\u0442\u0430\u0430 \u043E\u0440\u0443\u0443\u043B\u0430\u0430\u0434 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0440\u0430\u0430 \u0445\u0430\u0434\u0433\u0430\u043B\u0430\u0430\u0440\u0430\u0439.");
  $("assignmentList").innerHTML = T.assignments.map(
    (a) => `<div class="row">${esc(T.tasks.find((t) => t.id === a.taskId)?.title)} \u2192 ${esc(T.classes.find((c) => c.id === a.classId)?.name)}<p class="muted">\u0425\u0430\u0430\u0445: ${date(a.deadline)} \xB7 ${a.minutes} \u043C\u0438\u043D\u0443\u0442 \xB7 ${{ quiz: "\u0410\u0441\u0443\u0443\u043B\u0442 \u0445\u0430\u0440\u0438\u0443\u043B\u0442", timed: "\u0426\u0430\u0433\u0442\u0430\u0439 \u0441\u043E\u0440\u0438\u043B", match: "\u04AE\u0433, \u0443\u0442\u0433\u0430" }[a.mode]}</p></div>`
  ).join("");
}
function questionBlank() {
  return {
    q: "",
    options: ["", "", "", ""],
    correct: 0,
    points: 10,
    skill: 0,
    explanation: ""
  };
}
function captureDraft() {
  return [...$("questionEditor").querySelectorAll("[data-question]")].map(
    (el) => ({
      q: el.querySelector("[data-key=q]").value,
      options: el.querySelector("[data-key=options]").value.split("\n").map((x) => x.trim()).filter(Boolean),
      correct: +el.querySelector("[data-key=correct]").value - 1,
      points: +el.querySelector("[data-key=points]").value,
      skill: +el.querySelector("[data-key=skill]").value,
      explanation: el.querySelector("[data-key=explanation]").value
    })
  );
}
function renderDraft() {
  $("questionEditor").innerHTML = draft.map(
    (q, i) => `<fieldset class="question" data-question="${i}" style="border:1px solid #e1eaf3"><legend>\u0410\u0441\u0443\u0443\u043B\u0442 ${i + 1}</legend><label>\u0410\u0441\u0443\u0443\u043B\u0442 / \u0445\u0430\u0440\u0433\u0430\u043B\u0437\u0443\u0443\u043B\u0430\u0445 \u04AF\u0433<input data-key="q" value="${esc(q.q)}" required maxlength="1000"></label><label>\u0421\u043E\u043D\u0433\u043E\u043B\u0442 / \u0443\u0442\u0433\u0443\u0443\u0434 (\u043C\u04E9\u0440 \u0431\u04AF\u0440\u0434 \u043D\u044D\u0433)<textarea data-key="options" required>${esc(q.options.join("\n"))}</textarea></label><div class="grid"><label>\u0417\u04E9\u0432 \u0441\u043E\u043D\u0433\u043E\u043B\u0442\u044B\u043D \u0434\u0443\u0433\u0430\u0430\u0440<input data-key="correct" type="number" min="1" max="6" value="${q.correct + 1}" required></label><label>\u041E\u043D\u043E\u043E<input data-key="points" type="number" min="1" max="100" value="${q.points}" required></label><label>\u0427\u0430\u0434\u0432\u0430\u0440<select data-key="skill">${skills.map((x, j) => `<option value="${j}" ${j === q.skill ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><label>\u0425\u0430\u0440\u0438\u0443\u043B\u0442\u044B\u043D \u0442\u0430\u0439\u043B\u0431\u0430\u0440<textarea data-key="explanation" required maxlength="3000">${esc(q.explanation)}</textarea></label><button class="link" type="button" data-action="removeQuestion" data-index="${i}">\u0410\u0441\u0443\u0443\u043B\u0442 \u0445\u0430\u0441\u0430\u0445</button></fieldset>`
  ).join("");
}
function fillDraft(t) {
  $("taskTitle").value = t.title;
  $("passage").value = t.passage;
  $("level").value = t.level;
  draft = structuredClone(t.questions);
  renderDraft();
}
function issued(text) {
  $("issuedCode").hidden = false;
  $("issuedCode").textContent = text;
}
bindForm("authForm", async (e) => {
  const email = $("email").value, password = $("password").value;
  if (e.submitter.value === "signup") {
    await signup(email, password, { full_name: $("teacherName").value });
    notice(
      "\u0411\u04AF\u0440\u0442\u0433\u044D\u043B\u0438\u0439\u043D \u0445\u04AF\u0441\u044D\u043B\u0442 \u0430\u043C\u0436\u0438\u043B\u0442\u0442\u0430\u0439. \u0418-\u043C\u044D\u0439\u043B\u044D\u044D \u0448\u0430\u043B\u0433\u0430\u0436, \u0445\u0430\u044F\u0433\u0430\u0430 \u0431\u0430\u0442\u0430\u043B\u0433\u0430\u0430\u0436\u0443\u0443\u043B\u043D\u0430 \u0443\u0443."
    );
    return;
  }
  teacher = await login(email, password);
  if (S) {
    await api("/student/logout", {});
    S = null;
    clearInterval(timer);
    active = null;
    $("studentWorkspace").hidden = true;
    $("studentAuth").hidden = false;
    $("gameArea").innerHTML = "";
  }
  await loadTeacher();
  $("password").value = "";
  notice("\u0411\u0430\u0433\u0448\u0438\u0439\u043D \u044D\u0440\u0445\u044D\u044D\u0440 \u043D\u044D\u0432\u0442\u044D\u0440\u043B\u044D\u044D.");
});
bindForm("resetForm", async () => {
  if (inviteToken) {
    const { acceptInvite: acceptInvite2 } = await Promise.resolve().then(() => (init_main(), main_exports));
    teacher = await acceptInvite2(inviteToken, $("newPassword").value);
    inviteToken = null;
  } else {
    await updateUser({ password: $("newPassword").value });
    teacher = await getUser();
  }
  $("resetForm").hidden = true;
  $("authForm").hidden = false;
  $("newPassword").value = "";
  await loadTeacher();
  notice("\u041D\u0443\u0443\u0446 \u04AF\u0433 \u0445\u0430\u0434\u0433\u0430\u043B\u0430\u0433\u0434\u043B\u0430\u0430.");
});
bindForm("classForm", async () => {
  await api("/teacher/classes", { name: $("className").value });
  $("classForm").reset();
  await loadTeacher();
  notice("\u0410\u043D\u0433\u0438 \u043C\u044D\u0434\u044D\u044D\u043B\u043B\u0438\u0439\u043D \u0441\u0430\u043D\u0434 \u0445\u0430\u0434\u0433\u0430\u043B\u0430\u0433\u0434\u043B\u0430\u0430.");
});
bindForm("studentForm", async () => {
  const cls = T.classes.find((c) => c.id === $("studentClassSelect").value);
  const r = await api("/teacher/students", {
    classId: $("studentClassSelect").value,
    name: $("newStudentName").value
  });
  await loadTeacher();
  issued(
    `${r.name} \xB7 \u0410\u043D\u0433\u0438\u0439\u043D \u043A\u043E\u0434: ${cls.code} \xB7 \u0425\u0443\u0432\u0438\u0439\u043D \u043A\u043E\u0434: ${r.code}. \u0425\u0443\u0443\u043B\u0436 \u0430\u0432\u0430\u0430\u0434 \u0437\u04E9\u0432\u0445\u04E9\u043D \u044D\u043D\u044D \u0441\u0443\u0440\u0430\u0433\u0447\u0438\u0434 \u04E9\u0433\u043D\u04E9 \u04AF\u04AF. \u041A\u043E\u0434 \u0434\u0430\u0445\u0438\u043D \u0445\u0430\u0440\u0430\u0433\u0434\u0430\u0445\u0433\u04AF\u0439.`
  );
  $("newStudentName").value = "";
  notice("\u0421\u0443\u0440\u0430\u0433\u0447 \u0431\u04AF\u0440\u0442\u0433\u044D\u0433\u0434\u043B\u044D\u044D. \u0425\u0443\u0432\u0438\u0439\u043D \u043A\u043E\u0434\u044B\u0433 \u0445\u0443\u0443\u043B\u0436 \u0430\u0432\u043D\u0430 \u0443\u0443.");
});
bindForm("taskForm", async () => {
  draft = captureDraft();
  await api("/teacher/tasks", {
    title: $("taskTitle").value,
    passage: $("passage").value,
    level: +$("level").value,
    questions: draft
  });
  await loadTeacher();
  notice("\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u0442\u04E9\u0432\u043B\u04E9\u0440\u0441\u04E9\u043D \u043C\u044D\u0434\u044D\u044D\u043B\u043B\u0438\u0439\u043D \u0441\u0430\u043D\u0434 \u0445\u0430\u0434\u0433\u0430\u043B\u0430\u0433\u0434\u043B\u0430\u0430.");
});
bindForm("assignForm", async () => {
  await api("/teacher/assignments", {
    classId: $("assignClass").value,
    taskId: $("assignTask").value,
    deadline: new Date($("deadline").value).toISOString(),
    minutes: +$("minutes").value,
    mode: $("mode").value
  });
  await loadTeacher();
  notice("\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u0441\u0443\u0440\u0430\u0433\u0447\u0434\u0430\u0434 \u043E\u043D\u043E\u043E\u0433\u0434\u043B\u043E\u043E.");
});
bindForm("studentLogin", async () => {
  await api("/student/login", {
    classCode: $("studentClassCode").value,
    name: $("studentName").value,
    code: $("studentCode").value
  });
  $("studentCode").value = "";
  if (teacher) await actions.teacherLogout();
  await loadStudent();
  notice("\u0410\u043D\u0433\u0438\u0434\u0430\u0430 \u0430\u043C\u0436\u0438\u043B\u0442\u0442\u0430\u0439 \u043D\u044D\u0432\u0442\u044D\u0440\u043B\u044D\u044D.");
});
$("importFile").addEventListener(
  "change",
  (e) => safe(async () => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024)
      throw new Error("8 MB \u0445\u04AF\u0440\u0442\u044D\u043B \u0444\u0430\u0439\u043B \u0441\u043E\u043D\u0433\u043E\u043D\u043E \u0443\u0443.");
    const body = new FormData();
    body.append("file", file);
    notice("\u0424\u0430\u0439\u043B\u044B\u043D \u0442\u0435\u043A\u0441\u0442\u0438\u0439\u0433 \u0443\u043D\u0448\u0438\u0436 \u0431\u0430\u0439\u043D\u0430\u2026");
    const r = await api("/teacher/import", body);
    $("passage").value = r.text;
    notice("\u042D\u0445\u0438\u0439\u043D \u0442\u0435\u043A\u0441\u0442 \u043E\u0440\u043B\u043E\u043E. \u041D\u044F\u0433\u0442\u0430\u043B\u0436 \u0437\u0430\u0441\u0430\u0430\u0434 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0440\u0430\u0430 \u0445\u0430\u0434\u0433\u0430\u043B\u043D\u0430 \u0443\u0443.");
  })
);
function progressChart(rows) {
  return rows.length ? `<div class="chart" role="img" aria-label="\u04AE\u043D\u044D\u043B\u0433\u044D\u044D\u043D\u0438\u0439 \u0430\u0445\u0438\u0446">${rows.map((r, i) => `<div class="chart-col"><span>${r.percent}%</span><div class="chart-value" style="height:${r.percent * 1.2}px"></div><p>${i + 1}. ${new Date(r.submittedAt).toLocaleDateString("mn-MN")}</p></div>`).join("")}</div>` : empty("\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u0433\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u0441\u043D\u0438\u0439 \u0434\u0430\u0440\u0430\u0430 \u0430\u0445\u0438\u0446 \u0445\u0430\u0440\u0430\u0433\u0434\u0430\u043D\u0430.");
}
function skillBars(rows) {
  return skills.map((name, i) => {
    const f = rows.flatMap((a) => a.feedback || []).filter((q) => q.skill === i), p = pct(
      f.reduce((a, q) => a + q.points, 0),
      f.reduce((a, q) => a + q.max, 0)
    );
    return `<p>${name} <b>${f.length ? p + "%" : "\u04AE\u043D\u044D\u043B\u044D\u044D\u0433\u04AF\u0439"}</b></p><div class="bar"><span style="width:${p}%"></span></div>`;
  }).join("");
}
async function loadStudent() {
  S = await api("/student/data");
  $("studentAuth").hidden = true;
  $("studentWorkspace").hidden = false;
  $("welcome").textContent = `\u0421\u0430\u0439\u043D \u0431\u0430\u0439\u043D\u0430 \u0443\u0443, ${S.name}! \xB7 ${S.className}`;
  const done = S.attempts.filter((a) => a.submittedAt), total = done.reduce((n, a) => n + a.score, 0), average = done.length ? Math.round(done.reduce((n, a) => n + a.percent, 0) / done.length) : 0;
  $("myProgress").innerHTML = `<div class="grid"><div class="stat">\u041C\u0438\u043D\u0438\u0439 \u043E\u043D\u043E\u043E<strong>${total}</strong></div><div class="stat">\u0414\u0443\u043D\u0434\u0430\u0436 \u04AF\u043D\u044D\u043B\u0433\u044D\u044D<strong>${average}%</strong></div><div class="stat">\u041D\u044D\u044D\u0433\u0434\u0441\u044D\u043D \u0442\u04AF\u0432\u0448\u0438\u043D<strong>${levels[S.unlocked]}</strong></div></div><p>${done.length >= 1 ? '<span class="badge">\u0410\u043D\u0445\u043D\u044B \u0430\u043B\u0445\u0430\u043C</span> ' : ""}${done.some((a) => a.percent === 100) ? '<span class="badge">\u0422\u04E9\u0433\u0441 \u0443\u043D\u0448\u0438\u0433\u0447</span> ' : ""}${S.unlocked > 1 ? '<span class="badge">\u0422\u04AF\u0432\u0448\u0438\u043D \u0430\u0445\u0438\u0433\u0447</span>' : ""}</p><p class="muted">\u0414\u0430\u0440\u0430\u0430\u0433\u0438\u0439\u043D \u0442\u04AF\u0432\u0448\u043D\u0438\u0439\u0433 \u043D\u044D\u044D\u0445\u0438\u0439\u043D \u0442\u0443\u043B\u0434 \u043E\u0434\u043E\u043E\u0433\u0438\u0439\u043D \u0442\u04AF\u0432\u0448\u043D\u0438\u0439 \u043D\u044D\u0433 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440\u0442 70% \u0445\u04AF\u0440\u044D\u044D\u0440\u044D\u0439.</p>`;
  $("studentTasks").innerHTML = S.assignments.map(({ assignment: a, task: t }) => {
    const done2 = S.attempts.find(
      (x) => x.assignmentId === a.id && x.submittedAt
    ), started = S.attempts.find((x) => x.assignmentId === a.id), locked = t.level > S.unlocked, late = new Date(a.deadline) < /* @__PURE__ */ new Date();
    return `<div class="row heading"><div><b>${esc(t.title)}</b><p>${levels[t.level]} \xB7 ${a.minutes} \u043C\u0438\u043D\u0443\u0442 \xB7 ${date(a.deadline)}</p><small>${done2 ? done2.percent + "% \xB7 \u0413\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u0441\u044D\u043D" : late ? "\u0425\u0443\u0433\u0430\u0446\u0430\u0430 \u0434\u0443\u0443\u0441\u0441\u0430\u043D" : locked ? "\u04E8\u043C\u043D\u04E9\u0445 \u0442\u04AF\u0432\u0448\u043D\u044D\u044D \u0433\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u0436 \u043D\u044D\u044D\u043D\u044D \u04AF\u04AF." : started ? "\u042D\u0445\u044D\u043B\u0441\u044D\u043D \xB7 \u0445\u0443\u0433\u0430\u0446\u0430\u0430 \u04AF\u0440\u0433\u044D\u043B\u0436\u0438\u043B\u0436 \u0431\u0430\u0439\u043D\u0430" : "\u0410\u0436\u0438\u043B\u043B\u0430\u0445\u0430\u0434 \u0431\u044D\u043B\u044D\u043D"}</small></div>${done2 ? `<button class="link" data-action="review" data-id="${done2.id}">\u04AE\u043D\u044D\u043B\u0433\u044D\u044D \u0445\u0430\u0440\u0430\u0445</button>` : !locked && !late ? `<button class="btn" data-action="start" data-id="${a.id}">${started ? "\u04AE\u0440\u0433\u044D\u043B\u0436\u043B\u04AF\u04AF\u043B\u044D\u0445" : "\u0410\u0436\u0438\u043B\u043B\u0430\u0445"}</button>` : ""}</div>`;
  }).join("") || empty("\u0411\u0430\u0433\u0448 \u043E\u0434\u043E\u043E\u0433\u043E\u043E\u0440 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u043E\u043D\u043E\u043E\u0433\u043E\u043E\u0433\u04AF\u0439 \u0431\u0430\u0439\u043D\u0430.");
  $("studentHistory").innerHTML = progressChart(done) + `<h3>\u0427\u0430\u0434\u0432\u0430\u0440 \u0442\u0443\u0441 \u0431\u04AF\u0440</h3>${skillBars(done)}`;
}
async function start(aid) {
  if (active && active.assignmentId !== aid)
    throw new Error("\u041E\u0434\u043E\u043E \u0430\u0436\u0438\u043B\u043B\u0430\u0436 \u0431\u0443\u0439 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0440\u0430\u0430 \u044D\u0445\u043B\u044D\u044D\u0434 \u0438\u043B\u0433\u044D\u044D\u043D\u044D \u04AF\u04AF.");
  const data = await api(`/student/assignments/${aid}/start`, {});
  active = { ...data, assignmentId: aid };
  show("games");
  $("gameArea").innerHTML = `<div class="timer" id="timeLeft" role="timer"></div><h3>${esc(data.title)}</h3><div class="passage">${esc(data.passage)}</div><form id="answerForm" class="game">${data.questions.map((q, i) => `<fieldset class="question" style="border:0"><legend>${i + 1}. ${esc(q.q)} \xB7 ${q.points} \u043E\u043D\u043E\u043E</legend>${data.mode === "match" ? `<label>\u0422\u043E\u0445\u0438\u0440\u043E\u0445 \u0443\u0442\u0433\u044B\u0433 \u0441\u043E\u043D\u0433\u043E\u043D\u043E \u0443\u0443<select name="answer${i}"><option value="-1">\u0421\u043E\u043D\u0433\u043E\u0445</option>${q.options.map((o, j) => option(j, o)).join("")}</select></label>` : q.options.map((o, j) => `<label class="answer"><input type="radio" name="answer${i}" value="${j}">${esc(o)}</label>`).join("")}</fieldset>`).join("")}<button class="btn">\u0425\u0430\u0440\u0438\u0443\u043B\u0442\u0430\u0430 \u0438\u043B\u0433\u044D\u044D\u0445</button><p class="muted">\u041D\u044D\u0433 \u0443\u0434\u0430\u0430 \u0438\u043B\u0433\u044D\u044D\u043D\u044D. \u0426\u0430\u0433 \u0434\u0443\u0443\u0441\u0430\u0445\u0430\u0434 \u0441\u043E\u043D\u0433\u043E\u0441\u043E\u043D \u0445\u0430\u0440\u0438\u0443\u043B\u0442\u0443\u0443\u0434 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0430\u0430\u0440 \u0438\u043B\u0433\u044D\u044D\u0433\u0434\u044D\u043D\u044D.</p></form>`;
  bindForm("answerForm", submitAnswers);
  clearInterval(timer);
  let autoSent = false;
  const tick = () => {
    if (!active) return;
    const seconds = Math.max(
      0,
      Math.ceil((new Date(active.expiresAt) - Date.now()) / 1e3)
    );
    $("timeLeft").textContent = `\u04AE\u043B\u0434\u0441\u044D\u043D \u0445\u0443\u0433\u0430\u0446\u0430\u0430: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (!seconds && !autoSent) {
      autoSent = true;
      clearInterval(timer);
      safe(submitAnswers);
    }
  };
  tick();
  timer = setInterval(tick, 1e3);
}
async function submitAnswers() {
  if (!active) return;
  const form = $("answerForm");
  const body = new FormData(form);
  const answers = active.questions.map(
    (_, i) => body.has("answer" + i) ? +body.get("answer" + i) : -1
  );
  const result = await api(`/student/attempts/${active.attemptId}/submit`, {
    answers
  });
  if (result.error) throw new Error(result.error);
  clearInterval(timer);
  active = null;
  renderFeedback(result);
  await loadStudent();
  notice("\u04AE\u043D\u044D\u043B\u0433\u044D\u044D \u043C\u044D\u0434\u044D\u044D\u043B\u043B\u0438\u0439\u043D \u0441\u0430\u043D\u0434 \u0445\u0430\u0434\u0433\u0430\u043B\u0430\u0433\u0434\u043B\u0430\u0430.");
}
function renderFeedback(a) {
  show("games");
  $("gameArea").innerHTML = `<div class="stat">\u041C\u0438\u043D\u0438\u0439 \u04AF\u0440 \u0434\u04AF\u043D<strong>${a.score} / ${a.maxScore} \xB7 ${a.percent}%</strong></div><p>\u0410\u0436\u0438\u043B\u043B\u0430\u0441\u0430\u043D \u0445\u0443\u0433\u0430\u0446\u0430\u0430: ${a.seconds} \u0441\u0435\u043A\u0443\u043D\u0434</p>${(a.feedback || []).map((f, i) => `<div class="feedback ${f.ok ? "ok" : ""}"><b>${i + 1}. ${esc(f.q)} \xB7 ${f.points}/${f.max}</b><p>${f.ok ? "\u0417\u04E9\u0432 \u0445\u0430\u0440\u0438\u0443\u043B\u043B\u0430\u0430" : "\u0414\u0430\u0445\u0438\u043D \u043D\u044F\u0433\u0442\u043B\u0430\u0430\u0440\u0430\u0439"}</p><p>${esc(f.explanation)}</p><p>\u0417\u04E9\u0432 \u0445\u0430\u0440\u0438\u0443\u043B\u0442: ${esc(f.correctAnswer || String(f.correct + 1))}</p><small>${skills[f.skill]}</small></div>`).join("")}<button class="btn" data-action="goStudent">\u041C\u0438\u043D\u0438\u0439 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440</button>`;
}
async function loadReport() {
  if (teacher) {
    const r = reportData = await api("/teacher/report");
    const done = r.rows.filter((x) => x.attempt.submittedAt), sum = done.reduce((n, x) => n + x.attempt.percent, 0), avg = done.length ? Math.round(sum / done.length) : 0;
    const byClass = [
      ...new Map(
        r.expected.map((x) => [
          x.classId,
          { id: x.classId, name: x.className }
        ])
      ).values()
    ];
    const people = [...new Set(done.map((x) => x.attempt.studentId))];
    $("reportContent").innerHTML = `<div class="grid"><div class="stat">\u041D\u0438\u0439\u0442 \u0433\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u043B<strong>${pct(done.length, r.expected.length)}%</strong></div><div class="stat">\u0414\u0443\u043D\u0434\u0430\u0436 \u04AF\u043D\u044D\u043B\u0433\u044D\u044D<strong>${avg}%</strong></div><div class="stat">\u0413\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u0441\u044D\u043D<strong>${done.length} / ${r.expected.length}</strong></div></div><h3>\u0410\u043D\u0433\u0438 \u0442\u0443\u0441 \u0431\u04AF\u0440\u0438\u0439\u043D \u0433\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u043B</h3>${byClass.map((c) => {
      const all = r.expected.filter((x) => x.classId === c.id).length, n = done.filter((x) => x.classId === c.id).length, p = pct(n, all);
      return `<p>${esc(c.name)} \xB7 ${n}/${all} \xB7 ${p}%</p><div class="bar"><span style="width:${p}%"></span></div>`;
    }).join("") || empty("\u0410\u043D\u0433\u0438\u0434\u0430\u0430 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u043E\u043D\u043E\u043E\u0441\u043D\u044B \u0434\u0430\u0440\u0430\u0430 \u0433\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u043B \u0445\u0430\u0440\u0430\u0433\u0434\u0430\u043D\u0430.")}<h3>\u042D\u0445\u043D\u0438\u0439 \u0431\u0430 \u0441\u04AF\u04AF\u043B\u0438\u0439\u043D \u04AF\u043D\u044D\u043B\u0433\u044D\u044D</h3>${people.map((id) => {
      const list = done.filter((x) => x.attempt.studentId === id), first = list[0], last = list.at(-1);
      return `<div class="row"><b>${esc(first.student)} \xB7 ${esc(first.className)}</b> ${first.attempt.percent}% \u2192 ${last.attempt.percent}% (${last.attempt.percent - first.attempt.percent >= 0 ? "+" : ""}${last.attempt.percent - first.attempt.percent} \u043D\u044D\u0433\u0436)${progressChart(list.map((x) => x.attempt))}</div>`;
    }).join("") || empty("\u04AE\u043D\u044D\u043B\u0433\u044D\u044D \u0445\u0430\u0440\u0430\u0430\u0445\u0430\u043D \u0431\u04AF\u0440\u0442\u0433\u044D\u0433\u0434\u044D\u044D\u0433\u04AF\u0439 \u0431\u0430\u0439\u043D\u0430.")}<h3>\u0427\u0430\u0434\u0432\u0430\u0440 \u0442\u0443\u0441 \u0431\u04AF\u0440</h3>${skillBars(done.map((x) => x.attempt))}<h3>\u0425\u0430\u043C\u0433\u0438\u0439\u043D \u0438\u0445 \u0430\u043B\u0434\u0430\u0430\u0442\u0430\u0439 \u0430\u0441\u0443\u0443\u043B\u0442\u0443\u0443\u0434</h3>${mistakes(done)}<h3>\u0421\u0443\u0440\u0430\u0433\u0447 \u0442\u0443\u0441 \u0431\u04AF\u0440\u0438\u0439\u043D \u0433\u04AF\u0439\u0446\u044D\u0442\u0433\u044D\u043B</h3><div class="scroll"><table><thead><tr><th>\u0421\u0443\u0440\u0430\u0433\u0447</th><th>\u0410\u043D\u0433\u0438</th><th>\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440</th><th>\u041E\u043D\u043E\u043E</th><th>\u0425\u0443\u0432\u044C</th><th>\u0425\u0443\u0433\u0430\u0446\u0430\u0430</th><th>\u041E\u0433\u043D\u043E\u043E</th></tr></thead><tbody>${done.map((x) => `<tr><td>${esc(x.student)}</td><td>${esc(x.className)}</td><td>${esc(x.title)}</td><td>${x.attempt.score}/${x.attempt.maxScore}</td><td>${x.attempt.percent}%</td><td>${x.attempt.seconds} \u0441\u0435\u043A</td><td>${date(x.attempt.submittedAt)}</td></tr>`).join("")}</tbody></table></div><div class="actions"><button class="btn" data-action="excel">Excel \u0442\u0430\u0442\u0430\u0445</button><button class="btn secondary" data-action="print">PDF / \u0445\u044D\u0432\u043B\u044D\u0445</button></div>`;
  } else if (S) {
    $("reportContent").innerHTML = `<h3>${esc(S.name)} \xB7 \u041C\u0438\u043D\u0438\u0439 \u0430\u0445\u0438\u0446</h3>${progressChart(S.attempts.filter((a) => a.submittedAt))}${skillBars(S.attempts)}<button class="btn" data-action="print">PDF / \u0445\u044D\u0432\u043B\u044D\u0445</button>`;
  } else
    $("reportContent").innerHTML = empty(
      "\u0411\u0430\u0433\u0448 \u044D\u0441\u0432\u044D\u043B \u0441\u0443\u0440\u0430\u0433\u0447\u0438\u0439\u043D \u044D\u0440\u0445\u044D\u044D\u0440 \u043D\u044D\u0432\u0442\u044D\u0440\u0447 \u0442\u0430\u0439\u043B\u0430\u043D\u0433\u0430\u0430 \u04AF\u0437\u044D\u044D\u0440\u044D\u0439."
    );
}
function mistakes(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows)
    for (const f of row.attempt.feedback || []) {
      const key = row.attempt.assignmentId + ":" + f.q;
      const x = map.get(key) || { q: f.q, total: 0, wrong: 0 };
      x.total++;
      if (!f.ok) x.wrong++;
      map.set(key, x);
    }
  return [...map.values()].sort((a, b) => b.wrong - a.wrong).filter((x) => x.wrong).slice(0, 10).map(
    (x) => `<p>${esc(x.q)} \xB7 ${x.wrong}/${x.total} \u0431\u0443\u0440\u0443\u0443 (${pct(x.wrong, x.total)}%)</p>`
  ).join("") || empty("\u0410\u043B\u0434\u0430\u0430\u0442\u0430\u0439 \u0445\u0430\u0440\u0438\u0443\u043B\u0442 \u0445\u0430\u0440\u0430\u0430\u0445\u0430\u043D \u0430\u043B\u0433\u0430.");
}
var actions = {
  goStudent: () => show("student"),
  recover: async () => {
    if (!$("email").value) throw new Error("\u0418-\u043C\u044D\u0439\u043B \u0445\u0430\u044F\u0433\u0430\u0430 \u043E\u0440\u0443\u0443\u043B\u043D\u0430 \u0443\u0443.");
    await requestPasswordRecovery($("email").value);
    notice("\u041D\u0443\u0443\u0446 \u04AF\u0433 \u0441\u044D\u0440\u0433\u044D\u044D\u0445 \u0445\u043E\u043B\u0431\u043E\u043E\u0441\u044B\u0433 \u0438-\u043C\u044D\u0439\u043B\u044D\u044D\u0441\u044D\u044D \u0448\u0430\u043B\u0433\u0430\u043D\u0430 \u0443\u0443.");
  },
  teacherLogout: async () => {
    await logout();
    teacher = T = reportData = null;
    actions.clearDraft();
    $("aiTopic").value = "";
    $("importFile").value = "";
    $("teacherWorkspace").hidden = true;
    $("teacherAuth").hidden = false;
    $("teacherWorkspace").querySelectorAll("#classList,#taskList,#assignmentList,#issuedCode").forEach((e) => e.innerHTML = "");
    $("reportContent").innerHTML = empty("\u0422\u0430\u0439\u043B\u0430\u043D\u0433\u0430\u0430 \u0445\u0430\u0440\u0430\u0445\u044B\u043D \u0442\u0443\u043B\u0434 \u043D\u044D\u0432\u0442\u044D\u0440\u043D\u044D \u04AF\u04AF.");
    notice("\u0411\u0430\u0433\u0448\u0438\u0439\u043D \u044D\u0440\u0445\u044D\u044D\u0441 \u0433\u0430\u0440\u043B\u0430\u0430.");
  },
  studentLogout: async () => {
    await api("/student/logout", {});
    clearInterval(timer);
    S = active = null;
    $("studentWorkspace").hidden = true;
    $("studentAuth").hidden = false;
    $("studentTasks").innerHTML = $("studentHistory").innerHTML = $("myProgress").innerHTML = "";
    $("gameArea").innerHTML = empty("\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u0430\u0436\u0438\u043B\u043B\u0430\u0445\u044B\u043D \u0442\u0443\u043B\u0434 \u043D\u044D\u0432\u0442\u044D\u0440\u043D\u044D \u04AF\u04AF.");
    $("reportContent").innerHTML = empty("\u0422\u0430\u0439\u043B\u0430\u043D\u0433\u0430\u0430 \u0445\u0430\u0440\u0430\u0445\u044B\u043D \u0442\u0443\u043B\u0434 \u043D\u044D\u0432\u0442\u044D\u0440\u043D\u044D \u04AF\u04AF.");
    notice("\u0421\u0443\u0440\u0430\u0433\u0447\u0438\u0439\u043D \u044D\u0440\u0445\u044D\u044D\u0441 \u0433\u0430\u0440\u043B\u0430\u0430.");
  },
  addQuestion: () => {
    draft = captureDraft();
    draft.push(questionBlank());
    renderDraft();
  },
  removeQuestion: (b) => {
    draft = captureDraft();
    draft.splice(+b.dataset.index, 1);
    renderDraft();
  },
  clearDraft: () => {
    $("taskForm").reset();
    draft = [questionBlank()];
    renderDraft();
  },
  generate: async () => {
    notice("AI \u043D\u043E\u043E\u0440\u043E\u0433 \u04AF\u04AF\u0441\u0433\u044D\u0436 \u0431\u0430\u0439\u043D\u0430\u2026");
    const t = await api("/teacher/ai", {
      topic: $("aiTopic").value,
      level: +$("level").value
    });
    fillDraft(t);
    notice("AI \u043D\u043E\u043E\u0440\u043E\u0433 \u0431\u044D\u043B\u044D\u043D. \u042D\u0445, \u0430\u0441\u0443\u0443\u043B\u0442, \u0437\u04E9\u0432 \u0445\u0430\u0440\u0438\u0443\u043B\u0442\u044B\u0433 \u043D\u044F\u0433\u0442\u043B\u0430\u0430\u0434 \u0445\u0430\u0434\u0433\u0430\u043B\u043D\u0430 \u0443\u0443.");
  },
  resetCode: async (b) => {
    const r = await api(`/teacher/students/${b.dataset.id}/reset`, {});
    issued(
      `\u0428\u0438\u043D\u044D \u0445\u0443\u0432\u0438\u0439\u043D \u043A\u043E\u0434: ${r.code}. \u04E8\u043C\u043D\u04E9\u0445 \u043A\u043E\u0434 \u0445\u04AF\u0447\u0438\u043D\u0433\u04AF\u0439 \u0431\u043E\u043B\u0441\u043E\u043D. \u041A\u043E\u0434\u044B\u0433 \u0445\u0443\u0443\u043B\u0436 \u0430\u0432\u0430\u0430\u0434 \u0437\u04E9\u0432\u0445\u04E9\u043D \u044D\u043D\u044D \u0441\u0443\u0440\u0430\u0433\u0447\u0438\u0434 \u04E9\u0433\u043D\u04E9 \u04AF\u04AF.`
    );
    notice("\u0425\u0443\u0432\u0438\u0439\u043D \u043A\u043E\u0434 \u0448\u0438\u043D\u044D\u0447\u043B\u044D\u0433\u0434\u043B\u044D\u044D.");
  },
  editTask: (b) => {
    fillDraft(T.tasks.find((x) => x.id === b.dataset.id));
    $("taskForm").scrollIntoView({ behavior: "smooth" });
    notice(
      "\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0440\u044B\u043D \u0445\u0443\u0443\u043B\u0431\u0430\u0440 \u043D\u044D\u044D\u0433\u0434\u043B\u044D\u044D. \u0417\u0430\u0441\u0432\u0430\u0440\u043B\u0430\u0430\u0434 \u0448\u0438\u043D\u044D \u0445\u0443\u0432\u0438\u043B\u0431\u0430\u0440 \u0431\u043E\u043B\u0433\u043E\u043D \u0445\u0430\u0434\u0433\u0430\u043B\u043D\u0430 \u0443\u0443."
    );
  },
  deleteTask: async (b) => {
    await api("/teacher/tasks/" + b.dataset.id, null, "DELETE");
    await loadTeacher();
    notice("\u0414\u0430\u0430\u043B\u0433\u0430\u0432\u0430\u0440 \u0443\u0441\u0442\u0433\u0430\u0433\u0434\u043B\u0430\u0430.");
  },
  start: (b) => start(b.dataset.id),
  review: (b) => {
    if (active)
      throw new Error(
        "\u0410\u0436\u0438\u043B\u043B\u0430\u0436 \u0431\u0443\u0439 \u0434\u0430\u0430\u043B\u0433\u0430\u0432\u0440\u0430\u0430 \u0438\u043B\u0433\u044D\u044D\u0441\u043D\u0438\u0439 \u0434\u0430\u0440\u0430\u0430 \u04E9\u043C\u043D\u04E9\u0445 \u04AF\u043D\u044D\u043B\u0433\u044D\u044D\u0433\u044D\u044D \u04AF\u0437\u044D\u044D\u0440\u044D\u0439."
      );
    renderFeedback(S.attempts.find((a) => a.id === b.dataset.id));
  },
  refreshReport: loadReport,
  excel: async () => {
    await getUser();
    const r = await fetch("/api/teacher/report.xlsx");
    if (!r.ok) throw new Error("\u0422\u0430\u0439\u043B\u0430\u043D \u0442\u0430\u0442\u0430\u0433\u0434\u0441\u0430\u043D\u0433\u04AF\u0439. \u0414\u0430\u0445\u0438\u043D \u043D\u044D\u0432\u0442\u044D\u0440\u043D\u044D \u04AF\u04AF.");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "eh-helnii-ezed.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  },
  print: () => window.print()
};
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-view]");
  if (nav) show(nav.dataset.view);
  const b = e.target.closest("[data-action]");
  if (b && actions[b.dataset.action])
    safe(() => actions[b.dataset.action](b), b);
});
window.addEventListener("beforeunload", (e) => {
  if (active) {
    e.preventDefault();
    e.returnValue = "";
  }
});
draft = [questionBlank()];
renderDraft();
safe(async () => {
  const callback = await handleAuthCallback();
  if (callback?.type === "invite") {
    inviteToken = callback.token;
    show("teacher");
    $("authForm").hidden = true;
    $("resetForm").hidden = false;
    notice("\u0423\u0440\u0438\u043B\u0433\u0430\u0430 \u0445\u04AF\u043B\u044D\u044D\u043D \u0430\u0432\u0447 \u043D\u0443\u0443\u0446 \u04AF\u0433 \u0442\u043E\u0445\u0438\u0440\u0443\u0443\u043B\u043D\u0430 \u0443\u0443.");
    return;
  }
  teacher = await getUser();
  if (callback?.type === "recovery") {
    show("teacher");
    $("authForm").hidden = true;
    $("resetForm").hidden = false;
    notice("\u0428\u0438\u043D\u044D \u043D\u0443\u0443\u0446 \u04AF\u0433\u044D\u044D \u043E\u0440\u0443\u0443\u043B\u043D\u0430 \u0443\u0443.");
  } else if (teacher) await loadTeacher();
  try {
    if (teacher) {
      try {
        await api("/student/logout", {});
      } catch {
      }
    } else await loadStudent();
  } catch (e) {
    if (!e.message.includes("\u043D\u044D\u0432\u0442\u044D\u0440")) notice(e.message, true);
  }
});
