export const AWS_OAC_CONTENT_SHA256_HEADER = 'x-amz-content-sha256';
export const AWS_OAC_FORM_MARKER_ATTRIBUTE = 'data-facetheory-oac-form';
export const AWS_OAC_URL_ENCODED_FORM_ENCODING =
  'application/x-www-form-urlencoded';
export const AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE = `${AWS_OAC_URL_ENCODED_FORM_ENCODING};charset=UTF-8`;

export type AwsOacFormField = readonly [name: string, value: string];
export type AwsOacRequestBody = Uint8Array<ArrayBuffer>;
export type AwsOacFormTransportMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AwsOacFormEncoding =
  | typeof AWS_OAC_URL_ENCODED_FORM_ENCODING
  | 'multipart/form-data'
  | 'text/plain'
  | (string & {});
export type AwsOacSha256Digest = (
  body: AwsOacRequestBody,
) => Promise<ArrayBuffer | ArrayBufferView>;

export interface AwsOacUrlEncodedFormBody {
  body: AwsOacRequestBody;
  bodyText: string;
  contentType: typeof AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE;
  fields: AwsOacFormField[];
}

export interface AwsOacUrlEncodedFormPayload extends AwsOacUrlEncodedFormBody {
  sha256Hex: string;
}

export interface CollectAwsOacFormFieldsOptions {
  submitter?: HTMLElement | null;
}

export interface CreateAwsOacUrlEncodedFormPayloadOptions extends CollectAwsOacFormFieldsOptions {
  digest?: AwsOacSha256Digest;
}

export interface AwsOacFormTransportResponseContext {
  action: URL;
  event: SubmitEvent;
  form: HTMLFormElement;
  method: AwsOacFormTransportMethod;
  payload: AwsOacUrlEncodedFormPayload;
  response: Response;
  submitter: HTMLElement | null;
}

export type AwsOacFormNavigationKind = 'redirect' | 'replace-document';

export interface AwsOacFormTransportNavigationContext extends AwsOacFormTransportResponseContext {
  finalUrl: URL;
  html: string | null;
  navigation: AwsOacFormNavigationKind;
}

export interface AwsOacFormTransportErrorContext {
  action: URL | null;
  event: SubmitEvent;
  form: HTMLFormElement | null;
  method: string | null;
  submitter: HTMLElement | null;
}

export interface StartAwsOacFormTransportOptions {
  allowedMethods?: Iterable<AwsOacFormTransportMethod>;
  allowedOrigin?: string | URL;
  digest?: AwsOacSha256Digest;
  document?: Document;
  fetcher?: typeof fetch;
  markerAttribute?: string;
  onError?: (
    error: unknown,
    context: AwsOacFormTransportErrorContext,
  ) => void | Promise<void>;
  onNavigate?: (
    context: AwsOacFormTransportNavigationContext,
  ) => boolean | void | Promise<boolean | void>;
  onResponse?: (
    response: Response,
    context: AwsOacFormTransportResponseContext,
  ) => void | Promise<void>;
  requestInit?: RequestInit;
  window?: Window;
}

export interface AwsOacFormTransportController {
  stop: () => void;
}

type FormDataConstructor = {
  new (form?: HTMLFormElement, submitter?: HTMLElement | null): FormData;
};

const DEFAULT_AWS_OAC_FORM_METHODS = new Set<AwsOacFormTransportMethod>([
  'POST',
]);
const NON_NATIVE_MUTATING_METHODS = new Set(['PUT', 'PATCH', 'DELETE']);

export function collectAwsOacFormFields(
  form: HTMLFormElement,
  options: CollectAwsOacFormFieldsOptions = {},
): AwsOacFormField[] {
  const formData = createFormData(form, options.submitter ?? null);
  const fields: AwsOacFormField[] = [];

  for (const [name, value] of formData.entries()) {
    if (typeof value !== 'string') {
      throw new TypeError(
        `FaceTheory OAC form transport only supports string application/x-www-form-urlencoded fields; received non-string value for ${JSON.stringify(
          name,
        )}`,
      );
    }
    fields.push([name, value]);
  }

  return fields;
}

export function createAwsOacUrlEncodedFormBody(
  fields: Iterable<AwsOacFormField>,
): AwsOacUrlEncodedFormBody {
  const normalizedFields = Array.from(
    fields,
    ([name, value]) => [name, value] as AwsOacFormField,
  );
  const params = new URLSearchParams();
  for (const [name, value] of normalizedFields) {
    params.append(name, value);
  }
  const bodyText = params.toString();
  const body = new TextEncoder().encode(bodyText);

  return {
    body,
    bodyText,
    contentType: AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE,
    fields: normalizedFields,
  };
}

export async function createAwsOacUrlEncodedFormPayload(
  form: HTMLFormElement,
  options: CreateAwsOacUrlEncodedFormPayloadOptions = {},
): Promise<AwsOacUrlEncodedFormPayload> {
  const fields = collectAwsOacFormFields(form, options);
  const encoded = createAwsOacUrlEncodedFormBody(fields);
  const sha256Hex = await sha256HexForAwsOacPayload(
    encoded.body,
    options.digest,
  );

  return {
    ...encoded,
    sha256Hex,
  };
}

export async function sha256HexForAwsOacPayload(
  body: AwsOacRequestBody,
  digest: AwsOacSha256Digest = subtleSha256Digest,
): Promise<string> {
  return bytesToHex(toUint8Array(await digest(body)));
}

export function startAwsOacFormTransport(
  options: StartAwsOacFormTransportOptions = {},
): AwsOacFormTransportController {
  const doc = options.document ?? resolveCurrentDocument();
  const win = options.window ?? doc.defaultView ?? resolveCurrentWindow();
  const markerAttribute =
    options.markerAttribute ?? AWS_OAC_FORM_MARKER_ATTRIBUTE;
  const allowedOrigin = resolveAllowedOrigin(options.allowedOrigin, win);
  const allowedMethods = resolveAllowedMethods(options.allowedMethods);
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (typeof fetcher !== 'function') {
    throw new Error(
      'FaceTheory OAC form transport requires fetch in the current environment',
    );
  }

  const reportError = async (
    error: unknown,
    context: AwsOacFormTransportErrorContext,
  ): Promise<void> => {
    if (options.onError) {
      await options.onError(error, context);
      return;
    }
    console.error('FaceTheory OAC form transport failed', error);
  };

  const handleSubmit = (event: Event): void => {
    if (event.defaultPrevented) return;

    const submitEvent = event as SubmitEvent;
    const form = readSubmitForm(submitEvent);
    if (!form?.hasAttribute(markerAttribute)) return;

    const submitter = readSubmitter(submitEvent);
    const method = resolveFormMethod(form, submitter);

    if (method === 'GET' || method === 'DIALOG') return;

    const baseContext: AwsOacFormTransportErrorContext = {
      action: null,
      event: submitEvent,
      form,
      method,
      submitter,
    };

    if (!isKnownMutatingMethod(method)) {
      event.preventDefault();
      void reportError(
        new Error(
          `FaceTheory OAC form transport does not support ${method} forms`,
        ),
        baseContext,
      );
      return;
    }

    if (!allowedMethods.has(method)) {
      event.preventDefault();
      void reportError(
        new Error(
          `FaceTheory OAC form transport requires ${method} to be explicitly enabled in allowedMethods`,
        ),
        baseContext,
      );
      return;
    }

    const action = resolveFormAction(form, submitter, win);
    const context = { ...baseContext, action, method };
    const encoding = resolveFormEncoding(form, submitter);

    if (encoding !== AWS_OAC_URL_ENCODED_FORM_ENCODING) {
      event.preventDefault();
      void reportError(
        new Error(
          `FaceTheory OAC form transport only supports application/x-www-form-urlencoded forms; received ${encoding}`,
        ),
        context,
      );
      return;
    }

    if (action.origin !== allowedOrigin) {
      event.preventDefault();
      void reportError(
        new Error(
          `FaceTheory OAC form transport requires same-origin actions: expected ${allowedOrigin}, received ${action.origin}`,
        ),
        context,
      );
      return;
    }

    event.preventDefault();

    if (!passesConstraintValidation(form, submitter)) return;

    void submitForm({
      action,
      allowedOrigin,
      event: submitEvent,
      fetcher,
      form,
      method,
      options,
      submitter,
      window: win,
    }).catch((error) => {
      void reportError(error, context);
    });
  };

  doc.addEventListener('submit', handleSubmit);

  return {
    stop: () => {
      doc.removeEventListener('submit', handleSubmit);
    },
  };
}

function createFormData(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): FormData {
  const view = form.ownerDocument.defaultView as
    | (Window & { FormData?: FormDataConstructor })
    | null;
  const FormDataCtor: FormDataConstructor | undefined =
    view?.FormData ?? globalThis.FormData;

  if (typeof FormDataCtor !== 'function') {
    throw new Error(
      'FaceTheory OAC form helpers require FormData in the current environment',
    );
  }

  if (submitter) {
    return new FormDataCtor(form, submitter);
  }

  return new FormDataCtor(form);
}

interface SubmitAwsOacFormInput {
  action: URL;
  allowedOrigin: string;
  event: SubmitEvent;
  fetcher: typeof fetch;
  form: HTMLFormElement;
  method: AwsOacFormTransportMethod;
  options: StartAwsOacFormTransportOptions;
  submitter: HTMLElement | null;
  window: Window;
}

async function submitForm(input: SubmitAwsOacFormInput): Promise<void> {
  const payloadOptions: CreateAwsOacUrlEncodedFormPayloadOptions = {
    submitter: input.submitter,
  };
  if (input.options.digest !== undefined)
    payloadOptions.digest = input.options.digest;

  const payload = await createAwsOacUrlEncodedFormPayload(
    input.form,
    payloadOptions,
  );
  const headers = new Headers(input.options.requestInit?.headers);
  if (!headers.has('accept'))
    headers.set('accept', 'text/html,application/xhtml+xml');
  headers.set('content-type', payload.contentType);
  headers.set(AWS_OAC_CONTENT_SHA256_HEADER, payload.sha256Hex);

  const response = await input.fetcher(input.action.toString(), {
    ...input.options.requestInit,
    body: payload.body,
    credentials: 'same-origin',
    headers,
    method: input.method,
  });

  const context: AwsOacFormTransportResponseContext = {
    action: input.action,
    event: input.event,
    form: input.form,
    method: input.method,
    payload,
    response,
    submitter: input.submitter,
  };

  if (input.options.onResponse) {
    await input.options.onResponse(response, context);
    return;
  }

  await applyDefaultNavigationPolicy(input, context);
}

async function applyDefaultNavigationPolicy(
  input: SubmitAwsOacFormInput,
  context: AwsOacFormTransportResponseContext,
): Promise<void> {
  const finalUrl = resolveResponseUrl(context.response, input.action);
  if (finalUrl.origin !== input.allowedOrigin) {
    throw new Error(
      `FaceTheory OAC form transport rejected cross-origin response URL: expected ${input.allowedOrigin}, received ${finalUrl.origin}`,
    );
  }

  if (
    context.response.redirected ||
    finalUrl.toString() !== input.action.toString()
  ) {
    const navigationContext: AwsOacFormTransportNavigationContext = {
      ...context,
      finalUrl,
      html: null,
      navigation: 'redirect',
    };
    if (await customNavigationHandled(input.options, navigationContext)) return;
    input.window.location.assign(finalUrl.toString());
    return;
  }

  if (isHtmlResponse(context.response)) {
    const html = await context.response.text();
    const navigationContext: AwsOacFormTransportNavigationContext = {
      ...context,
      finalUrl,
      html,
      navigation: 'replace-document',
    };
    if (await customNavigationHandled(input.options, navigationContext)) return;
    replaceDocument(input.form.ownerDocument, input.window, html, finalUrl);
    return;
  }

  if (!context.response.ok) {
    throw new Error(
      `FaceTheory OAC form transport failed (${context.response.status}) for ${input.action.toString()}`,
    );
  }
}

async function customNavigationHandled(
  options: StartAwsOacFormTransportOptions,
  context: AwsOacFormTransportNavigationContext,
): Promise<boolean> {
  if (!options.onNavigate) return false;
  return (await options.onNavigate(context)) !== false;
}

function resolveResponseUrl(response: Response, fallback: URL): URL {
  return new URL(response.url || fallback.toString(), fallback);
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return (
    contentType.startsWith('text/html') ||
    contentType.startsWith('application/xhtml+xml')
  );
}

function replaceDocument(
  doc: Document,
  win: Window,
  html: string,
  finalUrl: URL,
): void {
  doc.open();
  doc.write(html);
  doc.close();

  if (finalUrl.toString() !== win.location.href) {
    win.history.replaceState({}, '', finalUrl);
  }
}

async function subtleSha256Digest(
  body: AwsOacRequestBody,
): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'FaceTheory OAC form hashing requires crypto.subtle in the current environment',
    );
  }

  return subtle.digest('SHA-256', copyArrayBuffer(body));
}

function resolveCurrentDocument(): Document {
  if (typeof document === 'undefined') {
    throw new Error(
      'FaceTheory OAC form transport requires document in the current environment',
    );
  }
  return document;
}

function resolveCurrentWindow(): Window {
  if (typeof window === 'undefined') {
    throw new Error(
      'FaceTheory OAC form transport requires window in the current environment',
    );
  }
  return window;
}

function resolveAllowedOrigin(
  origin: string | URL | undefined,
  win: Window,
): string {
  if (origin === undefined) return win.location.origin;
  return new URL(String(origin), win.location.href).origin;
}

function resolveAllowedMethods(
  methods: Iterable<AwsOacFormTransportMethod> | undefined,
): ReadonlySet<AwsOacFormTransportMethod> {
  if (methods === undefined) return DEFAULT_AWS_OAC_FORM_METHODS;

  const allowed = new Set<AwsOacFormTransportMethod>();
  for (const method of methods) {
    allowed.add(method.toUpperCase() as AwsOacFormTransportMethod);
  }
  return allowed;
}

function readSubmitForm(event: SubmitEvent): HTMLFormElement | null {
  const target = event.target;
  if (isHtmlFormElement(target)) return target;
  return null;
}

function readSubmitter(event: SubmitEvent): HTMLElement | null {
  const candidate = event.submitter;
  if (isHTMLElement(candidate)) return candidate;
  return null;
}

function resolveFormAction(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
  win: Window,
): URL {
  const rawAction =
    submitter?.getAttribute('formaction') ?? form.getAttribute('action') ?? '';
  return new URL(rawAction || win.location.href, win.location.href);
}

function resolveFormMethod(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): string {
  const rawMethod =
    submitter?.getAttribute('formmethod') ??
    form.getAttribute('method') ??
    'GET';
  return rawMethod.trim().toUpperCase() || 'GET';
}

function resolveFormEncoding(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): AwsOacFormEncoding {
  const submitterEncoding = submitter?.getAttribute('formenctype');
  if (submitterEncoding !== null && submitterEncoding !== undefined) {
    return normalizeFormEncoding(submitterEncoding);
  }

  const formEncoding = form.getAttribute('enctype');
  if (formEncoding !== null) return normalizeFormEncoding(formEncoding);

  return AWS_OAC_URL_ENCODED_FORM_ENCODING;
}

function normalizeFormEncoding(
  value: string | null | undefined,
): AwsOacFormEncoding {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return AWS_OAC_URL_ENCODED_FORM_ENCODING;
  if (
    normalized === AWS_OAC_URL_ENCODED_FORM_ENCODING ||
    normalized === 'multipart/form-data' ||
    normalized === 'text/plain'
  ) {
    return normalized;
  }
  return normalized as AwsOacFormEncoding;
}

function isKnownMutatingMethod(
  method: string,
): method is AwsOacFormTransportMethod {
  return method === 'POST' || NON_NATIVE_MUTATING_METHODS.has(method);
}

function passesConstraintValidation(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): boolean {
  if (form.noValidate || submitter?.hasAttribute('formnovalidate')) return true;
  if (typeof form.reportValidity === 'function') return form.reportValidity();
  if (typeof form.checkValidity === 'function') return form.checkValidity();
  return true;
}

function isHtmlFormElement(value: unknown): value is HTMLFormElement {
  return isHTMLElement(value) && value.tagName.toLowerCase() === 'form';
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { tagName?: unknown }).tagName === 'string' &&
    typeof (value as { hasAttribute?: unknown }).hasAttribute === 'function'
  );
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function toUint8Array(bytes: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
