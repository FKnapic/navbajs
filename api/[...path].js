/* Generirano iz server/vercel.ts. Ne uređivati ručno. */

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
};
var handleParsingNestedValues = (form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};
var throwNestingLimitExceeded = () => {
  throw new Error("Nesting limit exceeded");
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var stripPathPrefix = (rawPath, decodedPath, prefixLength) => {
  if (rawPath.at(-1) === "/" && decodedPath.at(-1) !== "/") rawPath = rawPath.slice(0, -1);
  let index = 0;
  for (let i = decodedPath.indexOf("/"); i !== -1 && i < prefixLength; i = decodedPath.indexOf("/", i + 1)) {
    index = rawPath.indexOf("/", index + 1);
    if (index === -1) return "/";
  }
  return rawPath.slice(index) || "/";
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    const queryIndex = url.indexOf("?", 8);
    let keyIndex2 = queryIndex;
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61 || trailingKeyCode === 38 || isNaN(trailingKeyCode)) {
        if (keyIndex2 > queryIndex && /(?:^|&)[^=&]*[%+]/.test(url.slice(queryIndex + 1, keyIndex2))) break;
        if (trailingKeyCode === 61) {
          const valueIndex = keyIndex2 + key.length + 2;
          const endIndex = url.indexOf("&", valueIndex);
          return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
        }
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  };
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = (layout) => this.#layout = layout;
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = () => this.#layout;
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = (name, value, options) => {
    if (this.finalized && !this.#res.bodyUsed) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  };
  status = (status) => {
    this.#status = status;
  };
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  };
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = (object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  };
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler2 = i === middleware.length && next || void 0;
      if (handler2) try {
        res = await handler2(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
  };
};

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/utils/mount.js
var getPathPrefixLength = (c, pathPrefix, routePath) => {
  if (!/[:*]/.test(pathPrefix)) return pathPrefix.length;
  const path = c.req.path;
  const matchResult = c.req[GET_MATCH_RESULT];
  const paramNames = /* @__PURE__ */ new Set();
  let length = 0;
  for (const part of splitRoutingPath(pathPrefix)) {
    const pattern = getPattern(part);
    if (pattern && pattern !== "*") {
      const name = pattern[1];
      if (paramNames.has(name)) throw new Error(`mount(): Duplicate path parameter "${name}" in "${routePath}".`);
      paramNames.add(name);
    }
    if (pattern && pattern !== "*" && pattern[2] !== true) {
      const value = matchResult.length === 2 ? matchResult[1][matchResult[0][c.req.routeIndex][1][pattern[1]]] : matchResult[0][c.req.routeIndex][1][pattern[1]];
      length += value.length + 1;
    } else if (pattern || part.endsWith("*")) {
      const end = path.indexOf("/", length + 1);
      length = end === -1 ? path.length : end;
    } else length += part.length + 1;
  }
  return length;
};
var createMountedRequest = (c, pathPrefix, routePath) => {
  if (/[^/]\*$/.test(routePath)) throw new Error(`mount(): Wildcard must follow "/" in "${routePath}".`);
  const url = new URL(c.req.raw.url);
  url.pathname = stripPathPrefix(url.pathname, c.req.path, getPathPrefixLength(c, pathPrefix, routePath));
  return new Request(url, c.req.raw);
};

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class Hono2 {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler2) => {
          this.#addRoute(methodName, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler2 of handlers) this.#addRoute(methodName, this.#path, handler2);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute("ALL", this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app) {
    const subApp = this.basePath(path);
    app.routes.map((r) => {
      let handler2;
      if (app.errorHandler === errorHandler) handler2 = r.handler;
      else {
        handler2 = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = (request) => request;
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    const mergedPath = mergePath(this._basePath, path);
    const defaultReplaceRequest = (c) => createMountedRequest(c, mergedPath.replace(/\/$/, ""), mergePath(mergedPath, "*"));
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest ? replaceRequest(c.req.raw) : defaultReplaceRequest(c), ...getOptions(c));
      if (res) return res;
      await next();
    };
    this.#addRoute("ALL", mergePath(path, "*"), handler2);
    return this;
  }
  #addRoute(method, path, handler2, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler: handler2
    };
    this.router.add(method, path, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  };
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = "[^]*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/[^]*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === "[^]*" || a === "(?:|/[^]*)") return b === "[^]*" ? -1 : 1;
  else if (b === "[^]*" || b === "(?:|/[^]*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class Node2 {
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, keys) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ONLY_WILDCARD_REG_EXP_STR
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (new RegExp(regexpStr).test("")) throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        keys.push(regexpStr);
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== "[^]*" && regexpStr !== "(?:|/[^]*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        keys.push(token);
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    const keys = [];
    if (isStatic) {
      this.#root.insert(path.split(""), -1, [], this.#context, keys);
      this.paths[path] = [
        -1,
        [],
        keys
      ];
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{(?:\{[\d,]+\}|[^}])+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./gs) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, keys);
    this.paths[path] = [
      this.#index++,
      paramAssoc,
      keys
    ];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
function endsWithWildcard(keys) {
  const tail = keys[keys.length - 1];
  return tail === "[^]*" || tail === "(?:|/[^]*)";
}
function covers(wildcard, target) {
  const last = wildcard.length - 1;
  for (let i = 0; i < last; i++) if (wildcard[i] !== target[i]) return false;
  return wildcard[last] === "[^]*" || target.length === last || target[last] === "/";
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #handlers;
  #tries;
  constructor() {
    this.#handlers = { ["ALL"]: [] };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler2) {
    const handlers = this.#handlers;
    if (!handlers) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    const tries = this.#tries;
    if (!handlers[method]) {
      tries[method] = new Trie();
      handlers[method] = [...handlers["ALL"]];
      for (const p in tries["ALL"].paths) this.#insertPath(method, p);
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(handlers) : [method];
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!tries[m].paths[path2]) this.#insertPath(m, path2);
      handlers[m].push([handler2, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#handlers)) matchers[method] = this.#buildMatcher(method);
    this.#handlers = this.#tries = void 0;
    return matchers;
  }
  #buildMatcher(method) {
    const handlers = this.#handlers[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    const own = createNullObject();
    const entries = handlers.map(([h, p], i) => {
      (own[p] ??= []).push(i);
      return [h, trie.paths[p][1].reduceRight((map, [key, varIndex]) => {
        map[key] = paramReplacementMap[varIndex];
        return map;
      }, createNullObject())];
    });
    const wildcards = Object.keys(own).filter((p) => endsWithWildcard(trie.paths[p][2]));
    for (const path in trie.paths) {
      const [index, , keys] = trie.paths[path];
      const indexes = [...own[path]];
      for (const p of wildcards) if (p !== path && covers(trie.paths[p][2], keys)) indexes.push(...own[p]);
      const data = indexes.sort((a, b) => a - b).map((i) => entries[i]);
      if (index === -1) {
        const last = Math.max(-1, ...data.flatMap(([, map]) => Object.values(map)));
        staticMap[path] = [data, last === -1 ? emptyParam : path.match(regexp).slice(0, last + 1)];
      } else handlerData[index] = data;
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler2) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler2
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler2) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler: handler2,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              if (!Object.hasOwn(params, name)) params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            if (!Object.hasOwn(params, name)) params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler2) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler2);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: [
      "GET",
      "HEAD",
      "PUT",
      "POST",
      "DELETE",
      "PATCH",
      "QUERY"
    ],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
  const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") return () => optsOrigin;
      else return (origin) => optsOrigin === origin ? origin : null;
    } else if (typeof optsOrigin === "function") return optsOrigin;
    else return (origin) => optsOrigin.includes(origin) ? origin : null;
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
    else if (Array.isArray(optsAllowMethods)) {
      const methodsStr = optsAllowMethods.join(",");
      return () => methodsStr;
    } else return () => "";
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) set("Access-Control-Allow-Origin", allowOrigin);
    if (opts.credentials) set("Access-Control-Allow-Credentials", "true");
    if (exposeHeadersStr) set("Access-Control-Expose-Headers", exposeHeadersStr);
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") c.res.headers.append("Vary", "Origin");
      if (opts.maxAge != null) set("Access-Control-Max-Age", opts.maxAge.toString());
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods) set("Access-Control-Allow-Methods", allowMethods);
      let headersStr = allowHeadersStr;
      if (!headersStr) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) headersStr = requestHeaders.split(",").map((h) => h.trim()).join(",");
      }
      if (headersStr) {
        set("Access-Control-Allow-Headers", headersStr);
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") c.header("Vary", "Origin", { append: true });
  };
};

// src/api/normalizeBajs.ts
function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function normalizePlace(place) {
  if (place.active_place !== 1) return null;
  if (place.bike === true && place.spot !== true) return null;
  const lat = num(place.lat);
  const lng = num(place.lng);
  if (lat == null || lng == null || Math.abs(lat) < 1 || Math.abs(lng) < 1) return null;
  const onSite = num(place.bikes) ?? 0;
  const booked = num(place.booked_bikes) ?? 0;
  const available = num(place.bikes_available_to_rent) ?? Math.max(0, onSite - booked);
  return {
    id: place.uid,
    number: place.number,
    name: (place.name ?? "").trim() || `Stanica ${place.number}`,
    lat,
    lng,
    bikes: Math.max(0, available),
    bikesOnSite: Math.max(0, onSite),
    freeRacks: Math.max(0, num(place.free_racks) ?? 0),
    racks: Math.max(0, num(place.bike_racks) ?? 0),
    maintenance: place.maintenance === true
  };
}
function normalizeNextbike(payload) {
  const stations = [];
  for (const country of payload.countries ?? []) {
    for (const city of country.cities ?? []) {
      for (const place of city.places ?? []) {
        const station = normalizePlace(place);
        if (station) stations.push(station);
      }
    }
  }
  return stations;
}

// src/lib/geo.ts
var ZAGREB_CENTER = { lat: 45.813, lng: 15.9815 };
function haversineM(a, b) {
  const radius = 6371e3;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

// src/lib/addressQuery.ts
var CITY_BBOX = {
  south: 45.74,
  west: 15.78,
  north: 45.9,
  east: 16.22
};
var WIDER_BBOX = {
  south: 45.68,
  west: 15.78,
  north: 45.95,
  east: 16.25
};
function fold(value) {
  return value.replace(/đ/g, "d").replace(/Đ/g, "d").normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function parseAddressQuery(input) {
  let text = input.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/\bul\.(?=\s|$)/gi, "");
  text = text.replace(/\bul(?=\s)/gi, "");
  text = text.replace(/\bbr\.(?=\s|$)/gi, "");
  text = text.replace(/\bbr(?=\s+\d)/gi, "");
  text = text.replace(/\btr\.(?=\s|$)/gi, "trg");
  text = text.replace(/\btr(?=\s)/gi, "trg");
  text = text.replace(/\bav\.(?=\s|$)/gi, "avenija");
  text = text.replace(/\bav(?=\s)/gi, "avenija");
  text = text.replace(/\bc\.(?=\s|$)/gi, "cesta");
  text = text.replace(/\bc(?=\s)/gi, "cesta");
  text = text.replace(new RegExp("(\\p{L})(\\d)", "gu"), "$1 $2");
  const withoutCity = text.replace(/\bgrad\s+zagreb\b/gi, " ").replace(/\bzagreb\b/gi, " ").replace(/\s+/g, " ").trim();
  if (/\d/.test(withoutCity) || withoutCity.split(" ").filter(Boolean).length >= 2) text = withoutCity;
  text = text.replace(/\s+/g, " ").trim();
  const wider = /\b(velika\s+gorica|gorica|zapresic|samobor)\b/.test(fold(text));
  const leadingHouse = text.match(new RegExp("^(\\d+[a-zA-Z]?(?:\\/\\d+[a-zA-Z]?)?)\\s+(.*\\p{L}.*)$", "u"));
  if (leadingHouse && fold(leadingHouse[2]).length >= 2) {
    const street = leadingHouse[2].trim();
    const house = leadingHouse[1];
    return { raw: input.trim(), text: `${street} ${house}`, street, house, wider };
  }
  const houseMatch = text.match(new RegExp("^(.*\\p{L}.*?)\\s+(\\d+[a-zA-Z]?(?:\\/\\d+[a-zA-Z]?)?)$", "u"));
  if (houseMatch && fold(houseMatch[1]).length >= 2) {
    return { raw: input.trim(), text, street: houseMatch[1].trim(), house: houseMatch[2], wider };
  }
  return { raw: input.trim(), text, street: text, house: null, wider };
}
function searchBBox(parsed) {
  return parsed.wider ? WIDER_BBOX : CITY_BBOX;
}
function inSearchArea(point, bbox) {
  return point.lat >= bbox.south && point.lat <= bbox.north && point.lng >= bbox.west && point.lng <= bbox.east;
}
function houseKey(value) {
  const compact = value.toLowerCase().replace(/\s+/g, "");
  const letter = compact.match(/^(\d+)[/-]([a-z])$/);
  if (letter) return `${letter[1]}${letter[2]}`;
  return compact;
}
function housesEqual(wanted, got) {
  return houseKey(wanted) === houseKey(got);
}
function houseNumeric(value) {
  const match2 = value.match(/\d+/);
  return match2 ? Number(match2[0]) : Number.POSITIVE_INFINITY;
}
var STREET_SUFFIX = /^(?:a|u|e|o|ov|ova|evo|eva|ska|ski|sko|skoj|skog|ina|in)?$/;
var GENERIC_STREET = /* @__PURE__ */ new Set([
  "ulica",
  "ulice",
  "cesta",
  "ceste",
  "avenija",
  "avenije",
  "put",
  "aleja",
  "poljana",
  "prolaz",
  "prilaz",
  "trg",
  "grada",
  "kneza",
  "kralja"
]);
var DISTINCT_TYPE = /* @__PURE__ */ new Set(["obala", "setaliste", "nasip", "most", "stube", "brijeg", "odvojak", "gat"]);
function sharedPrefix(left, right) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return index;
}
function tokenNear(token, part) {
  if (token === part) return true;
  if (part.startsWith(token)) {
    const rest = part.slice(token.length);
    if (rest === "" || STREET_SUFFIX.test(rest)) return true;
  }
  if (token.startsWith(part) && part.length >= 5 && STREET_SUFFIX.test(token.slice(part.length))) return true;
  return stemMatch(token, part);
}
function tokensMatch(query, hay) {
  const wanted = query.split(" ").filter((token) => token.length >= 4);
  const parts = hay.split(" ").filter((token) => token.length >= 4);
  if (!wanted.length) {
    if (query.length < 3) return false;
    return hay.split(" ").some((part) => part.startsWith(query) || tokenNear(query, part));
  }
  return wanted.every((token) => parts.some((part) => tokenNear(token, part)));
}
function streetMatches(queryStreet, hit, allowName = false) {
  if (conflictingType(queryStreet, hit)) return false;
  const query = fold(queryStreet);
  if (!query) return false;
  const street = fold(hit.street);
  const name = fold(hit.name);
  if (street && tokensMatch(query, street)) return true;
  if (!street && name && tokensMatch(query, name)) return true;
  if (allowName && name && (tokensMatch(query, name) || acronymHit(query, name))) return true;
  return false;
}
function initials(name) {
  return fold(name).split(/[\s-]+/).filter((word) => word.length > 2).map((word) => word[0]).join("");
}
function acronymHit(query, name) {
  if (!query || query.includes(" ") || query.length < 2 || query.length > 6) return false;
  return initials(name) === query;
}
function stemMatch(token, part) {
  const stem = sharedPrefix(token, part);
  const left = token.slice(stem);
  const right = part.slice(stem);
  if (left === "gne" && right === "nje" || left === "nje" && right === "gne") return stem >= 4;
  if (stem < 5) return false;
  if (left === right) return true;
  const adjective = /* @__PURE__ */ new Set(["ska", "ova", "eva"]);
  return adjective.has(left) && right === "a" || adjective.has(right) && left === "a";
}
function specificExtras(queryStreet, hit) {
  const queryTokens = fold(queryStreet).split(" ").filter((token) => token.length >= 4);
  return fold(hit.street).split(" ").filter((part) => part.length >= 4).filter((part) => !GENERIC_STREET.has(part) && !queryTokens.some((token) => tokenNear(token, part))).length;
}
function conflictingType(queryStreet, hit) {
  const queryTokens = new Set(fold(queryStreet).split(" "));
  return fold(hit.street).split(" ").some((part) => DISTINCT_TYPE.has(part) && !queryTokens.has(part));
}
function cityAllowed(hit, wider) {
  const city = fold(hit.city);
  if (!city) return true;
  if (city.includes("zagreb")) return true;
  if (!wider) return false;
  return city.includes("gorica") || city.includes("zapresic") || city.includes("samobor");
}
function areaLabel(hit) {
  const raw2 = hit.district || hit.locality;
  return raw2.replace(/^mjesni odbor\s+/i, "").replace(/^gradska četvrt\s+/i, "").replace(/"/g, "").trim();
}
function present(hit, approximate) {
  const area = areaLabel(hit);
  const title = hit.street && hit.housenumber ? `${hit.street} ${hit.housenumber}` : hit.name ? hit.name : hit.street || "To\u010Dka u Zagrebu";
  const subtitle = [approximate ? "pribli\u017Ena lokacija" : "", area, "Zagreb"].filter(Boolean).join(", ");
  return {
    label: approximate ? `${title} \xB7 pribli\u017Ena lokacija` : title,
    title,
    subtitle,
    lat: hit.lat,
    lng: hit.lng,
    ...approximate ? { approximate: true } : {}
  };
}
function dedupe(places) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const place of places) {
    const key = `${fold(place.title)}@${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(place);
  }
  return unique.slice(0, 8);
}
function rankHits(hits, parsed, bias) {
  const bbox = searchBBox(parsed);
  const inside = hits.filter((hit) => inSearchArea(hit, bbox) && cityAllowed(hit, parsed.wider));
  if (parsed.house) {
    const exact = inside.filter(
      (hit) => hit.housenumber && housesEqual(parsed.house ?? "", hit.housenumber) && streetMatches(parsed.street, hit)
    );
    if (exact.length) {
      const centroid = clusterCentroid(exact);
      exact.sort((a, b) => {
        const point = Number(b.addressPoint) - Number(a.addressPoint);
        if (point !== 0) return point;
        const along = haversineM(centroid, a) - haversineM(centroid, b);
        if (Math.abs(along) > 25) return along;
        return haversineM(bias, a) - haversineM(bias, b);
      });
      return dedupe(exact.map((hit) => present(hit, false)));
    }
    const onStreet = inside.filter((hit) => streetMatches(parsed.street, hit));
    if (!onStreet.length) return [];
    const wanted = houseNumeric(parsed.house);
    onStreet.sort((a, b) => {
      const delta = Math.abs(houseNumeric(a.housenumber) - wanted) - Math.abs(houseNumeric(b.housenumber) - wanted);
      if (delta !== 0) return delta;
      return haversineM(bias, a) - haversineM(bias, b);
    });
    return dedupe([present(onStreet[0], true)]);
  }
  const ranked = inside.filter((hit) => streetMatches(parsed.text, hit, true)).sort((a, b) => score(b, parsed, bias) - score(a, parsed, bias));
  return dedupe(ranked.map((hit) => present(hit, false)));
}
function clusterCentroid(hits) {
  const lat = hits.reduce((sum, hit) => sum + hit.lat, 0) / hits.length;
  const lng = hits.reduce((sum, hit) => sum + hit.lng, 0) / hits.length;
  return { lat, lng };
}
function score(hit, parsed, bias) {
  let value = 0;
  const query = fold(parsed.text);
  const name = fold(hit.name);
  const street = fold(hit.street);
  if (parsed.house && hit.housenumber && housesEqual(parsed.house, hit.housenumber)) value += 1e3;
  if (streetMatches(parsed.street || parsed.text, hit)) value += 400;
  if (name && (name === query || name.includes(query))) value += 350;
  if (name && acronymHit(query, name)) value += 800;
  if (!hit.name && parsed.house) value += 30;
  if (hit.kind === "street" && !parsed.house) value += 40;
  if (hit.kind === "poi" && !parsed.house) value += 20;
  if (street && query && street.startsWith(query)) value += 20;
  value -= specificExtras(parsed.street || parsed.text, hit) * 250;
  value -= Math.min(haversineM(bias, hit), 8e3) / 80;
  return value;
}
function hitFromPhoton(properties, coordinates) {
  if (!coordinates || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const housenumber = properties?.housenumber?.trim() ?? "";
  const name = properties?.name?.trim() ?? "";
  const street = properties?.street?.trim() ?? "";
  const type = properties?.type ?? "";
  const key = properties?.osm_key ?? "";
  const kind = housenumber ? "house" : key === "highway" || type === "street" ? "street" : name ? "poi" : "other";
  return {
    lat,
    lng,
    name,
    street,
    housenumber,
    locality: properties?.locality?.trim() ?? "",
    district: properties?.district?.trim() ?? "",
    city: properties?.city?.trim() ?? "",
    kind,
    addressPoint: key === "building" || key === "place" || housenumber !== "" && name === ""
  };
}

// src/api/zagrebAddresses.ts
var DEFAULT_URL = "https://arcportal.zagreb.hr/server/rest/services/DKPiRPJ/KBR_ku\u0107ni_broj/MapServer/1/query";
var NEAR_NUMBER = 2;
var NEAR_EXACT_M = 4e3;
var HOMONYM_GAP_M = 2e3;
var SKIPPED_TOKEN = /* @__PURE__ */ new Set(["ulica", "ulice", "grada"]);
var streetHouses = /* @__PURE__ */ new Map();
var OfficialAddressError = class extends Error {
  constructor() {
    super("Slu\u017Ebene adrese nisu dostupne");
    this.name = "OfficialAddressError";
  }
};
function serviceUrl() {
  const runtime = globalThis;
  const fromServer = runtime.process?.env?.ZAGREB_ADDRESS_URL?.trim();
  if (fromServer) return fromServer;
  const configured = import.meta.env?.VITE_ZAGREB_ADDRESS_URL?.trim();
  if (configured) return configured;
  return DEFAULT_URL;
}
function sqlToken(token) {
  if (!/^[\p{L}\p{N}]+$/u.test(token)) return null;
  return token.replace(/'/g, "''");
}
var DIACRITIC = {
  c: ["c", "\u010D", "\u0107"],
  s: ["s", "\u0161"],
  z: ["z", "\u017E"],
  d: ["d", "\u0111"],
  C: ["C", "\u010C", "\u0106"],
  S: ["S", "\u0160"],
  Z: ["Z", "\u017D"],
  D: ["D", "\u0110"]
};
function diacriticForms(token) {
  let forms = [""];
  for (const char of token) {
    const options = DIACRITIC[char] ?? [char];
    const next = [];
    for (const form of forms) {
      for (const option of options) {
        next.push(form + option);
        if (next.length >= 24) return next;
      }
    }
    forms = next;
  }
  return forms;
}
function spellings(token) {
  const folded = fold(token);
  const alts = /* @__PURE__ */ new Set([token]);
  for (const ending of ["ska", "ova", "eva"]) {
    if (folded.endsWith(ending) && folded.length - ending.length >= 6) {
      alts.add(token.slice(0, token.length - ending.length));
    }
  }
  if (folded.endsWith("gne") && token.length > 4) alts.add(`${token.slice(0, -3)}nje`);
  if (folded.endsWith("nje") && token.length > 4) alts.add(`${token.slice(0, -3)}gne`);
  return [...alts];
}
function streetClause(street) {
  const groups = [];
  for (const token of street.split(/\s+/)) {
    if (SKIPPED_TOKEN.has(fold(token)) || fold(token).length < 4) continue;
    const likes = [...new Set(spellings(token).flatMap((item) => diacriticForms(item)))].map(sqlToken).filter((item) => item != null).slice(0, 12).map((item) => `UL_IME LIKE '%${item}%'`);
    if (!likes.length) return null;
    groups.push(likes.length === 1 ? likes[0] : `(${likes.join(" OR ")})`);
  }
  return groups.length ? groups.join(" AND ") : null;
}
function houseClause(house) {
  const compact = house.toLowerCase().replace(/\s+/g, "");
  const letter = compact.match(/^(\d+)[/-]?([a-z])$/);
  const plain = compact.match(/^(\d+)$/);
  const number = letter?.[1] ?? plain?.[1];
  if (!number || !/^\d+$/.test(number)) return null;
  if (!letter) return `(KB = '${number}' OR KB LIKE '${number}/%')`;
  const suffix = letter[2];
  const forms = [.../* @__PURE__ */ new Set([suffix, suffix.toUpperCase()])];
  const parts = forms.flatMap((form) => [
    `KB = '${number}${form}'`,
    `KB = '${number}/${form}'`,
    `KB LIKE '${number}${form}/%'`,
    `KB LIKE '${number}/${form}/%'`
  ]);
  return `(${parts.join(" OR ")})`;
}
function houseWhere(parsed, exact) {
  const street = streetClause(parsed.street);
  if (!street) return null;
  if (!exact) return street;
  const house = parsed.house ? houseClause(parsed.house) : null;
  if (!house) return null;
  return `${street} AND ${house}`;
}
function houseNumeric2(value) {
  const match2 = value.match(/\d+/);
  return match2 ? Number(match2[0]) : Number.POSITIVE_INFINITY;
}
function closest(hits, bias) {
  return hits.reduce(
    (best, hit) => !best || haversineM(bias, hit) < haversineM(bias, best) ? hit : best,
    null
  );
}
function pickOfficialHits(exactHits, streetHits, parsed, bias) {
  if (!parsed.house) return [];
  const bbox = searchBBox(parsed);
  const inside = (hit) => inSearchArea(hit, bbox);
  const wanted = houseNumeric2(parsed.house);
  const onStreet = (hit) => inside(hit) && streetMatches(parsed.street, hit);
  const exact = exactHits.filter(
    (hit) => onStreet(hit) && hit.housenumber && housesEqual(parsed.house ?? "", hit.housenumber)
  );
  const nearestExact = closest(exact, bias);
  if (nearestExact && haversineM(nearestExact, bias) <= NEAR_EXACT_M) return exact;
  const pool = streetHits.length ? streetHits : exactHits;
  const onStreetHits = pool.filter((hit) => onStreet(hit) && hit.housenumber).sort((a, b) => {
    const delta = Math.abs(houseNumeric2(a.housenumber) - wanted) - Math.abs(houseNumeric2(b.housenumber) - wanted);
    if (delta !== 0) return delta;
    return haversineM(bias, a) - haversineM(bias, b);
  });
  const nearNumbers = onStreetHits.filter((hit) => Math.abs(houseNumeric2(hit.housenumber) - wanted) <= NEAR_NUMBER);
  const nearestClose = closest(nearNumbers, bias);
  if (nearestExact && nearestClose && !housesEqual(parsed.house ?? "", nearestClose.housenumber) && haversineM(nearestExact, bias) - haversineM(nearestClose, bias) > HOMONYM_GAP_M) {
    return [nearestClose];
  }
  if (nearestExact) return exact;
  const bestNear = nearNumbers[0];
  if (bestNear) return housesEqual(parsed.house ?? "", bestNear.housenumber) ? exact : [bestNear];
  return onStreetHits[0] ? [onStreetHits[0]] : [];
}
function combineSignals(signals) {
  const any = AbortSignal.any;
  if (any) return any.call(AbortSignal, signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
function asHit(feature) {
  const street = feature.attributes?.UL_IME?.trim() ?? "";
  const housenumber = feature.attributes?.KB?.trim() ?? "";
  const lng = feature.geometry?.x;
  const lat = feature.geometry?.y;
  if (!street || !housenumber || typeof lat !== "number" || typeof lng !== "number") return null;
  const settlement = feature.attributes?.NA_IME?.trim() ?? "";
  return {
    lat,
    lng,
    name: "",
    street,
    housenumber,
    locality: settlement && settlement !== "Zagreb" ? settlement : "",
    district: feature.attributes?.GC_IME?.trim() ?? "",
    city: "Zagreb",
    kind: "house",
    addressPoint: true
  };
}
async function fetchHouses(where, signal) {
  const url = new URL(serviceUrl());
  url.searchParams.set("where", where);
  url.searchParams.set("outFields", "UL_IME,KB,NA_IME,GC_IME");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "pjson");
  const timeout = AbortSignal.timeout(8e3);
  let response;
  try {
    response = await fetch(url, { signal: combineSignals([signal, timeout]) });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new OfficialAddressError();
  }
  if (response.status === 429 || response.status >= 500) throw new OfficialAddressError();
  if (!response.ok) throw new OfficialAddressError();
  const payload = await response.json();
  if (payload.error) return [];
  const hits = [];
  for (const feature of payload.features ?? []) {
    const hit = asHit(feature);
    if (hit) hits.push(hit);
  }
  return hits;
}
async function searchOfficialHouses(parsed, bias, signal) {
  if (!parsed.house) return [];
  const streetKey = fold(parsed.street);
  const cached2 = streetHouses.get(streetKey);
  if (cached2) return rankHits(pickOfficialHits(cached2, cached2, parsed, bias), parsed, bias);
  const exactWhere = houseWhere(parsed, true);
  if (!exactWhere) return [];
  const exactHits = await fetchHouses(exactWhere, signal);
  const early = pickOfficialHits(exactHits, [], parsed, bias);
  const earlyRanked = rankHits(early, parsed, bias);
  const earlyExact = earlyRanked.find((item) => !item.approximate);
  const streetWhere = houseWhere(parsed, false);
  if (earlyExact && haversineM(earlyExact, bias) <= NEAR_EXACT_M) {
    if (streetWhere && !streetHouses.has(streetKey)) {
      void fetchHouses(streetWhere, AbortSignal.timeout(8e3)).then((hits) => {
        if (hits.length) streetHouses.set(streetKey, hits);
      }).catch(() => void 0);
    }
    return earlyRanked;
  }
  if (!streetWhere) return earlyRanked;
  const streetHits = await fetchHouses(streetWhere, signal);
  if (streetHits.length) streetHouses.set(streetKey, streetHits);
  const picked = pickOfficialHits(exactHits, streetHits, parsed, bias);
  return rankHits(picked, parsed, bias);
}

// src/data/houseIndex.ts
var buckets = null;
var byPrefix = /* @__PURE__ */ new Map();
function sample(name) {
  return {
    lat: 0,
    lng: 0,
    name: "",
    street: name,
    housenumber: "",
    locality: "",
    district: "",
    city: "Zagreb",
    kind: "house",
    addressPoint: true
  };
}
function houseIndexReady() {
  return buckets != null;
}
function candidates(streetQuery) {
  if (!buckets) return [];
  const folded = fold(streetQuery);
  const tokens = folded.split(" ").filter((token) => token.length >= 4);
  if (!tokens.length) {
    return buckets.filter((street) => street.folded.split(" ").some((word) => word.startsWith(folded)));
  }
  const seen = /* @__PURE__ */ new Set();
  for (const token of tokens) {
    for (const street of byPrefix.get(token.slice(0, 4)) ?? []) seen.add(street);
  }
  return [...seen];
}
function searchIndexedHouses(parsed, bias) {
  if (!parsed.house || !buckets) return null;
  const hits = [];
  for (const street of candidates(parsed.street)) {
    if (!streetMatches(parsed.street, sample(street.name))) continue;
    hits.push(...street.houses);
  }
  if (!hits.length) return [];
  return rankHits(pickOfficialHits(hits, hits, parsed, bias), parsed, bias);
}

// src/data/zagrebPlaces.ts
var PLACES = [
  {
    title: "Fakultet elektrotehnike i ra\u010Dunarstva",
    subtitle: "Unska 3, Trnje",
    lat: 45.80059,
    lng: 15.97112,
    aliases: ["fer", "fakultet elektrotehnike", "fakultet elektrotehnike i racunarstva", "unska 3", "unska"]
  },
  {
    title: "Filozofski fakultet",
    subtitle: "Ivana Lu\u010Di\u0107a 3, Tre\u0161njevka",
    lat: 45.79639,
    lng: 15.97163,
    aliases: ["ffzg", "filozofski", "filozofski fakultet"]
  },
  {
    title: "Prirodoslovno-matemati\u010Dki fakultet",
    subtitle: "Bijeni\u010Dka cesta, Zagreb",
    lat: 45.82695,
    lng: 15.98623,
    aliases: ["pmf", "prirodoslovno matematicki fakultet"]
  },
  {
    title: "Fakultet strojarstva i brodogradnje",
    subtitle: "Ivana Lu\u010Di\u0107a 5, Tre\u0161njevka",
    lat: 45.79522,
    lng: 15.97217,
    aliases: ["fsb", "fakultet strojarstva", "fakultet strojarstva i brodogradnje"]
  },
  {
    title: "Ekonomski fakultet",
    subtitle: "Trg J. F. Kennedyja 6, Maksimir",
    lat: 45.81645,
    lng: 16.01202,
    aliases: ["efzg", "ekonomski fakultet", "ekonomski"]
  },
  {
    title: "Prehrambeno-biotehnolo\u0161ki fakultet",
    subtitle: "Pierottijeva 6, Centar",
    lat: 45.80697,
    lng: 15.96423,
    aliases: ["pbf", "prehrambeno biotehnoloski fakultet"]
  },
  {
    title: "Fakultet kemijskog in\u017Eenjerstva i tehnologije",
    subtitle: "Maruli\u0107ev trg 19, Centar",
    lat: 45.80705,
    lng: 15.97059,
    aliases: ["fkit", "fakultet kemijskog inzenjerstva"]
  },
  {
    title: "Gra\u0111evinski fakultet",
    subtitle: "Fra Andrije Ka\u010Di\u0107a Mio\u0161i\u0107a 26, \u010Crnomerec",
    lat: 45.82509,
    lng: 15.93764,
    aliases: ["grad", "gradevinski fakultet"]
  },
  {
    title: "Medicinski fakultet",
    subtitle: "\u0160alata 3, Gornji grad",
    lat: 45.82009,
    lng: 15.98491,
    aliases: ["mef", "medicinski fakultet"]
  },
  {
    title: "Pravni fakultet",
    subtitle: "Trg Republike Hrvatske 14, Centar",
    lat: 45.81059,
    lng: 15.96988,
    aliases: ["pravni fakultet", "pravni"]
  },
  {
    title: "Akademija dramske umjetnosti",
    subtitle: "Trg Republike Hrvatske 5, Centar",
    lat: 45.80861,
    lng: 15.97029,
    aliases: ["adu", "akademija dramske umjetnosti", "akademija dramskih umjetnosti"]
  }
];
function initials2(value) {
  return fold(value).split(/[\s-]+/).filter((word) => word.length > 2).map((word) => word[0]).join("");
}
function wordStarts(text, token) {
  return text.split(" ").some((word) => word.startsWith(token));
}
function scorePlace(place, query) {
  const title = fold(place.title);
  const aliases = place.aliases.map((alias) => fold(alias));
  const hay = [title, ...aliases];
  if (hay.some((item) => item === query)) return 1e3;
  if (!query.includes(" ") && initials2(place.title) === query) return 900;
  if (hay.some((item) => item.startsWith(query) || wordStarts(item, query))) return 700;
  const tokens = query.split(" ").filter((token) => token.length >= 3);
  if (tokens.length > 1 && tokens.every((token) => hay.some((item) => wordStarts(item, token)))) return 500;
  return 0;
}
function searchPlaces(query) {
  const folded = fold(query).replace(/\s+/g, " ").trim();
  if (folded.length < 2) return [];
  return PLACES.map((place) => ({ place, score: scorePlace(place, folded) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(({ place }) => ({
    label: place.title,
    title: place.title,
    subtitle: `${place.subtitle}, Zagreb`,
    lat: place.lat,
    lng: place.lng
  }));
}

// src/lib/messages.ts
var SEARCH_UNAVAILABLE = "Pretraga trenutno nije dostupna";

// src/api/geocode.ts
var SearchUnavailableError = class extends Error {
  constructor() {
    super(SEARCH_UNAVAILABLE);
    this.name = "SearchUnavailableError";
  }
};
var cache = /* @__PURE__ */ new Map();
var active = null;
function photonRoot() {
  const runtime = globalThis;
  const fromServer = runtime.process?.env?.PHOTON_URL?.trim();
  if (fromServer) return fromServer;
  const configured = import.meta.env?.VITE_PHOTON_URL?.trim();
  if (configured) return configured;
  return "https://photon.komoot.io";
}
function searchUrl(query, bias, layer) {
  const root = photonRoot().replace(/\/$/, "");
  const url = new URL(root.endsWith("/api") ? root : `${root}/api/`);
  const box = searchBBox(parseAddressQuery(query));
  url.searchParams.set("q", query);
  url.searchParams.set("lat", String(bias.lat));
  url.searchParams.set("lon", String(bias.lng));
  url.searchParams.set("bbox", `${box.west},${box.south},${box.east},${box.north}`);
  url.searchParams.set("limit", "15");
  url.searchParams.set("lang", "default");
  if (layer) url.searchParams.set("layer", layer);
  return url.toString();
}
function remember(key, results) {
  cache.delete(key);
  cache.set(key, results);
  while (cache.size > 40) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}
function combineSignals2(signals) {
  const any = AbortSignal.any;
  if (any) return any.call(AbortSignal, signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
async function fetchFeatures(url, signal) {
  const timeout = AbortSignal.timeout(8e3);
  const combined = combineSignals2([signal, timeout]);
  let response;
  try {
    response = await fetch(url, { signal: combined });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SearchUnavailableError();
  }
  if (response.status === 429 || response.status >= 500) throw new SearchUnavailableError();
  if (!response.ok) throw new SearchUnavailableError();
  const payload = await response.json();
  return payload.features ?? [];
}
function mergeResults(local, remote) {
  const merged = [...local];
  for (const item of remote) {
    const same = merged.some(
      (existing) => Math.abs(existing.lat - item.lat) < 8e-4 && Math.abs(existing.lng - item.lng) < 8e-4
    );
    if (!same) merged.push(item);
  }
  return merged.slice(0, 8);
}
function hitsFrom(features) {
  const hits = [];
  for (const feature of features) {
    const hit = hitFromPhoton(feature.properties, feature.geometry?.coordinates);
    if (hit) hits.push(hit);
  }
  return hits;
}
async function geocode(query, options) {
  const parsed = parseAddressQuery(query);
  const local = searchPlaces(parsed.house ? `${parsed.street} ${parsed.house}` : parsed.text);
  if (parsed.text.length < 3) return local;
  if (!parsed.house && local.length >= 3) return local;
  const bias = options?.bias ?? ZAGREB_CENTER;
  if (parsed.house) {
    const indexed = searchIndexedHouses(parsed, bias);
    if (indexed?.length) {
      const merged = mergeResults(local, indexed);
      const key2 = `${parsed.text}|${parsed.house}|${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}`;
      remember(key2, merged);
      return merged;
    }
  }
  const key = `${parsed.text}|${parsed.house ?? ""}|${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}`;
  const cached2 = cache.get(key);
  if (cached2) return cached2;
  active?.abort();
  const controller = new AbortController();
  active = controller;
  const parent = options?.signal;
  const onParent = () => controller.abort();
  parent?.addEventListener("abort", onParent);
  try {
    if (parsed.house && !houseIndexReady()) {
      try {
        const official = await searchOfficialHouses(parsed, bias, controller.signal);
        if (controller.signal.aborted) throw new DOMException("Otkazano", "AbortError");
        if (official.length) {
          const merged = mergeResults(local, official);
          remember(key, merged);
          return merged;
        }
      } catch (error) {
        if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
        if (!(error instanceof OfficialAddressError)) throw error;
      }
    }
    const features = await fetchFeatures(
      searchUrl(parsed.text, bias, parsed.house ? "house" : void 0),
      controller.signal
    );
    if (controller.signal.aborted) throw new DOMException("Otkazano", "AbortError");
    const results = mergeResults(local, rankHits(hitsFrom(features), parsed, bias));
    if (results.length) remember(key, results);
    return results;
  } finally {
    parent?.removeEventListener("abort", onParent);
    if (active === controller) active = null;
  }
}

// server/app.ts
var DEFAULTS = {
  VALHALLA_URL: "https://valhalla1.openstreetmap.de",
  NEXTBIKE_URL: "https://maps.nextbike.net/maps/nextbike-live.json?city=1172&domains=hd&list_cities=0&bikes=0",
  PHOTON_URL: "https://photon.komoot.io"
};
var memory = /* @__PURE__ */ new Map();
function readEnv(source, key) {
  const bound = source?.[key];
  if (typeof bound === "string" && bound.trim()) return bound.trim();
  if (typeof process !== "undefined" && process.env[key]?.trim()) return process.env[key].trim();
  return DEFAULTS[key];
}
async function cached(key, ttlMs, load) {
  const hit = memory.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.body;
  try {
    const body = JSON.stringify(await load());
    memory.set(key, { expires: now + ttlMs, body });
    return body;
  } catch (error) {
    if (hit) return hit.body;
    throw error;
  }
}
var api = new Hono3();
api.use("/api/*", cors());
api.get("/api/health", (c) => c.json({ ok: true, service: "bikebr" }));
api.get("/api/bajs", async (c) => {
  const url = readEnv(c.env, "NEXTBIKE_URL");
  try {
    const body = await cached("bajs", 3e4, async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(12e3) });
      if (!response.ok) throw new Error(`Nextbike ${response.status}`);
      const payload = await response.json();
      return {
        stations: normalizeNextbike(payload),
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        source: "proxy"
      };
    });
    return c.body(body, 200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30"
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Stanice Bajsa trenuta\u010Dno nisu dostupne." }, 502);
  }
});
api.get("/api/geocode", async (c) => {
  const query = (c.req.query("q") ?? "").trim().slice(0, 120);
  if (query.length < 3) return c.json({ results: [] });
  try {
    const results = await geocode(query, { bias: ZAGREB_CENTER });
    return c.json({ results }, 200, { "cache-control": "public, max-age=60" });
  } catch (error) {
    if (!(error instanceof SearchUnavailableError)) console.error(error);
    const message = error instanceof Error ? error.message : "Pretraga trenutno nije dostupna";
    return c.json({ error: message, results: [] }, 503);
  }
});
api.post("/api/valhalla/:action", async (c) => {
  const action = c.req.param("action");
  if (action !== "route" && action !== "sources_to_targets") {
    return c.json({ error: "Nepodr\u017Eana akcija rutiranja." }, 404);
  }
  const upstream = readEnv(c.env, "VALHALLA_URL").replace(/\/$/, "");
  const payload = await c.req.text();
  try {
    const response = await fetch(`${upstream}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(12e3)
    });
    const body = await response.text();
    return c.body(body, response.status, { "content-type": "application/json; charset=utf-8" });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Poslu\u017Eitelj za rutiranje nije dostupan." }, 502);
  }
});

// server/vercel.ts
function isWebRequest(value) {
  return typeof Request !== "undefined" && value instanceof Request;
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function toRequest(req) {
  if (isWebRequest(req)) return req;
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `https://${host}`);
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    body: hasBody ? await readBody(req) : void 0
  });
}
function write(res, response) {
  return response.arrayBuffer().then((buffer) => {
    const bytes = Buffer.from(buffer);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length") return;
      res.setHeader(key, value);
    });
    res.setHeader("content-length", String(bytes.length));
    res.end(bytes);
  });
}
function handler(req, res) {
  toRequest(req).then((request) => api.fetch(request)).then((response) => write(res, response)).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    res.end("error");
  });
}
export {
  handler as default
};
